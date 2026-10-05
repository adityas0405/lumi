import { describe, expect, it } from "vitest";
import { taxFor } from "./tax";

describe("taxFor", () => {
  it("applies the regional rate", () => {
    expect(taxFor(10000, "CA")).toBe(725);
    expect(taxFor(10000, "OR")).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(taxFor(1299, "TX")).toBe(81); // 81.1875
    expect(taxFor(3330, "NY")).toBe(296); // 295.5375
  });

  it("rounds exact half cents to even (matches the processor report)", () => {
    expect(taxFor(200, "TX")).toBe(12); // 12.5 -> 12, was 13
    expect(taxFor(600, "TX")).toBe(38); // 37.5 -> 38
  });

  it("rejects unknown regions", () => {
    expect(() => taxFor(100, "ZZ")).toThrow(/No tax rate/);
  });
});
