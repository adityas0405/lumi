import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Incident webhooks authenticate with Sentry's signature when SENTRY_CLIENT_SECRET
 * is set, or with `?token=` / `x-lumi-token` matching LUMI_WEBHOOK_TOKEN.
 */
export function checkIncidentWebhook(req: Request, body: string): boolean {
  const sentrySecret = process.env.SENTRY_CLIENT_SECRET;
  const sig = req.headers.get("sentry-hook-signature");
  if (sentrySecret && sig)
    return safeEqual(createHmac("sha256", sentrySecret).update(body).digest("hex"), sig);
  const expected = process.env.LUMI_WEBHOOK_TOKEN;
  const given = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-lumi-token") ?? "";
  return Boolean(expected) && safeEqual(expected!, given);
}

/** Slack request signing (v0), rejecting requests older than five minutes. */
export function checkSlackSignature(req: Request, body: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!secret || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  return safeEqual(mine, sig);
}
