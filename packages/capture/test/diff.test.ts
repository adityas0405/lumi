import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { diffBox, hasUiChanges } from "../src/index";

function png(width: number, height: number, paint?: (x: number, y: number) => boolean): Buffer {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = paint?.(x, y) ?? false;
      p.data[i] = on ? 20 : 240;
      p.data[i + 1] = on ? 60 : 240;
      p.data[i + 2] = on ? 40 : 240;
      p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p);
}

describe("diffBox", () => {
  it("boxes the changed region", () => {
    const before = png(200, 100);
    const after = png(200, 100, (x, y) => x >= 120 && x < 170 && y >= 40 && y < 60);
    expect(diffBox(before, after)).toEqual({ x: 120, y: 40, w: 50, h: 20 });
  });

  it("returns null when nothing changed or nearly everything did", () => {
    expect(diffBox(png(50, 50), png(50, 50))).toBeNull();
    expect(
      diffBox(
        png(50, 50),
        png(50, 50, () => true),
      ),
    ).toBeNull();
  });
});

describe("hasUiChanges", () => {
  it("ignores tests and non-UI files", () => {
    expect(hasUiChanges(["src/ui/CartSummary.tsx"])).toBe(true);
    expect(hasUiChanges(["src/styles.css"])).toBe(true);
    expect(hasUiChanges(["src/payments/refunds.ts", "src/ui/Button.test.tsx"])).toBe(false);
  });
});
