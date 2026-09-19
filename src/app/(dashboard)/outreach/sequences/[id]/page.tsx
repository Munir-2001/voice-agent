import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/lib/admin";
import { getSequence } from "@/lib/outreach/data";
import { SequenceEditor } from "@/components/outreach/sequence-editor";

export const dynamic = "force-dynamic";

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const sequenceId = Number(id);
  if (!Number.isFinite(sequenceId)) notFound();

  const sequence = await getSequence(sequenceId);
  if (!sequence) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/outreach/sequences"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All sequences
      </Link>
      <PageHeader
        title={sequence.name}
        description="Each email fires on its send-day after a lead is enrolled. Merge vars: {{firstName}}, {{company}}, {{demoLink}}. Links are tracked automatically; a CAN-SPAM footer + unsubscribe is appended on send."
      />
      <SequenceEditor sequenceId={sequence.id} initialSteps={sequence.steps} />
    </div>
  );
}
