"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ACTIVITY_POOL, type ActivityEvent } from "@/lib/live-demo";
import { initials } from "@/lib/format";
import { useCampaign } from "@/components/campaign-context";
import { cn } from "@/lib/utils";

const KIND_DOT: Record<ActivityEvent["kind"], string> = {
  interested: "bg-success",
  callback: "bg-warning",
  dialing: "bg-info",
  voicemail: "bg-info",
  not_interested: "bg-muted-foreground/50",
  opted_out: "bg-danger",
};

interface FeedItem {
  key: string;
  ev: ActivityEvent;
  age: number;
}

function ageLabel(age: number): string {
  if (age < 3) return "just now";
  if (age < 60) return `${age}s ago`;
  return `${Math.floor(age / 60)}m ago`;
}

export function LiveActivityFeed() {
  const { active } = useCampaign();
  const [items, setItems] = useState<FeedItem[]>(() =>
    ACTIVITY_POOL.slice(0, 5).map((ev, i) => ({
      key: `seed-${ev.id}`,
      ev,
      age: (i + 1) * 12,
    })),
  );
  const pointer = useRef(5);
  const tick = useRef(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      tick.current += 1;
      setItems((prev) => {
        const aged = prev.map((it) => ({ ...it, age: it.age + 1 }));
        if (tick.current % 4 !== 0) return aged;
        const ev = ACTIVITY_POOL[pointer.current % ACTIVITY_POOL.length];
        pointer.current += 1;
        return [{ key: `${ev.id}-${tick.current}`, ev, age: 0 }, ...aged].slice(0, 7);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return (
    <ul className="space-y-1">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.li
            key={it.key}
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
          >
            <span className="relative flex shrink-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {initials(it.ev.name)}
              </span>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                  KIND_DOT[it.ev.kind],
                  it.ev.kind === "dialing" && "animate-pulse",
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.ev.name}</p>
              <p className="truncate text-xs text-muted-foreground">{it.ev.text}</p>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {ageLabel(it.age)}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
