import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";

export default async function OutreachReportsPage() {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Reports"
        description="Deliverability + engagement across campaigns: sends, opens (directional), clicks, replies, unsubscribes, bounces."
      />
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        The reporting dashboard ships in the next phase.
      </p>
    </div>
  );
}
