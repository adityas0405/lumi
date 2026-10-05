import { describe, expect, it } from "vitest";
import { detectRevert, heldUpSide } from "../src/outcomes";

describe("detectRevert", () => {
  it("reads git revert commit messages", () => {
    expect(
      detectRevert({
        title: 'Revert "Zone-based express shipping rates"',
        body: "",
        commitMessages: [
          'Revert "Zone-based express shipping rates"\n\nThis reverts commit 7797DDA1f0c2b3a4d5e6f708192a3b4c5d6e7f80.',
        ],
      }),
    ).toEqual({ shas: ["7797dda1f0c2b3a4d5e6f708192a3b4c5d6e7f80"], prNumbers: [] });
  });

  it("reads GitHub's Revert button and Lumi's rollback bodies", () => {
    expect(
      detectRevert({
        title: "x",
        body: "Reverts adityas0405/lumi-demo-checkout#52",
        commitMessages: [],
      }),
    ).toEqual({ shas: [], prNumbers: [52] });
    expect(
      detectRevert({
        title: "x",
        body: "Rolls back #52, the suspected cause of a production incident.",
        commitMessages: [],
      }),
    ).toEqual({ shas: [], prNumbers: [52] });
  });

  it("ignores a revert title with nothing to link it to", () => {
    expect(
      detectRevert({
        title: 'Revert "Refactor cart"',
        body: "Undo this.",
        commitMessages: ["wip"],
      }),
    ).toBeNull();
  });
});

describe("heldUpSide", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const base = { now, days: 3, headChangedAt: daysAgo(10) };

  it("flags work waiting on the reviewer", () => {
    expect(heldUpSide({ ...base, readySince: daysAgo(4), latestDecision: null })).toBe("reviewer");
    expect(heldUpSide({ ...base, readySince: daysAgo(1), latestDecision: null })).toBeNull();
  });

  it("flags work waiting on the agent until it pushes again", () => {
    const asked = { kind: "request_changes", at: daysAgo(5) };
    expect(heldUpSide({ ...base, readySince: daysAgo(9), latestDecision: asked })).toBe("agent");
    expect(
      heldUpSide({
        ...base,
        headChangedAt: daysAgo(1),
        readySince: daysAgo(9),
        latestDecision: asked,
      }),
    ).toBeNull();
  });

  it("never flags decided work", () => {
    expect(
      heldUpSide({
        ...base,
        readySince: daysAgo(9),
        latestDecision: { kind: "approve", at: daysAgo(8) },
      }),
    ).toBeNull();
  });
});
