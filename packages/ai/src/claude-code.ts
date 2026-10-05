import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { type JsonRequest, type JsonResponse, LlmOutputError, type LlmProvider } from "./provider";
import { toJsonSchema } from "./schema";

/**
 * Local-only provider: runs headless Claude Code (`claude -p`) on the developer's
 * own Claude login. For personal development on this machine only. Anthropic does
 * not allow a subscription to power a product other people use; switch to an API
 * key (LUMI_LLM_PROVIDER=anthropic) before anyone else relies on Lumi.
 *
 * Each call runs in an empty directory with no tools, settings, MCP servers or
 * skills, so the model sees only Lumi's prompt.
 */
export class ClaudeCodeProvider implements LlmProvider {
  readonly name = "claude-code";
  private readonly cwd = mkdtempSync(join(tmpdir(), "lumi-claude-"));
  private readonly bin = process.env.LUMI_CLAUDE_BIN ?? "claude";
  private readonly timeoutMs = Number(process.env.LUMI_LLM_TIMEOUT_MS ?? 300_000);

  async generateJson<S extends z.ZodType>(req: JsonRequest<S>) {
    const models = [req.model, ...(req.fallbacks ?? [])];
    let lastError: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.once(req, model);
        } catch (err) {
          lastError = err;
          if (process.env.LUMI_LLM_DEBUG) {
            console.error(
              `[claude-code] ${req.purpose} ${model} attempt ${attempt + 1} failed: ${String(err).slice(0, 200)}`,
            );
          }
        }
      }
    }
    throw lastError;
  }

  private once<S extends z.ZodType>(
    req: JsonRequest<S>,
    model: string,
  ): Promise<Omit<JsonResponse<z.infer<S>>, "cached">> {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      "--effort",
      req.effort,
      "--json-schema",
      JSON.stringify(toJsonSchema(req.schema)),
      "--system-prompt",
      req.system,
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--disable-slash-commands",
    ];
    // Use the CLI's own login, never an API key that happens to be in the environment.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd: this.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude -p timed out after ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        let out: {
          is_error?: boolean;
          structured_output?: unknown;
          result?: string;
          usage?: {
            input_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
            output_tokens?: number;
          };
        };
        try {
          out = JSON.parse(stdout);
        } catch {
          reject(new Error(`claude -p exited ${code}: ${(stderr || stdout).slice(0, 400)}`));
          return;
        }
        if (out.is_error || out.structured_output === undefined) {
          reject(
            new LlmOutputError(
              `${req.purpose}: claude -p returned no structured output`,
              String(out.result ?? stdout).slice(0, 2000),
            ),
          );
          return;
        }
        const parsed = req.schema.safeParse(out.structured_output);
        if (!parsed.success) {
          reject(
            new LlmOutputError(
              `${req.purpose}: output did not match schema: ${parsed.error.message.slice(0, 400)}`,
              JSON.stringify(out.structured_output),
            ),
          );
          return;
        }
        if (process.env.LUMI_LLM_DEBUG) {
          console.error(
            `[claude-code] ${req.purpose} ${model} ${((Date.now() - started) / 1000).toFixed(1)}s`,
          );
        }
        const u = out.usage ?? {};
        resolve({
          data: parsed.data as z.infer<S>,
          model,
          provider: this.name,
          usage: {
            inputTokens:
              (u.input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0) +
              (u.cache_creation_input_tokens ?? 0),
            outputTokens: u.output_tokens ?? null,
          },
        });
      });
      child.stdin.end(req.input);
    });
  }
}
