import { describe, expect, it } from "vitest";
import { parseRef, refs } from "../src/refs";

describe("refs", () => {
  it("round-trips every ref type", () => {
    expect(parseRef(refs.diff("src/a b.ts", 12, 30))).toEqual({
      type: "diff",
      path: "src/a b.ts",
      start: 12,
      end: 30,
    });
    expect(parseRef(refs.file("src/x.ts"))).toEqual({ type: "file", path: "src/x.ts" });
    expect(parseRef(refs.test("rounds half-even", "tax"))).toEqual({
      type: "test",
      name: "tax > rounds half-even",
    });
    expect(parseRef(refs.ci("unit-tests"))).toEqual({ type: "ci", name: "unit-tests" });
    expect(parseRef(refs.shot("checkout", "after"))).toEqual({
      type: "shot",
      label: "checkout",
      variant: "after",
    });
    expect(parseRef(refs.shot("checkout", "single"))).toEqual({
      type: "shot",
      label: "checkout",
      variant: "single",
    });
    expect(parseRef(refs.claim())).toEqual({ type: "claim", id: "pr-body" });
    expect(parseRef(refs.task(12))).toEqual({ type: "task", id: "12" });
    expect(parseRef(refs.code("src/a.ts", 3, 9))).toEqual({
      type: "code",
      path: "src/a.ts",
      start: 3,
      end: 9,
    });
    expect(parseRef(refs.doc("README.md"))).toEqual({ type: "doc", path: "README.md" });
    expect(parseRef(refs.map())).toEqual({ type: "map", id: "modules" });
    expect(parseRef(refs.decision(2))).toEqual({ type: "decision", id: "2" });
  });

  it("accepts single-line diff refs and rejects malformed ones", () => {
    expect(parseRef("diff:a.ts#L7")).toEqual({ type: "diff", path: "a.ts", start: 7, end: 7 });
    expect(parseRef("diff:a.ts#L9-L3")).toBeNull();
    expect(parseRef("diff:a.ts")).toBeNull();
    expect(parseRef("shot:x@sideways")).toBeNull();
    expect(parseRef("nope:x")).toBeNull();
    expect(parseRef("file:")).toBeNull();
  });
});
