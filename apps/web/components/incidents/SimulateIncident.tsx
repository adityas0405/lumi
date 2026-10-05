"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Demo control: replays a recorded Sentry alert as if the spike started now. */
export function SimulateIncident() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "default")
            await Notification.requestPermission();
        } catch {}
        const r = await fetch("/api/incidents/simulate", { method: "POST" });
        const body = await r.json();
        setBusy(false);
        if (r.ok) router.push(`/incidents/${body.incidentId}`);
      }}
      className="border border-oxide px-4 py-2 text-sm text-oxide hover:bg-oxide hover:text-bg disabled:opacity-50"
    >
      {busy ? "Simulating…" : "Simulate incident"}
    </button>
  );
}
