import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CallOutcomeBadge } from "@/components/status-badge";
import { Stagger, StaggerItem } from "@/components/motion";
import type { Call } from "@/lib/types";
import { formatPhone, formatDuration, relativeTime, initials } from "@/lib/format";

const COLS =
  "grid grid-cols-[minmax(0,2.4fr)_minmax(0,3fr)_7rem_7rem_6rem] items-center gap-3 px-4";

// Chronological call list, shared by the real Call log and the Preview page.
// `preview` renders rows as static (sample calls have no real detail page).
export function CallLogTable({
  calls,
  preview = false,
}: {
  calls: Call[];
  preview?: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className={`${COLS} border-b bg-muted/30 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground`}
          >
            <span>Lead</span>
            <span>Summary</span>
            <span>Outcome</span>
            <span>From · Dur.</span>
            <span className="text-right">When</span>
          </div>
          <Stagger>
            {calls.map((c) => {
              const inner = (
                <>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {initials(c.leadName) || "?"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {c.leadName?.trim() || "Unknown"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.businessName || "—"}
                      </span>
                    </span>
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {c.summary || "—"}
                  </span>
                  <span>
                    <CallOutcomeBadge outcome={c.outcome} />
                  </span>
                  <span className="min-w-0 text-xs text-muted-foreground">
                    <span className="block truncate font-mono">
                      {c.numberUsed ? formatPhone(c.numberUsed) : "—"}
                    </span>
                    <span className="block tnum">{formatDuration(c.durationSecs)}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {relativeTime(c.startedAt)}
                  </span>
                </>
              );
              return (
                <StaggerItem key={c.id}>
                  {preview ? (
                    <div className={`${COLS} border-b py-3 last:border-0`}>{inner}</div>
                  ) : (
                    <Link
                      href={`/calls/${c.id}`}
                      className={`${COLS} border-b py-3 transition-colors last:border-0 hover:bg-muted/50`}
                    >
                      {inner}
                    </Link>
                  )}
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </div>
    </Card>
  );
}
