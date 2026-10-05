import { describe, expect, it } from "vitest";
import { roundHalfEven } from "./money";

describe("roundHalfEven", () => {
  it("sends exact halves to the even neighbour", () => {
    expect(roundHalfEven(12.5)).toBe(12);
    expect(roundHalfEven(13.5)).toBe(14);
    expect(roundHalfEven(0.5)).toBe(0);
  });

  it("rounds everything else to nearest", () => {
    expect(roundHalfEven(12.49)).toBe(12);
    expect(roundHalfEven(12.51)).toBe(13);
  });

  it("absorbs floating-point noise around a half", () => {
    expect(roundHalfEven(2.5000000000000004)).toBe(2);
  });

  it("handles negative halves", () => {
    expect(roundHalfEven(-2.5)).toBe(-2);
  });
});
