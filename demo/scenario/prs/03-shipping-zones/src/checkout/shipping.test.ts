import { describe, expect, it } from "vitest";
import { shippingFor, zoneFor } from "./shipping";

describe("shipping zones", () => {
  it("maps regions to carrier zones", () => {
    expect(zoneFor("CA")).toBe(1);
    expect(zoneFor("TX")).toBe(2);
  });

  it("prices express delivery by zone", () => {
    expect(shippingFor("express", 3000, 500, "CA")).toBe(1200);
    expect(shippingFor("express", 3000, 500, "TX")).toBe(1900);
  });

  it("keeps standard shipping flat and free over the threshold", () => {
    expect(shippingFor("standard", 3000, 500, "TX")).toBe(599);
    expect(shippingFor("standard", 8000, 500, "CA")).toBe(0);
  });

  it("adds the heavy-parcel surcharge", () => {
    expect(shippingFor("express", 3000, 2500, "CA")).toBe(1600);
  });
});
