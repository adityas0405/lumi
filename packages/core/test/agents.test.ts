import { describe, expect, it } from "vitest";
import { detectAgent } from "../src/agents";

const base = {
  authorLogin: "adityas0405",
  branch: "main",
  labels: [],
  commitMessages: [],
  body: "",
};

describe("detectAgent", () => {
  it("prefers an explicit label over other signals", () => {
    expect(detectAgent({ ...base, labels: ["agent: devin"], branch: "cursor/x" }).agent).toBe(
      "devin",
    );
  });
  it("detects bot authors", () => {
    expect(detectAgent({ ...base, authorLogin: "devin-ai-integration[bot]" })).toEqual({
      agent: "devin",
      via: "bot author @devin-ai-integration[bot]",
    });
  });
  it("detects commit trailers", () => {
    const msg = "Fix rounding\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
    expect(detectAgent({ ...base, commitMessages: [msg] }).agent).toBe("claude-code");
  });
  it("falls back to branch prefix", () => {
    expect(detectAgent({ ...base, branch: "cursor/totals-cache" }).agent).toBe("cursor");
    expect(detectAgent({ ...base, branch: "claude/tax-rounding" }).agent).toBe("claude-code");
  });
  it("returns unknown without a signal", () => {
    expect(detectAgent(base)).toEqual({ agent: "unknown", via: "no agent signal" });
  });
});
