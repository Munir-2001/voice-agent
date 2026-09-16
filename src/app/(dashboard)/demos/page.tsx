import { PageHeader } from "@/components/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { FadeIn } from "@/components/motion";
import { Card, CardContent } from "@/components/ui/card";
import { getDemoCalls } from "@/lib/data";
import { formatPhone } from "@/lib/format";
import { DeleteDemoButton, ResetNumberBox } from "@/components/demo-reset-controls";

export const dynamic = "force-dynamic";

// Outcomes that need YOUR manual follow-up (email the Cal.com booking link).
const NEEDS_FOLLOWUP = new Set(["meeting_requested", "interested"]);

export default async function DemosPage() {
  const demos = await getDemoCalls();
  const followUps = demos.filter((d) => d.outcome && NEEDS_FOLLOWUP.has(d.outcome));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AutoRefresh intervalMs={30_000} />
      <PageHeader
        title="Demo calls"
        description="Completed instant-callback (Mia) demos. Leads marked interested or meeting-requested need your manual booking-link email."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Reset a number to let it get a fresh demo call (for re-tests or recordings).
        </p>
        <ResetNumberBox />
      </div>

      {followUps.length > 0 && (
        <FadeIn>
          <div className="rounded-xl border border-success/30 bg-success/[0.05] px-4 py-3 text-sm">
            <strong>{followUps.length}</strong>{" "}
            {followUps.length === 1 ? "lead is" : "leads are"} waiting for your booking
            email.
          </div>
        </FadeIn>
      )}

      {demos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No demo calls yet. When someone submits the demo form, the call and its
            outcome appear here.
          </CardContent>
        </Card>
      ) : (
        <FadeIn>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Lead</th>
                      <th className="px-4 py-2 font-medium">Outcome</th>
                      <th className="px-4 py-2 font-medium">Inbound leads</th>
                      <th className="px-4 py-2 font-medium">Callback speed today</th>
                      <th className="px-4 py-2 font-medium">Duration</th>
                      <th className="px-4 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demos.map((d) => {
                      const needs = d.outcome && NEEDS_FOLLOWUP.has(d.outcome);
                      return (
                        <tr key={d.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{d.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {formatPhone(d.phone)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={
                                needs
                                  ? "rounded bg-success-muted px-1.5 py-0.5 text-xs font-medium text-success-ink"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {d.outcome ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {d.getsInboundLeads ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {d.callbackSpeed ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 tnum text-muted-foreground">
                            {d.durationSecs}s
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <DeleteDemoButton phone={d.phone} name={d.name} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
