import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";

export default async function OutreachTemplatesPage() {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Templates"
        description="Individual email templates with merge variables ({{firstName}}, {{company}}) and live preview."
      />
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        The template editor ships in the next phase.
      </p>
    </div>
  );
}
