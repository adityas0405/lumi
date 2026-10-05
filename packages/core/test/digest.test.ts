import { describe, expect, it } from "vitest";
import {
  type DigestScript,
  digestHeadline,
  digestNarration,
  groupByRequest,
  validateDigest,
} from "../src/digest";

const long = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const why = { technical: "Support asked for this.", plain: "Support asked for this." };
const item = (taskId: string, n = 30, w = why) => ({
  taskId,
  why: w,
  technical: [long(n)],
  plain: [long(n)],
});
const script = (over: Partial<DigestScript> = {}): DigestScript => ({
  sections: [
    { kind: "decisions", items: [item("a"), item("b")] },
    { kind: "problems", items: [item("c")] },
    { kind: "highlights", items: [item("d")] },
  ],
  routineLine: {
    technical: "Three routine changes merged.",
    plain: "Three routine changes merged.",
  },
  closing: { technical: "Start with the refund change.", plain: "Start with the refund change." },
  ...over,
});
const candidates = [
  { taskId: "a", section: "decisions" as const },
  { taskId: "b", section: "decisions" as const },
  { taskId: "c", section: "problems" as const },
  { taskId: "d", section: "highlights" as const },
  { taskId: "e", section: "routine" as const },
];

describe("validateDigest", () => {
  it("accepts a digest that covers exactly the chosen tasks in order", () => {
    expect(validateDigest(script(), candidates)).toEqual([]);
  });

  it("catches missing, misplaced, invented and duplicated items", () => {
    const bad = script({
      sections: [
        { kind: "decisions", items: [item("a"), item("c"), item("zzz"), item("a")] },
        { kind: "highlights", items: [item("d")] },
      ],
    });
    const m = validateDigest(bad, candidates).map((i) => i.message);
    expect(m.some((x) => x.includes('belongs in "problems"'))).toBe(true);
    expect(m.some((x) => x.includes("isn't one of the tasks"))).toBe(true);
    expect(m.some((x) => x.includes("appears twice"))).toBe(true);
    expect(m.some((x) => x.includes("Task b (decisions) is missing"))).toBe(true);
  });

  it("keeps problems first and items to 10–20 seconds", () => {
    const reordered = script({ sections: [...script().sections].reverse() });
    expect(
      validateDigest(reordered, candidates).some((i) => i.message.includes("out of order")),
    ).toBe(true);
    const wordy = script({
      sections: [
        { kind: "decisions", items: [item("a", 60), item("b")] },
        { kind: "problems", items: [item("c")] },
        { kind: "highlights", items: [item("d")] },
      ],
    });
    expect(validateDigest(wordy, candidates).some((i) => i.message.includes("10–15 seconds"))).toBe(
      true,
    );
  });

  it("needs a short why line on every item", () => {
    const noWhy = script({
      sections: [
        { kind: "decisions", items: [item("a", 30, { technical: "", plain: "" }), item("b")] },
        { kind: "problems", items: [item("c", 20, { technical: long(16), plain: long(16) })] },
        { kind: "highlights", items: [item("d")] },
      ],
    });
    const m = validateDigest(noWhy, candidates).map((i) => i.message);
    expect(m.some((x) => x.includes("Item a needs a why line"))).toBe(true);
    expect(m.some((x) => x.includes("why line for item c is too long"))).toBe(true);
  });

  it("attributes work with no linked request to the agent", () => {
    const unlinked = candidates.map((c) =>
      c.taskId === "a" ? { ...c, agent: "Cursor", request: null } : c,
    );
    expect(
      validateDigest(script(), unlinked).some((i) =>
        i.message.includes("attribute the description to Cursor"),
      ),
    ).toBe(true);
    const attributed = script({
      sections: [
        {
          kind: "decisions",
          items: [
            item("a", 24, {
              technical: "No request was linked; Cursor calls it a cleanup.",
              plain: "Nobody filed a request; Cursor calls it a cleanup.",
            }),
            item("b"),
          ],
        },
        ...script().sections.slice(1),
      ],
    });
    expect(validateDigest(attributed, unlinked)).toEqual([]);
  });

  it("lets a task that shares the previous item's request skip its why line", () => {
    const grouped = groupByRequest([
      { taskId: "a", section: "decisions", request: 7 },
      { taskId: "x", section: "decisions", request: 9 },
      { taskId: "b", section: "decisions", request: 7 },
    ]);
    expect(grouped.map((c) => [c.taskId, c.sameRequestAs])).toEqual([
      ["a", null],
      ["b", "a"],
      ["x", null],
    ]);
    const ok = script({
      sections: [
        {
          kind: "decisions",
          items: [item("a"), item("b", 30, { technical: "", plain: "" }), item("x")],
        },
      ],
    });
    expect(validateDigest(ok, grouped)).toEqual([]);
    const apart = script({
      sections: [
        {
          kind: "decisions",
          items: [item("a"), item("x"), item("b", 30, { technical: "", plain: "" })],
        },
      ],
    });
    expect(
      validateDigest(apart, grouped).some((i) => i.message.includes("put it right after")),
    ).toBe(true);
  });
});

describe("groupByRequest", () => {
  it("keeps section order and leaves tasks without a request alone", () => {
    const out = groupByRequest([
      { taskId: "h", section: "highlights", request: 3 },
      { taskId: "p", section: "problems", request: 3 },
      { taskId: "d", section: "decisions", request: null },
      { taskId: "e", section: "decisions", request: null },
    ]);
    expect(out.map((c) => c.taskId)).toEqual(["d", "e", "p", "h"]);
    expect(out.every((c) => c.sameRequestAs === null)).toBe(true);
  });
});

describe("digestNarration", () => {
  it("opens with the counts, cites each task's review, and ends with routine work", () => {
    const n = digestNarration(
      script(),
      { technical: "Two decisions need you.", plain: "Two decisions need you." },
      new Map([["a", "task:12"]]),
    );
    expect(n.chapters.map((c) => c.kind)).toEqual([
      "decisions",
      "problems",
      "highlights",
      "routine",
    ]);
    expect(n.chapters[0]!.sentences[0]!.refs).toEqual(["digest:counts"]);
    expect(n.chapters[0]!.sentences[1]!.id).toBe("decisions.a.why");
    expect(n.chapters[0]!.sentences[1]!.refs).toEqual(["review:a", "task:12"]);
    expect(n.chapters[0]!.sentences[2]!.refs).toEqual(["review:a"]);
    expect(n.chapters.at(-1)!.sentences.map((s) => s.id)).toEqual([
      "routine.line",
      "routine.closing",
    ]);
  });

  it("builds a short quiet-day digest", () => {
    const quiet = digestNarration(
      {
        sections: [],
        routineLine: {
          technical: "Two routine changes merged.",
          plain: "Two routine changes merged.",
        },
        closing: { technical: "", plain: "" },
      },
      { technical: "Nothing needs you today.", plain: "Nothing needs you today." },
    );
    expect(quiet.chapters).toHaveLength(1);
    expect(quiet.chapters[0]!.sentences.map((s) => s.id)).toEqual([
      "routine.intro",
      "routine.line",
    ]);
  });
});

describe("digestHeadline", () => {
  it("counts from data", () => {
    expect(digestHeadline({ decisions: 2, problems: 1, done: 5 })).toBe(
      "2 decisions, 1 problem, 5 tasks done",
    );
    expect(digestHeadline({ decisions: 0, problems: 0, done: 1 })).toBe("1 task done");
    expect(digestHeadline({ decisions: 2, problems: 0, done: 0 })).toBe("2 decisions");
  });
});
