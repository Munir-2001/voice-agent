import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";
import { listSequences, getSequence } from "@/lib/outreach/data";
import { renderMerge } from "@/lib/outreach/mailer";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Sample merge values so the preview reads like a real send.
const SAMPLE_VARS: Record<string, string> = {
  name: "Alex Rivera",
  firstName: "Alex",
  first_name: "Alex",
  company: "Sunrise Realty",
  business_name: "Sunrise Realty",
  industry: "Real Estate",
  email: "alex@example.com",
  demoLink: "https://your-site.com/demo",
};

export default async function OutreachTemplatesPage() {
  await requireAdminPage();
  const summaries = await listSequences();
  const sequences = (
    await Promise.all(summaries.map((s) => getSequence(s.id)))
  ).filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Email previews"
        description="See exactly what each email looks like with merge fields filled in. Edit the copy in Sequences."
      />

      {sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No sequences yet. Seed or create one in{" "}
          <Link href="/outreach/sequences" className="underline underline-offset-4">
            Sequences
          </Link>
          .
        </div>
      ) : (
        sequences.map((seq) => (
          <section key={seq.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{seq.name}</h2>
              <Badge variant="secondary">{seq.steps.length} emails</Badge>
              <Link
                href={`/outreach/sequences/${seq.id}`}
                className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Edit
              </Link>
            </div>
            <div className="space-y-4">
              {seq.steps.map((step) => (
                <div key={step.id} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
                    <span className="font-medium">
                      {renderMerge(step.subject, SAMPLE_VARS)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      Day {step.day_offset}
                      {step.active ? "" : " · inactive"}
                    </span>
                  </div>
                  <iframe
                    title={`Preview: ${step.subject}`}
                    srcDoc={renderMerge(step.body_html, SAMPLE_VARS)}
                    className="h-[28rem] w-full bg-white"
                    sandbox=""
                  />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
