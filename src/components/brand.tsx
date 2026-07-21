import { cn } from "@/lib/utils";

/** Rose wordmark with a small waveform glyph — nods to the voice product. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="2" y1="6.5" x2="2" y2="9.5" />
            <line x1="5" y1="4" x2="5" y2="12" />
            <line x1="8" y1="1.5" x2="8" y2="14.5" />
            <line x1="11" y1="4" x2="11" y2="12" />
            <line x1="14" y1="6.5" x2="14" y2="9.5" />
          </g>
        </svg>
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">Rose</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Calling Console
        </span>
      </div>
    </div>
  );
}
