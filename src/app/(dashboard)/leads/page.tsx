import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads-table";
import { FadeIn } from "@/components/motion";
import { getLeads, getCalls } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, calls] = await Promise.all([getLeads(), getCalls(500)]);

  // Map each lead to its most recent call so those rows open the transcript.
  const callIdByLead: Record<string, string> = {};
  for (const c of calls) if (!callIdByLead[c.leadId]) callIdByLead[c.leadId] = c.id;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="All leads"
        description="Every contact in the campaign and where the agent left them."
      />
      <FadeIn>
        <LeadsTable leads={leads} callIdByLead={callIdByLead} />
      </FadeIn>
    </div>
  );
}
