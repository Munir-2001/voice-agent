"use client";

import { motion } from "motion/react";
import { PhoneOutgoing, Sparkles } from "lucide-react";
import { LiveWaveform } from "@/components/live-indicator";
import { useCampaign } from "@/components/campaign-context";
import { cn } from "@/lib/utils";

export function CampaignHero({
  callsToday,
  interestedToday,
  monthDone,
  monthTarget,
}: {
  callsToday: number;
  interestedToday: number;
  monthDone: number;
  monthTarget: number;
}) {
  const { active } = useCampaign();
  const pct = Math.min(Math.round((monthDone / monthTarget) * 100), 100);

  return (
    <div className="brand-wash relative overflow-hidden rounded-2xl border bg-card">
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        {/* status */}
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors",
              active ? "bg-success/10" : "bg-muted",
            )}
          >
            <LiveWaveform active={active} className="h-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  active
                    ? "bg-success/10 text-success-ink"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    active ? "bg-success animate-pulse" : "bg-muted-foreground/50",
                  )}
                />
                {active ? "Live" : "Paused"}
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
              {active ? "Your agent is calling" : "Your agent is paused"}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <PhoneOutgoing className="size-3.5" />
                {callsToday} calls today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-success" />
                {interestedToday} interested today
              </span>
            </p>
          </div>
        </div>

        {/* monthly progress */}
        <div className="w-full max-w-xs">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">This month</span>
            <span className="font-medium tabular-nums">
              {monthDone.toLocaleString()}{" "}
              <span className="text-muted-foreground">/ {monthTarget.toLocaleString()} leads</span>
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-primary"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {pct}% of the monthly target · on pace
          </p>
        </div>
      </div>
    </div>
  );
}
