import { timingSafeEqual } from "node:crypto";

/** Checks `Authorization: Bearer <LUMI_API_KEY>` for SDK calls. */
export function checkApiKey(req: Request): boolean {
  const expected = process.env.LUMI_API_KEY;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
