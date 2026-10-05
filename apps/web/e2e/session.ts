import { createHmac } from "node:crypto";

/**
 * Mints a signed session cookie for browser tests, the same format the app
 * issues after GitHub sign-in. Needs LUMI_SESSION_SECRET from .env.
 */
export function testSessionCookie(login: string): {
  name: string;
  value: string;
  domain: string;
  path: string;
} {
  const secret = process.env.LUMI_SESSION_SECRET;
  if (!secret) throw new Error("LUMI_SESSION_SECRET is not set");
  const payload = Buffer.from(
    JSON.stringify({ login, name: login, avatarUrl: null, exp: Date.now() + 3_600_000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return { name: "lumi_session", value: `${payload}.${sig}`, domain: "127.0.0.1", path: "/" };
}
