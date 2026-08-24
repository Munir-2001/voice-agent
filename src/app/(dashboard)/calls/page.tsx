import { PhoneCall } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/auto-refresh";
import { CallLogTable } from "@/components/call-log-table";
import { getCalls } from "@/lib/data";

export const dynamic = "force-dynamic";

// Full chronological log of every call (newest first). Each row opens the call
// detail page (transcript + summary + recording). Auto-refreshes so new calls
// land here on their own while the agent is dialing.
export default async function CallLogPage() {
  const calls = await getCalls(1000);

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
        <CallLogTable calls={calls} />
      )}
    </div>
  );
}
