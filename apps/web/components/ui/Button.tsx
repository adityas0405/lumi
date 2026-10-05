import type { ButtonHTMLAttributes } from "react";

type Tone = "primary" | "secondary" | "danger" | "quiet";

const TONE: Record<Tone, string> = {
  primary: "border-text bg-text text-bg hover:opacity-90",
  secondary: "border-rule-2 text-text-2 hover:border-text hover:text-text",
  danger: "border-oxide bg-oxide text-bg hover:opacity-90",
  quiet: "border-transparent text-stone hover:text-text",
};

/** Lumi's one button. `hint` shows the shortcut that does the same thing. */
export function Button({
  tone = "secondary",
  hint,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; hint?: string }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[13px] disabled:opacity-40 ${TONE[tone]} ${className}`}
    >
      {children}
      {hint && <span className="font-mono text-[10.5px] opacity-60">{hint}</span>}
    </button>
  );
}
