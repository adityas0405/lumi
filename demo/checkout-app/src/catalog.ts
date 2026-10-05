import type { Cents } from "./money";

export interface Product {
  sku: string;
  name: string;
  description: string;
  priceCents: Cents;
  weightGrams: number;
}

export const CATALOG: Product[] = [
  {
    sku: "NW-DESK-LAMP",
    name: "Arc desk lamp",
    description: "Warm LED, brushed aluminium",
    priceCents: 8900,
    weightGrams: 1400,
  },
  {
    sku: "NW-NOTEBOOK-A5",
    name: "A5 dotted notebook",
    description: "192 pages, lay-flat binding",
    priceCents: 1850,
    weightGrams: 320,
  },
  {
    sku: "NW-PEN-SET",
    name: "Fineliner set",
    description: "Six colours, 0.4 mm",
    priceCents: 1299,
    weightGrams: 90,
  },
  {
    sku: "NW-MUG",
    name: "Stoneware mug",
    description: "350 ml, speckled glaze",
    priceCents: 2400,
    weightGrams: 450,
  },
];

export function findProduct(sku: string): Product {
  const product = CATALOG.find((p) => p.sku === sku);
  if (!product) throw new Error(`Unknown SKU ${sku}`);
  return product;
}
