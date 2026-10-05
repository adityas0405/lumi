import type { z } from "zod";

export type Purpose = "triage" | "story" | "qa" | "digest";
export type Effort = "low" | "medium" | "high";

export interface JsonRequest<S extends z.ZodType> {
  purpose: Purpose;
  model: string;
  /** Tried in order when `model` is overloaded or out of quota. */
  fallbacks?: string[];
  system: string;
  input: string;
  schema: S;
  effort: Effort;
  maxOutputTokens?: number;
}

export interface JsonResponse<T> {
  data: T;
  model: string;
  provider: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  cached: boolean;
}

/** One structured-output call. Implementations must not let the vendor store or train on inputs. */
export interface LlmProvider {
  readonly name: string;
  generateJson<S extends z.ZodType>(
    req: JsonRequest<S>,
  ): Promise<Omit<JsonResponse<z.infer<S>>, "cached">>;
}

export class LlmOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "LlmOutputError";
  }
}
