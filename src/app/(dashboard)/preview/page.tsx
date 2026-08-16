import { FlaskConical, PhoneCall } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { InterestedCard } from "@/components/interested-card";
import { CallLogTable } from "@/components/call-log-table";
import { AutoRefresh } from "@/components/auto-refresh";
import { Stagger, StaggerItem } from "@/components/motion";
import { getInterestedLeads, getCalls } from "@/lib/data";

export const dynamic = "force-dynamic";

// A single "see everything working" view of your REAL data — interested leads
// and the full call log — using the same components as the live pages. Test
// calls you place appear in the Call log here (they aren't tied to a lead, so
// they won't show under Interested). Auto-refreshes so new calls land on their own.
export default async function PreviewPage() {
  const [interested, calls] = await Promise.all([
    getInterestedLeads(),
    getCalls(200),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader
        title="Preview"
        description="A live view of your real interested leads and calls — including test calls — so you can see everything working end to end."
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This shows <strong>real data</strong>. A test call appears in the{" "}
          <strong>Call log</strong> below within a few seconds of hanging up
          (once the ElevenLabs webhook is enabled). Test calls aren&apos;t tied to
          a lead, so they won&apos;t appear under Interested.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Interested leads</h2>
        {interested.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No interested leads yet — they show up here when a real lead is
            qualified as interested or books a callback.
          </p>
        ) : (
          <Stagger className="grid gap-4 md:grid-cols-2">
            {interested.map(({ lead, call }) => (
              <StaggerItem key={lead.id}>
                <InterestedCard lead={lead} call={call} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Call log</h2>
        {calls.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <PhoneCall className="size-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">No calls yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Place a test call from Settings → Testing tools; it appears here
              once the call wraps up.
            </p>
          </Card>
        ) : (
          <CallLogTable calls={calls} />
        )}
      </section>
    </div>
  );
}
