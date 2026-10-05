"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Open {
  id: string;
  title: string;
  severity: string;
  status: string;
}

/**
 * The in-app alert: appears on every page the moment an incident is recorded,
 * and raises a desktop notification if the viewer allowed them.
 */
export function IncidentBanner() {
  const [open, setOpen] = useState<Open[]>([]);
  useEffect(() => {
    const load = async (notify: boolean) => {
      const r = await fetch("/api/incidents/open");
      if (!r.ok) return;
      const list = (await r.json()) as Open[];
      setOpen(list);
      const fresh = list[0];
      if (
        notify &&
        fresh &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(`${fresh.severity.toUpperCase()} · ${fresh.title}`, {
          body: "Lumi found the likely agent change. Open to act.",
          tag: fresh.id,
        });
      }
    };
    void load(false);
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        if ((JSON.parse(e.data) as { type: string }).type === "incident.created") void load(true);
      } catch {}
    };
    return () => es.close();
  }, []);
  const top = open[0];
  if (!top) return null;
  return (
    <div className="border-b border-oxide bg-oxide-wash" role="alert">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-sm sm:px-8">
        <span className="kicker !text-oxide">
          {top.severity} · {top.status === "mitigating" ? "mitigating" : "production incident"}
        </span>
        <span className="min-w-0 flex-1 truncate text-text">{top.title}</span>
        <Link href={`/incidents/${top.id}`} className="text-text underline underline-offset-4">
          See the likely cause
        </Link>
      </div>
    </div>
  );
}
