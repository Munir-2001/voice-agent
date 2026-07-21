"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

// Deterministic pseudo-waveform bar heights (no Math.random for SSR stability).
function bars(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.5) * 0.4);
    return 0.25 + v * 0.7;
  });
}

export function CallPlayer({ durationSecs }: { durationSecs: number }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const heights = bars(72);

  useEffect(() => {
    if (!playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
      return;
    }
    const step = (t: number) => {
      if (last.current == null) last.current = t;
      const dt = (t - last.current) / 1000;
      last.current = t;
      setElapsed((e) => {
        const next = e + dt;
        if (next >= durationSecs) {
          setPlaying(false);
          return durationSecs;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, durationSecs]);

  const progress = Math.min(elapsed / durationSecs, 1);
  const playhead = Math.floor(progress * heights.length);

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <Button
        size="icon-lg"
        className="rounded-full"
        onClick={() => {
          if (elapsed >= durationSecs) setElapsed(0);
          setPlaying((p) => !p);
        }}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 translate-x-px" />
        )}
      </Button>

      <div className="flex h-10 flex-1 items-center gap-[2px]">
        {heights.map((h, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i <= playhead ? "bg-foreground" : "bg-muted-foreground/25",
            )}
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>

      <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tnum">
        {formatDuration(Math.floor(elapsed))} / {formatDuration(durationSecs)}
      </span>
      <Button variant="ghost" size="icon" aria-label="Download recording">
        <Download className="size-4" />
      </Button>
    </div>
  );
}
