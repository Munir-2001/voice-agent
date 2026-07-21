import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads-table";
import { FadeIn } from "@/components/motion";
import { leads } from "@/lib/sample-data";

export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="All leads"
        description="Every contact in the campaign and where the agent left them."
      />
      <FadeIn>
        <LeadsTable leads={leads} />
      </FadeIn>
    </div>
  );
}
