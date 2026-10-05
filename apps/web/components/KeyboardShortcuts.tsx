"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Binding, isTyping, pageBindings, useBindingsVersion } from "@/lib/keys";
import { Kbd } from "./ui/Kbd";

/** Shortcuts that work on every page. */
const GLOBAL: { keys: string; label: string; href?: Route }[] = [
  { keys: "g h", label: "Go to the inbox", href: "/" },
  { keys: "g d", label: "Go to the digest", href: "/digest" },
  { keys: "g i", label: "Go to incidents", href: "/incidents" },
  { keys: "/", label: "Filter this page" },
  { keys: "?", label: "Show or hide this list" },
];

/**
 * The one keyboard handler: page shortcuts (registered with useKeys), two-key "g"
 * sequences, "/" to focus the page's filter and "?" for the list of keys.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);
  useBindingsVersion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const prior =
        pending.current && Date.now() - pending.current.at < 1200 ? pending.current.key : null;
      pending.current = null;
      const combo = prior ? `${prior} ${e.key}` : e.key;
      const hit = (b: { keys: string }) => b.keys === combo;

      const page = pageBindings().find(hit);
      if (page) {
        e.preventDefault();
        page.run();
        return;
      }
      const global = GLOBAL.find(hit);
      if (global?.href) {
        e.preventDefault();
        router.push(global.href);
        return;
      }
      if (combo === "/") {
        const field = document.querySelector<HTMLElement>("[data-filter]");
        if (field) {
          e.preventDefault();
          field.focus();
        }
        return;
      }
      if (combo === "?") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Start of a two-key sequence ("g h").
      if (!prior && [...GLOBAL, ...pageBindings()].some((b) => b.keys.startsWith(`${e.key} `)))
        pending.current = { key: e.key, at: Date.now() };
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, router]);

  if (!open) return null;
  const page: Binding[] = pageBindings();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close the list of keys"
        className="absolute inset-0 cursor-default bg-bg/70"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="relative w-full max-w-md border border-rule-2 bg-surface p-5"
      >
        <div className="kicker">This page</div>
        <KeyList items={page} empty="No shortcuts here beyond the ones below." />
        <div className="kicker mt-5">Everywhere</div>
        <KeyList items={GLOBAL} />
        <div className="mt-4 text-xs text-dust">Esc closes this list.</div>
      </div>
    </div>
  );
}

function KeyList({ items, empty }: { items: { keys: string; label: string }[]; empty?: string }) {
  if (!items.length) return <p className="mt-2 text-[13px] text-dust">{empty}</p>;
  return (
    <ul className="mt-2">
      {items.map((b) => (
        <li
          key={b.keys + b.label}
          className="flex items-center justify-between gap-4 border-t border-rule py-1.5 text-[13px]"
        >
          <span className="text-text-2">{b.label}</span>
          <span className="flex gap-1">
            {b.keys.split(" ").map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
