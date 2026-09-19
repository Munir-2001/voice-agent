import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";
import { campaignReports, type CampaignReport } from "@/lib/outreach/data";
import { FadeIn } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default async function OutreachReportsPage() {
  await requireAdminPage();
  const reports = await campaignReports();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Reports"
        description="Delivery and engagement per campaign. Opens are directional (Gmail/Apple proxy caching inflates them) — trust clicks and replies most."
      />

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No campaigns to report on yet.
        </div>
      ) : (
        <FadeIn>
          <div className="space-y-4">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: CampaignReport }) {
  const metrics: { label: string; value: number; sub?: string }[] = [
    { label: "Enrolled", value: report.enrolled },
    { label: "Sent", value: report.sent },
    { label: "Opened", value: report.opened, sub: pct(report.opened, report.sent) },
    { label: "Clicked", value: report.clicked, sub: pct(report.clicked, report.sent) },
    { label: "Unsub", value: report.unsubscribed, sub: pct(report.unsubscribed, report.sent) },
    { label: "Bounced", value: report.bounced, sub: pct(report.bounced, report.sent) },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{report.name}</CardTitle>
        <Badge variant={report.status === "active" ? "default" : "outline"}>
          {report.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-2xl font-semibold tabular-nums">{m.value}</div>
              <div className="text-xs text-muted-foreground">
                {m.label}
                {m.sub ? ` · ${m.sub}` : ""}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
