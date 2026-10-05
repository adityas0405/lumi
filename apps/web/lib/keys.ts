"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** One keyboard shortcut. `keys` is a key name ("j", "Enter", "?") or a two-key sequence ("g h"). */
export interface Binding {
  keys: string;
  label: string;
  run: () => void;
  /** Listed in the ? overlay but not in the page's footer hints. */
  quiet?: boolean;
}

type Entry = { get: () => Binding[] };
const entries = new Set<Entry>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};

/** Registers a page's shortcuts while it is mounted. Always uses the latest handlers. */
export function useKeys(bindings: Binding[]): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    const entry: Entry = { get: () => ref.current };
    entries.add(entry);
    emit();
    return () => {
      entries.delete(entry);
      emit();
    };
  }, []);
}

/** Every shortcut the current page has registered, most recent page first. */
export function pageBindings(): Binding[] {
  return [...entries].reverse().flatMap((e) => e.get());
}

/** Re-renders when pages register or drop shortcuts. */
export function useBindingsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
}

/** True while the person is typing, so letters go to the field, not to shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable='true']");
}
