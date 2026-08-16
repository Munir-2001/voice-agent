"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Turns a server-rendered page into a live one: periodically re-fetches server
// data via router.refresh(), so the call monitor and activity feed update on
// their own without a manual reload. Polls only while the tab is visible (no
// wasted requests in a background tab), and refreshes immediately on re-focus.
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up instantly when the tab regains focus
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
