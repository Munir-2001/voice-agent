import { cn } from "@/lib/utils";
import {
  LEAD_STATUS_META,
  CALL_OUTCOME_META,
  TONE_CLASSES,
  TONE_DOT,
} from "@/lib/status";
import type { LeadStatus, CallOutcome } from "@/lib/types";

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          TONE_DOT[meta.tone],
          meta.tone === "live" && "animate-pulse",
        )}
      />
      {meta.label}
    </span>
  );
}

export function CallOutcomeBadge({
  outcome,
  className,
}: {
  outcome: CallOutcome;
  className?: string;
}) {
  const meta = CALL_OUTCOME_META[outcome];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[meta.tone])} />
      {meta.label}
    </span>
  );
}
