import { describe, expect, it } from "vitest";
import { makeOrder } from "./fixtures";
import { fold, matchesSearch, tokenize } from "./search";

describe("search", () => {
  it("folds case and accents", () => {
    expect(fold("Café ÜBER")).toBe("cafe uber");
  });

  it("tokenizes and strips a leading #", () => {
    expect(tokenize("  #NW-000123  mug ")).toEqual(["nw-000123", "mug"]);
  });

  it("matches order id, email, sku and item name", () => {
    const order = makeOrder({ id: "NW-000777", customerEmail: "grace@example.com" });
    expect(matchesSearch(order, "#nw-000777")).toBe(true);
    expect(matchesSearch(order, "grace")).toBe(true);
    expect(matchesSearch(order, "NW-MUG")).toBe(true);
    expect(matchesSearch(order, "stoneware")).toBe(true);
  });

  it("requires every token to match", () => {
    const order = makeOrder();
    expect(matchesSearch(order, "mug ada")).toBe(true);
    expect(matchesSearch(order, "mug lamp")).toBe(false);
  });

  it("matches everything for a blank query", () => {
    expect(matchesSearch(makeOrder(), "   ")).toBe(true);
  });
});
