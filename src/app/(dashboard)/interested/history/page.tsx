import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { InterestedTable } from "@/components/interested-table";
import { getInterestedHistory } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InterestedHistoryPage() {
  const items = await getInterestedHistory();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Interested history"
        description="Every warm lead you've already called back. Kept here for the record once you mark them contacted."
      />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <History className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">No history yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            When you mark an interested lead as contacted, it moves out of the queue
            and shows up here.
          </p>
        </Card>
      ) : (
        <InterestedTable items={items} history />
      )}
    </div>
  );
}
