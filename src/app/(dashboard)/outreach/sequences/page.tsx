import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";

export default async function OutreachSequencesPage() {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Sequences"
        description="Reusable email arcs. Write the Soap Opera (5-day) and Seinfeld (ongoing) sequences once, run them on any list."
      />
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        The sequence editor — seeded from your Russell Brunson Soap Opera
        sequence — ships in the next phase.
      </p>
    </div>
  );
}
