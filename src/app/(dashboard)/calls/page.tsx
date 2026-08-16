import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { CallOutcomeBadge } from "@/components/status-badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { Stagger, StaggerItem } from "@/components/motion";
import { getCalls } from "@/lib/data";
import {
  formatPhone,
  formatDuration,
  relativeTime,
  initials,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Full chronological log of every call (newest first). Each row opens the call
// detail page (transcript + summary + recording). Auto-refreshes so new calls
// land here on their own while the agent is dialing.
export default async function CallLogPage() {
  const calls = await getCalls(500);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader
        title="Call log"
        description="Every call the agent has placed, newest first. Click a row for the full transcript, summary, and recording."
      />

      {calls.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <PhoneCall className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">No calls yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Once the agent starts dialing, every completed call shows up here with
            its outcome and transcript.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Header */}
              <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,3fr)_7rem_7rem_6rem] items-center gap-3 border-b bg-muted/30 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Lead</span>
                <span>Summary</span>
                <span>Outcome</span>
                <span>From · Dur.</span>
                <span className="text-right">When</span>
              </div>
              <Stagger>
                {calls.map((c) => (
                  <StaggerItem key={c.id}>
                    <Link
                      href={`/calls/${c.id}`}
                      className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,3fr)_7rem_7rem_6rem] items-center gap-3 border-b px-4 py-3 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      {/* Lead */}
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

                      {/* Summary */}
                      <span className="truncate text-sm text-muted-foreground">
                        {c.summary || "—"}
                      </span>

                      {/* Outcome */}
                      <span>
                        <CallOutcomeBadge outcome={c.outcome} />
                      </span>

                      {/* From number + duration */}
                      <span className="min-w-0 text-xs text-muted-foreground">
                        <span className="block truncate font-mono">
                          {c.numberUsed ? formatPhone(c.numberUsed) : "—"}
                        </span>
                        <span className="block tnum">
                          {formatDuration(c.durationSecs)}
                        </span>
                      </span>

                      {/* When */}
                      <span
                        className={cn(
                          "text-right font-mono text-[11px] tabular-nums text-muted-foreground",
                        )}
                      >
                        {relativeTime(c.startedAt)}
                      </span>
                    </Link>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
