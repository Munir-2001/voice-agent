import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";
import { listCampaigns, listSequences } from "@/lib/outreach/data";
import { getLeadLists } from "@/lib/data";
import { CampaignsView } from "@/components/outreach/campaigns-view";
import { FadeIn } from "@/components/motion";

export const dynamic = "force-dynamic";

export default async function OutreachCampaignsPage() {
  await requireAdminPage();
  const [campaigns, sequences, lists] = await Promise.all([
    listCampaigns(),
    listSequences(),
    getLeadLists(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Email campaigns"
        description="Send a sequence to a lead list on autopilot — daily cap, weekday send window, tracking, and unsubscribe handled for you."
      />
      <FadeIn>
        <CampaignsView
          campaigns={campaigns}
          sequences={sequences.map((s) => ({ id: s.id, name: s.name, stepCount: s.stepCount }))}
          lists={lists.map((l) => ({ id: l.id, name: l.name, total: l.total }))}
        />
      </FadeIn>
    </div>
  );
}
