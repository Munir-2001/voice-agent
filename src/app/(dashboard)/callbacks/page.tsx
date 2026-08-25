import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { InterestedTable } from "@/components/interested-table";
import { getCallbackLeads } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CallbacksPage() {
  const items = await getCallbackLeads();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Callbacks"
        description="Prospects who asked to be called back at a specific time. These aren't marked interested — call them at the time they requested."
      />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Clock className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">No callbacks scheduled</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            When a live person asks to be called back at a later time, they show up
            here with the time they requested.
          </p>
        </Card>
      ) : (
        <InterestedTable items={items} />
      )}
    </div>
  );
}
