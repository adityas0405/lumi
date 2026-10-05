import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Starts GitHub sign-in with the Lumi GitHub App's OAuth client. */
export async function GET(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("GitHub sign-in isn't configured", { status: 500 });
  const state = randomBytes(16).toString("hex");
  const origin = new URL(req.url).origin;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback/github`);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("lumi_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
