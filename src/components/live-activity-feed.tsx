import Link from "next/link";
import { Inbox } from "lucide-react";
import { CALL_OUTCOME_META, TONE_DOT } from "@/lib/status";
import { initials, relativeTime } from "@/lib/format";
import type { CallOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string; // call id (row links to the call)
  name: string;
  outcome: CallOutcome;
  text: string; // summary, or the outcome label as a fallback
  at: string; // ISO timestamp of the call
}

// Recent real call activity (newest first). No simulated stream — this is a
// snapshot of the `calls` table; it refreshes when the page is re-fetched.
export function LiveActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-5 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium">No call activity yet</p>
        <p className="max-w-[220px] text-xs text-muted-foreground">
          Once the agent starts dialing, completed calls show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const meta = CALL_OUTCOME_META[it.outcome];
        return (
          <li key={it.id}>
            <Link
              href={`/calls/${it.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <span className="relative flex shrink-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  {initials(it.name) || "?"}
                </span>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                    TONE_DOT[meta.tone],
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.name || "Unknown"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {it.text || meta.label}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {relativeTime(it.at)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
