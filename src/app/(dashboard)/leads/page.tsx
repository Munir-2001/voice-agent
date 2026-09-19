import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads-table";
import { FadeIn } from "@/components/motion";
import { getLeadsPage, getLeadStatusCounts, getCalls, getLeadLists } from "@/lib/data";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; size?: string; list?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_SIZE;
  const q = sp.q ?? "";
  const status = sp.status ?? "all";
  const listId = Number.isFinite(Number(sp.list)) && sp.list ? Number(sp.list) : undefined;

  const [{ leads, total }, statusCounts, calls, lists] = await Promise.all([
    getLeadsPage({ page, pageSize, q, status, listId }),
    getLeadStatusCounts(listId),
    getCalls(500),
    listId !== undefined ? getLeadLists() : Promise.resolve([]),
  ]);

  const activeList = listId !== undefined ? lists.find((l) => l.id === listId) : undefined;

  // Map each lead to its most recent call so those rows open the transcript.
  const callIdByLead: Record<string, string> = {};
  for (const c of calls) if (!callIdByLead[c.leadId]) callIdByLead[c.leadId] = c.id;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {activeList && (
        <Link
          href="/lists"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All lists
        </Link>
      )}
      <PageHeader
        title={activeList ? activeList.name : "All leads"}
        description={
          activeList
            ? `${activeList.total.toLocaleString()} leads in this list${activeList.active ? " · currently being called" : ""}.`
            : "Every contact in this workspace and where the agent left them."
        }
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
          listId={listId}
        />
      </FadeIn>
    </div>
  );
}
