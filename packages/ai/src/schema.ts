import { z } from "zod";

/**
 * Converts a zod schema to the JSON Schema subset structured-output APIs accept:
 * no $schema, no string patterns or formats beyond the basics.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return strip(json) as Record<string, unknown>;
}

const DROP = new Set([
  "$schema",
  "pattern",
  "minLength",
  "maxLength",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "default",
]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!DROP.has(k)) out[k] = strip(v);
    return out;
  }
  return value;
}
