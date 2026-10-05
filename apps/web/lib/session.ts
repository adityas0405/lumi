import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface SessionUser {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

const COOKIE = "lumi_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

function secret(): string {
  const s = process.env.LUMI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("LUMI_SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeSession(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + MAX_AGE_S * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & {
      exp: number;
    };
    return data.exp > Date.now()
      ? { login: data.login, name: data.name, avatarUrl: data.avatarUrl }
      : null;
  } catch {
    return null;
  }
}

export function allowedLogins(): string[] {
  return (process.env.LUMI_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Local-only bypass for automated browser tests: LUMI_DEV_AUTH=<login>. Never
 * active in production builds.
 */
function devUser(): SessionUser | null {
  const login = process.env.LUMI_DEV_AUTH;
  if (!login || process.env.NODE_ENV === "production") return null;
  return { login, name: login, avatarUrl: null };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value) ?? devUser();
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const sessionCookie = {
  name: COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  },
};
