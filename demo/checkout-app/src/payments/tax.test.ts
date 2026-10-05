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

  it("rejects unknown regions", () => {
    expect(() => taxFor(100, "ZZ")).toThrow(/No tax rate/);
  });
});
