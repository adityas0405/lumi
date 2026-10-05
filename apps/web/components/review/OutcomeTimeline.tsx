import Link from "next/link";
import { ago } from "@/lib/format";

export interface OutcomeView {
  kind: string;
  ref: string | null;
  detail: string | null;
  at: string;
}

export interface LinkedTaskView {
  id: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
}

const LABEL: Record<string, string> = {
  merged: "Merged",
  reverted: "Reverted",
  incident_linked: "Linked to an incident",
  held_up: "Held up",
};

/** What happened to the change after review: merged, linked to an incident, reverted, stalled. */
export function OutcomeTimeline({
  outcomes,
  revertedBy,
  now,
}: {
  outcomes: OutcomeView[];
  revertedBy: LinkedTaskView | null;
  now: string;
}) {
  if (outcomes.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="kicker border-b border-rule pb-3">After review</h2>
      <ol className="text-sm">
        {outcomes.map((o) => {
          const bad = o.kind === "reverted" || o.kind === "incident_linked";
          return (
            <li
              key={`${o.kind}${o.ref ?? ""}`}
              className="grid grid-cols-[150px_1fr] gap-x-6 border-b border-rule py-3"
            >
              <span
                className={bad ? "text-oxide" : o.kind === "held_up" ? "text-ochre" : "text-text"}
              >
                {LABEL[o.kind] ?? o.kind}
              </span>
              <span className="flex flex-wrap gap-x-3 text-stone">
                <Detail outcome={o} revertedBy={revertedBy} />
                <span className="text-dust">{ago(o.at, now)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Detail({
  outcome: o,
  revertedBy,
}: {
  outcome: OutcomeView;
  revertedBy: LinkedTaskView | null;
}) {
  const link = "underline decoration-rule underline-offset-4 hover:text-text";
  switch (o.kind) {
    case "merged":
      return o.ref ? <span className="font-mono text-xs">{o.ref.slice(0, 7)}</span> : null;
    case "incident_linked":
      return o.ref ? (
        <Link href={`/incidents/${o.ref}`} className={link}>
          {o.detail ?? "Open the incident"}
        </Link>
      ) : (
        <span>{o.detail}</span>
      );
    case "reverted":
      return revertedBy ? (
        <Link href={`/tasks/${revertedBy.id}`} className={link}>
          {o.detail ?? "Reverted"}
        </Link>
      ) : o.ref ? (
        <a href={o.ref} target="_blank" rel="noreferrer" className={link}>
          {o.detail ?? "Reverted"}
        </a>
      ) : (
        <span>{o.detail}</span>
      );
    default:
      return <span>{o.detail}</span>;
  }
}

/** Shown instead of the player on a rollback: it gets no narrated review of its own. */
export function RollbackPanel({
  revertOf,
  prNumber,
  prUrl,
  prState,
}: {
  revertOf: LinkedTaskView;
  prNumber: number | null;
  prUrl: string | null;
  prState: string;
}) {
  return (
    <div className="flex aspect-video w-full flex-col justify-center border border-rule bg-surface px-8 sm:px-14">
      <div className="kicker">Rollback{prNumber ? ` · PR #${prNumber}` : ""}</div>
      <p className="mt-4 font-semibold text-xl leading-snug sm:text-3xl">
        Reverts{" "}
        <Link
          href={`/tasks/${revertOf.id}`}
          className="underline decoration-rule underline-offset-4"
        >
          {revertOf.prNumber ? `#${revertOf.prNumber}, ` : ""}
          {revertOf.title}
        </Link>
      </p>
      <p className="mt-4 max-w-lg text-sm text-stone">
        {prState === "merged"
          ? "Merged. The original change is marked reverted and any incident it was linked to records the rollback."
          : "Merge it on GitHub to finish the rollback. Lumi doesn't narrate reverts; the review that matters is the original change's."}
      </p>
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 text-sm text-stone underline underline-offset-4 hover:text-text"
        >
          Open on GitHub
        </a>
      )}
    </div>
  );
}
