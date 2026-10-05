import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { IncidentBanner } from "./incidents/IncidentBanner";
import { ThemeToggle } from "./ThemeToggle";

export function Header({
  user,
  active,
}: {
  user: SessionUser;
  active: "review" | "digest" | "incidents";
}) {
  const nav = [
    { href: "/", label: "Inbox", key: "review" },
    { href: "/digest", label: "Digest", key: "digest" },
    { href: "/incidents", label: "Incidents", key: "incidents" },
  ] as const;
  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex h-11 max-w-[1320px] items-center gap-5 px-4 sm:gap-7 sm:px-6">
          <Link href="/" className="font-semibold text-[15px] leading-none">
            Lumi
          </Link>
          <nav className="flex gap-4 text-[13px] sm:gap-5">
            {nav.map((n) => (
              <Link
                key={n.key}
                href={n.href as "/"}
                className={n.key === active ? "text-text" : "text-stone hover:text-text"}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5 text-[13px]">
            <span className="hidden md:inline">
              <ThemeToggle />
            </span>
            <span className="hidden text-stone sm:inline">@{user.login}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-xs text-stone hover:text-text">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <IncidentBanner />
    </>
  );
}
