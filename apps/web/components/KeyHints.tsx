import { Kbd } from "./ui/Kbd";

/** The page's main shortcuts, as a quiet footer line. Press ? for all of them. */
export function KeyHints({ hints }: { hints: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-dust">
      {hints.map(([keys, label]) => (
        <span key={keys} className="inline-flex items-center gap-1">
          {keys.split(" ").map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
          <span className="ml-0.5">{label}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <Kbd>?</Kbd>
        <span className="ml-0.5">all keys</span>
      </span>
    </div>
  );
}
