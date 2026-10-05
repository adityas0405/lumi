import { describe, expect, it } from "vitest";
import { buildModuleMap, moduleOf } from "../src/modules";

const files = [
  {
    path: "src/App.tsx",
    content: `import { computeTotals } from "./checkout/totals";\nimport { CartSummary } from "./ui/CartSummary";`,
  },
  {
    path: "src/checkout/totals.ts",
    content: `import { taxFor } from "../payments/tax";\nimport { shippingFor } from "./shipping";`,
  },
  { path: "src/checkout/shipping.ts", content: `import type { Cents } from "../money";` },
  { path: "src/payments/tax.ts", content: `import { type Cents } from "../money";` },
  { path: "src/money.ts", content: "export type Cents = number;" },
  {
    path: "src/ui/CartSummary.tsx",
    content: `import { useState } from "react";\nimport type { Totals } from "../checkout/totals";`,
  },
  { path: "src/checkout/totals.test.ts", content: `import { computeTotals } from "./totals";` },
];

describe("buildModuleMap", () => {
  const map = buildModuleMap(
    files,
    new Map([
      ["src/checkout/shipping.ts", 20],
      ["src/checkout/totals.ts", 2],
    ]),
  );

  it("marks changed modules and pulls in their direct neighbours", () => {
    expect(map.modules[0]).toMatchObject({
      id: "src/checkout",
      changed: true,
      changedLines: 22,
      files: 2,
    });
    expect(map.modules.map((m) => m.id).sort()).toEqual([
      "src",
      "src/checkout",
      "src/payments",
      "src/ui",
    ]);
  });

  it("derives edges from relative imports only, ignoring packages and tests", () => {
    expect(map.edges).toContainEqual({ from: "src/checkout", to: "src/payments" });
    expect(map.edges).toContainEqual({ from: "src/ui", to: "src/checkout" });
    expect(map.edges).toContainEqual({ from: "src", to: "src/checkout" });
    expect(map.edges.some((e) => e.from === e.to)).toBe(false);
  });

  it("names modules by directory", () => {
    expect(moduleOf("src/checkout/totals.ts")).toBe("src/checkout");
    expect(moduleOf("README.md")).toBe("README.md");
  });
});
