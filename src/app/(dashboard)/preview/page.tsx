import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InterestedCard } from "@/components/interested-card";
import { CallLogTable } from "@/components/call-log-table";
import { Stagger, StaggerItem } from "@/components/motion";
import {
  leads as sampleLeads,
  calls as sampleCalls,
  getCallForLead,
} from "@/lib/sample-data";

export const dynamic = "force-dynamic";

// A safe, self-contained preview of how the dashboard looks once real calls flow
// in — rendered with SAMPLE data through the exact same components as the live
// Interested and Call-log pages. Nothing here touches the database; action
// buttons are inert. Use it to see the go-live experience before going live.
export default function PreviewPage() {
  const interested = sampleLeads.filter(
    (l) => (l.status === "interested" || l.status === "callback") && !l.contactedAt,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Preview"
        description="A sandbox showing how everything looks once you're live — built from sample data, using the same UI as the real pages."
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning-ink" />
        <p className="text-sm text-warning-ink">
          <strong>Sample data — not real.</strong> These records are for preview
          only; buttons are disabled and nothing is stored. Your real leads and
          calls appear on the <strong>Interested</strong> and{" "}
          <strong>Call log</strong> pages.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Interested leads</h2>
        {interested.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sample interested leads.</p>
        ) : (
          <Stagger className="grid gap-4 md:grid-cols-2">
            {interested.map((lead) => (
              <StaggerItem key={lead.id}>
                <InterestedCard
                  lead={lead}
                  call={getCallForLead(lead.id) ?? null}
                  preview
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Call log</h2>
        <CallLogTable calls={sampleCalls} preview />
      </section>
    </div>
  );
}
