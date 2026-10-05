import type { Tone } from "@/lib/state";

const COLOR: Record<Tone, string> = {
  problem: "text-oxide",
  decision: "text-ochre",
  working: "text-stone",
  done: "text-stone font-normal",
};

/** A task's state as a word ("Blocked", "Needs you"); colour only reinforces it. */
export function StateWord({
  word,
  tone,
  className = "",
}: {
  word: string;
  tone: Tone;
  className?: string;
}) {
  return <span className={`font-medium ${COLOR[tone]} ${className}`}>{word}</span>;
}
