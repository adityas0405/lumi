import { createHash } from "node:crypto";
import { getDb, llmCache } from "@lumi/db";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getProvider } from "./config";
import type { JsonRequest, JsonResponse } from "./provider";
import { toJsonSchema } from "./schema";

/** Bump when prompts change meaningfully, to invalidate cached outputs. */
export const PROMPT_VERSION = "2026-09-29.1";

/**
 * Structured call with a content-addressed cache: the same prompt, evidence and
 * model always return the stored answer, so demo resets are fast, free and repeatable.
 * `variant` lets callers deliberately bypass a cached answer (e.g. a regeneration).
 */
export async function cachedJson<S extends z.ZodType>(
  req: JsonRequest<S>,
  opts: { variant?: string; bypass?: boolean } = {},
): Promise<JsonResponse<z.infer<S>>> {
  const provider = getProvider();
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        PROMPT_VERSION,
        provider.name,
        req.model,
        req.effort,
        req.purpose,
        req.system,
        req.input,
        toJsonSchema(req.schema),
        opts.variant ?? "",
      ]),
    )
    .digest("hex");
  const db = getDb();

  if (!opts.bypass) {
    const hit = await db.query.llmCache.findFirst({ where: eq(llmCache.key, key) });
    if (hit) {
      const parsed = req.schema.safeParse(hit.response);
      if (parsed.success) {
        return {
          data: parsed.data,
          model: hit.model,
          provider: provider.name,
          usage: { inputTokens: null, outputTokens: null },
          cached: true,
        };
      }
    }
  }

  const res = await provider.generateJson(req);
  await db
    .insert(llmCache)
    .values({
      key,
      model: res.model,
      purpose: req.purpose,
      response: res.data as object,
      usage: res.usage,
    })
    .onConflictDoUpdate({
      target: llmCache.key,
      set: { response: res.data as object, usage: res.usage },
    });
  return { ...res, cached: false };
}
