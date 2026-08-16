import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion";
import { InterestedCard } from "@/components/interested-card";
import { getInterestedLeads } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InterestedPage() {
  const items = await getInterestedLeads();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Interested leads"
        description="Warm prospects the agent qualified. Call them back yourself — the context is here."
      />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Sparkles className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">No interested leads yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            When the agent qualifies someone as interested or books a callback, they show
            up here for you to call back.
          </p>
        </Card>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {items.map(({ lead, call }) => (
            <StaggerItem key={lead.id}>
              <InterestedCard lead={lead} call={call} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
