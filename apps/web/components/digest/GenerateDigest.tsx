"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function GenerateDigest({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "building" | "error">("idle");
  useEffect(() => {
    if (state !== "building") return;
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as { type: string; digestId?: string };
        if (ev.type === "digest.ready" && ev.digestId) {
          es.close();
          router.push(`/digest/${ev.digestId}`);
        }
      } catch {}
    };
    return () => es.close();
  }, [state, router]);
  return (
    <button
      type="button"
      disabled={state === "building"}
      onClick={async () => {
        setState("building");
        const r = await fetch("/api/digest", { method: "POST" });
        if (!r.ok) setState("error");
      }}
      className={
        quiet
          ? "text-sm text-stone underline underline-offset-4 hover:text-text disabled:no-underline"
          : "border border-text px-5 py-2.5 text-sm hover:bg-text hover:text-bg disabled:opacity-50"
      }
    >
      {state === "building"
        ? "Building the digest… about a minute"
        : state === "error"
          ? "Couldn't start. Try again"
          : "Build a digest now"}
    </button>
  );
}
