import { PageHeader } from "@/components/page-header";
import { LeadListsManager } from "@/components/lead-lists-manager";
import { FadeIn } from "@/components/motion";
import { getLeadLists } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const lists = await getLeadLists();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Lead lists"
        description="Create separate lists, upload leads into each, and set one active — the dialer calls only the active list. Set “All leads” to dial the whole workspace."
      />
      <FadeIn>
        <LeadListsManager lists={lists} />
      </FadeIn>
    </div>
  );
}
