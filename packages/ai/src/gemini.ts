import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { type JsonRequest, LlmOutputError, type LlmProvider } from "./provider";
import { toJsonSchema } from "./schema";

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 3;
const REQUEST_TIMEOUT_MS = Number(process.env.LUMI_LLM_TIMEOUT_MS ?? 180_000);

/** HTTP status from any of the SDK's error shapes (ApiError.status, Interactions errors' statusCode). */
function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; statusCode?: unknown };
  const s =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : null;
  return s;
}

/** Seconds the API asked us to wait ("Please retry in 28s"), if it said. */
function retryAfterSeconds(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const m = /retry in ([\d.]+)s/i.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * Spaces calls per model to stay under per-minute limits (5 RPM on the free tier).
 * Process-local: the worker is a single process.
 */
const MIN_INTERVAL_MS = 60_000 / Number(process.env.LUMI_LLM_RPM ?? 4);
const nextSlot = new Map<string, number>();
async function paced(model: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(model) ?? 0);
  nextSlot.set(model, slot + MIN_INTERVAL_MS);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

/** Models that hit a daily cap in this process; skipped until the timestamp passes. */
const exhaustedUntil = new Map<string, number>();
const EXHAUSTED_BACKOFF_MS = 60 * 60 * 1000;

/** A 429 that won't clear by waiting: a daily cap or a model the tier can't use at all. */
function quotaExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /per day|limit: 0\b/i.test(message);
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.client = new GoogleGenAI({ apiKey });
  }

  private async once<S extends z.ZodType>(
    req: JsonRequest<S>,
    model: string,
    schema: Record<string, unknown>,
  ) {
    const started = Date.now();
    const interaction = await this.client.interactions.create(
      {
        model,
        system_instruction: req.system,
        input: req.input,
        // Customer code: never keep interactions on Google's side.
        store: false,
        response_format: { type: "text", mime_type: "application/json", schema },
        generation_config: {
          thinking_level: req.effort,
          max_output_tokens: req.maxOutputTokens ?? 32_000,
        },
      },
      // A stuck request fails and is retried or falls back, instead of stalling the pipeline.
      { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 },
    );
    if (process.env.LUMI_LLM_DEBUG) {
      console.error(
        `[gemini] ${req.purpose} ${model} ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    }
    const raw = interaction.output_text ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new LlmOutputError(`${req.purpose}: model returned invalid JSON`, raw);
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) {
      throw new LlmOutputError(
        `${req.purpose}: output did not match schema: ${result.error.message.slice(0, 500)}`,
        raw,
      );
    }
    const usage = interaction.usage;
    return {
      data: result.data as z.infer<S>,
      model,
      provider: this.name,
      usage: {
        inputTokens: usage?.total_input_tokens ?? null,
        outputTokens: usage?.total_output_tokens ?? null,
      },
    };
  }

  async generateJson<S extends z.ZodType>(req: JsonRequest<S>) {
    const schema = toJsonSchema(req.schema);
    const models = [req.model, ...(req.fallbacks ?? [])];
    let lastError: unknown;
    const available = models.filter((m) => (exhaustedUntil.get(m) ?? 0) < Date.now());
    for (const model of available.length ? available : models) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
        try {
          await paced(model);
          return await this.once(req, model, schema);
        } catch (err) {
          lastError = err;
          const status = statusOf(err);
          if (process.env.LUMI_LLM_DEBUG) {
            const why = err instanceof Error ? err.message.slice(0, 120) : String(err);
            console.error(
              `[gemini] ${req.purpose} ${model} attempt ${attempt + 1} failed: ${status ?? ""} ${why}`,
            );
          }
          if (status === 429 && quotaExhausted(err)) {
            exhaustedUntil.set(model, Date.now() + EXHAUSTED_BACKOFF_MS);
            break;
          }
          const retryable =
            (status !== null && RETRYABLE.has(status)) || err instanceof LlmOutputError;
          if (!retryable) throw err;
          // Overload: move to the next model after a couple of tries instead of waiting it out.
          if (status === 503 && attempt >= 1) break;
          const hinted = retryAfterSeconds(err);
          const waitMs =
            hinted !== null && hinted <= 90
              ? hinted * 1000 + 1000
              : 1500 * 2 ** attempt + Math.random() * 500;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }
    throw lastError;
  }
}
