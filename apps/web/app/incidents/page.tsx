import Link from "next/link";
import { Header } from "@/components/Header";
import { SimulateIncident } from "@/components/incidents/SimulateIncident";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ago } from "@/lib/format";
import { listIncidents } from "@/lib/incidents";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Incidents() {
  const user = await requireUser();
  const list = await listIncidents();
  return (
    <>
      <Header user={user} active="incidents" />
      <LiveRefresh />
      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-10">
          <div>
            <div className="kicker">Incidents</div>
            <h1 className="mt-3 font-semibold text-[22px] leading-tight">
              {list.some((i) => i.status !== "resolved")
                ? "Production needs attention."
                : "Production is quiet."}
            </h1>
            <p className="mt-2 text-stone">
              Error spikes from Sentry and Datadog, matched to the agent change that most likely
              caused them.
            </p>
          </div>
          <SimulateIncident />
        </div>
        <ul className="mt-10 border-t border-rule">
          {list.map((i) => (
            <li key={i.id} className="border-b border-rule">
              <Link
                href={`/incidents/${i.id}`}
                className="grid gap-2 py-5 sm:grid-cols-[120px_1fr_auto]"
              >
                <span className={`kicker ${i.status === "resolved" ? "" : "!text-oxide"}`}>
                  {i.severity} · {i.status}
                </span>
                <span className="font-medium text-[15px] leading-snug">{i.title}</span>
                <span className="text-sm text-stone">
                  {i.suspect ? `${i.suspect.agentName} · PR #${i.suspect.prNumber} · ` : ""}
                  {ago(i.startedAt, Date.now())}
                </span>
              </Link>
            </li>
          ))}
          {list.length === 0 && <li className="py-8 text-sm text-dust">No incidents yet.</li>}
        </ul>
      </main>
    </>
  );
}
