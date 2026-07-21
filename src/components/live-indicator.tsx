import { cn } from "@/lib/utils";

/**
 * Signature motif — an animated audio equalizer that reads as "the agent is
 * live and talking." Static (flat) bars when the campaign is paused.
 */
export function LiveWaveform({
  active,
  className,
  barClassName,
}: {
  active: boolean;
  className?: string;
  barClassName?: string;
}) {
  const bars = [0, 0.18, 0.36, 0.12, 0.28];
  return (
    <span
      className={cn("inline-flex items-center gap-[2px] h-3.5", className)}
      aria-hidden
    >
      {bars.map((delay, i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full origin-center",
            active ? "bg-success" : "bg-muted-foreground/40",
            barClassName,
          )}
          style={{
            height: "100%",
            transform: active ? undefined : "scaleY(0.35)",
            animation: active
              ? `eq 1s ease-in-out ${delay}s infinite`
              : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function LiveDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          active ? "bg-success" : "bg-muted-foreground/40",
        )}
      />
    </span>
  );
}
