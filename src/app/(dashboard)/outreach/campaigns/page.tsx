import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";

export default async function OutreachCampaignsPage() {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Email campaigns"
        description="Cold-email drips: pick a list, choose a sequence, launch. Sent → opened → clicked → replied per step."
      />
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        The 4-step campaign builder (Audience → Sequence → Emails → Launch) ships
        in the next phase. Import the Florida broker list under{" "}
        <span className="font-medium text-foreground">Leads → Upload</span> in the
        meantime.
      </p>
    </div>
  );
}
