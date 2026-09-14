import { PageHeader } from "@/components/page-header";
import { CallRequestsQueue } from "@/components/call-requests-queue";
import { AutoRefresh } from "@/components/auto-refresh";
import { FadeIn } from "@/components/motion";
import { getCallRequests } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = await getCallRequests();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Keep the queue fresh as new requests arrive. */}
      <AutoRefresh intervalMs={30_000} />
      <PageHeader
        title="Call requests"
        description="People who asked for a demo AI call. Approve one to add them as a lead your active campaign will call — nothing dials until you approve."
      />
      <FadeIn>
        <CallRequestsQueue initial={requests} />
      </FadeIn>
    </div>
  );
}
