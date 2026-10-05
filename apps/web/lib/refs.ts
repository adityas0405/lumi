import { parseRef } from "@lumi/core";

/** The narrowest of a finding's citations: the line itself, not the whole hunk. */
export function narrowest(refs: string[]): string | undefined {
  const span = (r: string) => {
    const p = parseRef(r);
    return p?.type === "diff" ? p.end - p.start : Number.MAX_SAFE_INTEGER;
  };
  return [...refs].sort((a, b) => span(a) - span(b))[0];
}
