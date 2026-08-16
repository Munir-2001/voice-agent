"use client";

import { useState } from "react";
import { Loader2, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// On-demand "Call now" — fires an immediate dialing tick against the uploaded
// list instead of waiting for the next scheduled cron tick. The server enforces
// all guardrails (legal window, suppression, daily cap), so this button is safe
// to press: it never dials a suppressed number or overshoots the daily cap.
export function DialNowButton() {
  const [pending, setPending] = useState(false);

  async function callNow() {
    setPending(true);
    try {
      const res = await fetch("/api/dial-now", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not start dialing");
        return;
      }
      if (typeof data.placed === "number" && data.placed > 0) {
        toast.success(
          `Dialing ${data.placed} ${data.placed === 1 ? "lead" : "leads"} now`,
          data.failed
            ? { description: `${data.failed} could not be placed — see logs.` }
            : undefined,
        );
      } else if (data.skipped) {
        // Human-readable reasons for "nothing was dialed".
        const reason =
          {
            "daily cap reached": "Daily call cap already reached for today.",
            "campaign paused": "Campaign is paused.",
            "no caller numbers configured": "No caller number is configured.",
            "suppression list unavailable": "Opt-out list unavailable — try again.",
          }[data.skipped as string] ?? data.skipped;
        toast.message("No calls placed", { description: reason });
      } else if (data.failed) {
        toast.error(`Could not place ${data.failed} calls — check the logs.`);
      } else {
        toast.message("No eligible leads", {
          description: "Nobody is callable right now (window, attempts, or list empty).",
        });
      }
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={callNow}
      className="gap-1.5"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <PhoneOutgoing className="size-4" />
      )}
      <span className="hidden sm:inline">{pending ? "Dialing…" : "Call now"}</span>
    </Button>
  );
}
