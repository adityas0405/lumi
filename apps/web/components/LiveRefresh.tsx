"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page's server data when the worker reports progress (throttled). */
export function LiveRefresh({ taskId }: { taskId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource("/api/events");
    let pending: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; taskId?: string };
        if (event.type === "hello") return;
        if (taskId && event.taskId && event.taskId !== taskId) return;
      } catch {
        return;
      }
      pending ??= setTimeout(() => {
        pending = null;
        router.refresh();
      }, 800);
    };
    return () => {
      es.close();
      if (pending) clearTimeout(pending);
    };
  }, [router, taskId]);
  return null;
}
