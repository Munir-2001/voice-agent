"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Building2, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, formatPhone, initials } from "@/lib/format";
import { LIVE_CALLS } from "@/lib/live-demo";
import { useCampaign } from "@/components/campaign-context";
import { cn } from "@/lib/utils";

const TICK_MS = 250;
const END_PAUSE = 3; // seconds of "wrapping up" before the next call

export function LiveCallMonitor() {
  const { active } = useCampaign();
  const [callIndex, setCallIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const call = LIVE_CALLS[callIndex];

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK_MS / 1000;
        if (next >= call.length + END_PAUSE) {
          setCallIndex((i) => (i + 1) % LIVE_CALLS.length);
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, call.length]);

  const revealed = call.turns.filter((t) => t.at <= elapsed);
  const wrapping = elapsed >= call.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [revealed.length]);

  if (!active) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Radio className="size-5 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium">Campaign paused</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Flip the switch in the top bar to put the agent live. Active calls
          appear here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b bg-success/[0.04] px-4 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-success">
          {wrapping ? "Wrapping up" : "Live call"}
        </span>
        <BigWaveform />
        <span className="ml-auto font-mono text-sm font-medium tabular-nums">
          {formatDuration(Math.floor(elapsed))}
        </span>
      </div>

      {/* who */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials(call.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{call.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Building2 className="size-3" />
            {call.business} · {call.industry}
          </p>
        </div>
        <span className="hidden font-mono text-xs text-muted-foreground sm:block">
          {formatPhone(call.number)}
        </span>
      </div>

      {/* streaming transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 260 }}>
        {revealed.map((turn, i) => (
          <div
            key={`${callIndex}-${i}`}
            className={cn(
              "flex gap-2 [animation:fade-up_0.35s_ease-out]",
              turn.role === "agent" ? "" : "flex-row-reverse",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                turn.role === "agent"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {turn.role === "agent" ? "AI" : "P"}
            </span>
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                turn.role === "agent"
                  ? "rounded-tl-sm bg-muted"
                  : "rounded-tr-sm bg-primary text-primary-foreground",
              )}
            >
              {turn.text}
            </div>
          </div>
        ))}
        {!wrapping && (
          <div className="flex items-center gap-1 pl-8 text-muted-foreground">
            <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">Live monitor · demo stream</span>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Headphones className="size-3.5" />
          Listen in
        </Button>
      </div>
    </div>
  );
}

function BigWaveform() {
  const bars = [0.2, 0.5, 0.15, 0.35, 0.6, 0.25, 0.45, 0.3, 0.55, 0.2];
  return (
    <span className="flex items-center gap-[2px] h-4" aria-hidden>
      {bars.map((d, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-success/70"
          style={{ height: "100%", animation: `eq 0.9s ease-in-out ${d}s infinite` }}
        />
      ))}
    </span>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
      style={{ animation: `eq 1s ease-in-out ${delay}s infinite` }}
    />
  );
}
