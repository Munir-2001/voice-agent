import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads-table";
import { FadeIn } from "@/components/motion";
import { getLeadsPage, getLeadStatusCounts, getCalls } from "@/lib/data";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; size?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_SIZE;
  const q = sp.q ?? "";
  const status = sp.status ?? "all";

  const [{ leads, total }, statusCounts, calls] = await Promise.all([
    getLeadsPage({ page, pageSize, q, status }),
    getLeadStatusCounts(),
    getCalls(500),
  ]);

  // Map each lead to its most recent call so those rows open the transcript.
  const callIdByLead: Record<string, string> = {};
  for (const c of calls) if (!callIdByLead[c.leadId]) callIdByLead[c.leadId] = c.id;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="All leads"
        description="Every contact in this workspace and where the agent left them."
      />
      <FadeIn>
        <LeadsTable
          leads={leads}
          total={total}
          page={page}
          pageSize={pageSize}
          q={q}
          status={status}
          statusCounts={statusCounts}
          callIdByLead={callIdByLead}
        />
      </FadeIn>
    </div>
  );
}
