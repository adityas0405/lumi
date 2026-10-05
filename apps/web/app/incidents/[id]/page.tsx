import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { IncidentActions } from "@/components/incidents/IncidentActions";
import { LiveRefresh } from "@/components/LiveRefresh";
import { AGENT_VAR, ago } from "@/lib/format";
import { getIncident } from "@/lib/incidents";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const norm = (p: string) => p.replace(/^.*?(src\/)/, "$1");

function gap(from: string, to: string): string {
  const m = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Renders `code` spans from model-written summaries. */
function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split
          <code key={i} className="font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const inc = await getIncident(id);
  if (!inc) notFound();
  const top = inc.suspects[0];
  const s = inc.stats;
  const inChange = (f: { file: string; line: number | null }) =>
    Boolean(
      top &&
        f.line !== null &&
        top.changes.some(
          (c) => norm(c.path) === norm(f.file) && f.line! >= c.start && f.line! <= c.end,
        ),
    );

  return (
    <>
      <Header user={user} active="incidents" />
      <LiveRefresh />
      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
        <div className="pt-10">
          <div className={`kicker ${inc.status === "resolved" ? "" : "!text-oxide"}`}>
            {inc.severity} · {inc.environment ?? "production"} · {inc.service ?? "service"} ·
            started {ago(inc.startedAt, Date.now())} · {inc.status}
          </div>
          <h1 className="mt-3 font-mono text-2xl leading-snug sm:text-[28px]">{inc.title}</h1>
          <dl className="mt-6 flex flex-wrap gap-x-12 gap-y-3 border-y border-rule py-4 text-sm">
            {s.events !== null && (
              <div>
                <dt className="text-stone">Errors</dt>
                <dd className="mt-1 text-text">
                  {s.events.toLocaleString()} in {s.windowMinutes ?? "?"} min
                  {s.baselineEvents !== null ? ` (usually ${s.baselineEvents})` : ""}
                </dd>
              </div>
            )}
            {s.users !== null && (
              <div>
                <dt className="text-stone">Customers affected</dt>
                <dd className="mt-1 text-text">{s.users.toLocaleString()}</dd>
              </div>
            )}
            {inc.deploy && (
              <div>
                <dt className="text-stone">Last deploy</dt>
                <dd className="mt-1 font-mono text-text">
                  {inc.deploy.sha.slice(0, 7)} · {gap(inc.deploy.deployedAt, inc.startedAt)} before
                  the spike
                </dd>
              </div>
            )}
            <div>
              <dt className="text-stone">Reported by</dt>
              <dd className="mt-1 text-text">
                {inc.source === "simulated"
                  ? "Sentry (simulated alert)"
                  : inc.source === "sentry"
                    ? "Sentry"
                    : "Datadog"}
              </dd>
            </div>
          </dl>
        </div>

        <section className="mt-10">
          <h2 className="kicker">Likely cause</h2>
          {top ? (
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
              <div>
                <div className="text-sm">
                  <span style={{ color: AGENT_VAR[top.task.agent] }}>{top.task.agentName}</span>
                  <span className="text-dust"> · </span>
                  <a
                    href={top.task.prUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-stone hover:text-text"
                  >
                    PR #{top.task.prNumber}
                  </a>
                  <span className="text-dust"> · {top.confidence} confidence</span>
                </div>
                <Link
                  href={`/tasks/${top.task.id}`}
                  className="mt-2 block font-semibold text-[22px] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4"
                >
                  {top.headline}
                </Link>
                <ul className="mt-5 space-y-2 text-[15px] text-text-2">
                  {top.reasons.map((r) => (
                    <li key={r} className="border-l border-rule pl-3">
                      {r}
                    </li>
                  ))}
                </ul>
                {top.triage?.route === "block" && (
                  <p className="mt-5 border-l border-oxide pl-3 text-[15px] leading-relaxed text-text">
                    Lumi flagged this before it merged: <InlineCode text={top.triage.summary} />
                    {top.approvedBy ? (
                      <span className="text-stone"> Approved anyway by @{top.approvedBy}.</span>
                    ) : null}
                  </p>
                )}
              </div>
              <div>
                <h3 className="kicker">What you can do</h3>
                <div className="mt-4">
                  <IncidentActions
                    incidentId={inc.id}
                    agent={top.task.agent}
                    agentName={top.task.agentName}
                    agentPaused={top.agentPaused}
                    canRollback={Boolean(top.task.prNumber)}
                    resolved={inc.status === "resolved"}
                  />
                </div>
                <p className="mt-6 text-xs leading-relaxed text-dust">
                  Alerts: shown here and as a desktop notification. Slack and phone calls turn on
                  when they're connected.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-stone">No recent agent change matches this incident.</p>
          )}
        </section>

        {inc.frames.length > 0 && (
          <section className="mt-12">
            <h2 className="kicker border-b border-rule pb-3">Stack trace · innermost first</h2>
            <ol className="font-mono text-[13px]">
              {inc.frames.map((f, i) => {
                const hit = inChange(f);
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: a trace can repeat a frame; position is its identity
                    key={`${f.file}:${f.line}:${i}`}
                    className={`flex gap-4 border-b border-rule py-2 ${hit ? "bg-oxide-wash text-text" : "text-stone"}`}
                  >
                    <span className="w-44 shrink-0 truncate pl-2">{f.fn ?? "?"}</span>
                    <span className="truncate">
                      {norm(f.file)}:{f.line}
                    </span>
                    {hit && (
                      <span className="ml-auto pr-2 font-sans text-xs text-oxide">
                        changed in PR #{top!.task.prNumber}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {inc.suspects.length > 1 && (
          <section className="mt-12">
            <h2 className="kicker border-b border-rule pb-3">Also shipped in that deploy</h2>
            <ul>
              {inc.suspects.slice(1).map((x) => (
                <li key={x.taskId} className="border-b border-rule py-3 text-sm text-stone">
                  <Link href={`/tasks/${x.task.id}`} className="hover:text-text">
                    {x.task.agentName} · PR #{x.task.prNumber} · {x.task.title}
                  </Link>
                  <span className="ml-2 text-dust">({x.confidence})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inc.actions.length > 0 && (
          <section className="mt-12">
            <h2 className="kicker border-b border-rule pb-3">Timeline</h2>
            <ul>
              {inc.actions.map((a) => (
                <li
                  key={`${a.at}${a.kind}`}
                  className="flex flex-wrap gap-x-3 border-b border-rule py-3 text-sm"
                >
                  <span className="text-text">
                    {a.kind === "rollback"
                      ? "Rollback"
                      : a.kind === "rollback_merged"
                        ? "Rollback merged"
                        : a.kind === "pause_agent"
                          ? "Agent paused"
                          : "Resolved"}
                  </span>
                  <span className="text-stone">by @{a.by}</span>
                  <span className="text-dust">{ago(a.at, Date.now())}</span>
                  {a.ref && (
                    <a
                      href={a.ref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-stone underline underline-offset-4"
                    >
                      {(a as { detail?: string }).detail ?? "link"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
