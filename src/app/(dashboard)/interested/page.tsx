import Link from "next/link";
import { Phone, FileText, Building2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion";
import { MarkContactedButton } from "@/components/mark-contacted";
import { getInterestedLeads } from "@/lib/data";
import { formatPhone, relativeTime, initials } from "@/lib/format";

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
              <Card className="hover-lift h-full gap-0 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {initials(lead.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{lead.name.trim() || "Unknown"}</h3>
                    <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" />
                      {lead.businessName || lead.email || "—"}
                    </p>
                  </div>
                  {lead.status === "callback" && (
                    <span className="rounded-full border border-warning/30 bg-warning-muted px-2.5 py-0.5 text-xs font-medium text-warning-ink">
                      Callback
                    </span>
                  )}
                </div>

                {call?.summary && (
                  <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    “{call.summary}”
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div>
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex items-center gap-2 font-mono text-base font-medium tracking-tight hover:text-success"
                    >
                      <Phone className="size-4 text-success" />
                      {formatPhone(lead.phone)}
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last spoke {relativeTime(lead.lastCalledAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {call && (
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        className="gap-1.5 text-muted-foreground"
                        render={<Link href={`/calls/${call.id}`} />}
                      >
                        <FileText className="size-4" />
                        Transcript
                      </Button>
                    )}
                    <MarkContactedButton leadId={lead.id} name={lead.name.trim() || "this lead"} />
                  </div>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
