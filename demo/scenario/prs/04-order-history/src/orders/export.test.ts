import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, csvField, toCsv } from "./export";
import { makeOrder } from "./fixtures";

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("NW-000001")).toBe("NW-000001");
    expect(csvField(12)).toBe("12");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvField('Lamp, "arc"')).toBe('"Lamp, ""arc"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  it("neutralises formula injection", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("@sum")).toBe("'@sum");
  });
});

describe("toCsv", () => {
  it("writes a header and one row per order in dollars", () => {
    const csv = toCsv([makeOrder({ id: "NW-000042", totalCents: 12345, subtotalCents: 12345 })]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(CSV_COLUMNS.join(","));
    expect(row).toContain("NW-000042");
    expect(row!.endsWith(",123.45,0.00,0.00,123.45")).toBe(true);
  });

  it("writes only a header for no orders", () => {
    expect(toCsv([])).toBe(CSV_COLUMNS.join(","));
  });
});
