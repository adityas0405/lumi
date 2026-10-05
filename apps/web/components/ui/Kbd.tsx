/** A key, as shown in hints: <Kbd>j</Kbd>. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-[1.4em] border border-rule-2 px-1 text-center font-mono text-[11px] leading-4 text-stone">
      {children}
    </kbd>
  );
}
