import { NextResponse } from "next/server";
import { allowedLogins, encodeSession, sessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expected = req.headers.get("cookie")?.match(/lumi_oauth_state=([a-f0-9]+)/)?.[1];
  if (!code || !state || state !== expected)
    return NextResponse.redirect(new URL("/login?error=state", url));

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return NextResponse.redirect(new URL("/login?error=token", url));

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/vnd.github+json",
    },
  });
  const gh = (await userRes.json()) as {
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  if (!gh.login) return NextResponse.redirect(new URL("/login?error=user", url));
  if (!allowedLogins().includes(gh.login.toLowerCase()))
    return NextResponse.redirect(new URL("/login?error=not-allowed", url));

  const res = NextResponse.redirect(new URL("/", url));
  res.cookies.set(
    sessionCookie.name,
    encodeSession({ login: gh.login, name: gh.name ?? null, avatarUrl: gh.avatar_url ?? null }),
    sessionCookie.options,
  );
  res.cookies.delete("lumi_oauth_state");
  return res;
}
