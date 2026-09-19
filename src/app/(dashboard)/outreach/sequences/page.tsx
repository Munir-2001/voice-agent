import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";
import { listSequences } from "@/lib/outreach/data";
import { SequenceActions } from "@/components/outreach/sequence-actions";
import { FadeIn } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  soap_opera: "Soap Opera",
  seinfeld: "Seinfeld",
  custom: "Custom",
};

export default async function OutreachSequencesPage() {
  await requireAdminPage();
  const sequences = await listSequences();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Sequences"
        description="Reusable email arcs. Write the Soap Opera (5-day) and Seinfeld (ongoing) sequences once, run them on any list."
        actions={<SequenceActions hasSequences={sequences.length > 0} />}
      />

      {sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">No sequences yet</p>
          <p>
            Click <span className="font-medium">Seed starter sequences</span> to
            load the Russell Brunson Soap Opera + Seinfeld emails, ready to edit.
          </p>
        </div>
      ) : (
        <FadeIn>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Emails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequences.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/outreach/sequences/${s.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {KIND_LABEL[s.kind] ?? s.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.stepCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
