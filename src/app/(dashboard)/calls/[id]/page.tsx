import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Phone,
  Clock,
  Calendar,
  Hash,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CallOutcomeBadge } from "@/components/status-badge";
import { CallPlayer } from "@/components/call-player";
import { MarkContactedButton } from "@/components/mark-contacted";
import { FadeIn } from "@/components/motion";
import { getCallById, getLeadById } from "@/lib/data";
import { formatPhone, formatDuration, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = await getCallById(id);
  if (!call) notFound();

  const lead = call.leadId ? await getLeadById(call.leadId) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="gap-1.5 text-muted-foreground"
        render={<Link href="/leads" />}
      >
        <ArrowLeft className="size-4" />
        Back to leads
      </Button>

      <PageHeader
        title={call.leadName.trim()}
        description={call.businessName}
        actions={<CallOutcomeBadge outcome={call.outcome} />}
      />

      <FadeIn>
        <CallPlayer durationSecs={call.durationSecs} />
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FadeIn delay={0.05}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {call.summary}
                </p>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {call.transcript.map((turn, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      turn.role === "agent" ? "" : "flex-row-reverse",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase",
                        turn.role === "agent"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {turn.role === "agent" ? "AI" : "P"}
                    </span>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        turn.role === "agent"
                          ? "rounded-tl-sm bg-muted"
                          : "rounded-tr-sm bg-primary text-primary-foreground",
                      )}
                    >
                      {turn.text}
                      <span
                        className={cn(
                          "mt-1 block font-mono text-[10px] tnum",
                          turn.role === "agent"
                            ? "text-muted-foreground"
                            : "text-primary-foreground/60",
                        )}
                      >
                        {formatDuration(turn.at)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </FadeIn>
        </div>

        <FadeIn delay={0.15} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-sm">
              <Detail icon={<Building2 className="size-4" />} label="Business">
                {call.businessName}
              </Detail>
              {lead && (
                <Detail icon={<Phone className="size-4" />} label="Phone">
                  <a
                    href={`tel:${lead.phone}`}
                    className="font-mono hover:text-success"
                  >
                    {formatPhone(lead.phone)}
                  </a>
                </Detail>
              )}
              <Detail icon={<Calendar className="size-4" />} label="When">
                {formatDateTime(call.startedAt)}
              </Detail>
              <Detail icon={<Clock className="size-4" />} label="Duration">
                {formatDuration(call.durationSecs)}
              </Detail>
              <Detail icon={<Hash className="size-4" />} label="From number">
                <span className="font-mono">{formatPhone(call.numberUsed)}</span>
              </Detail>
            </CardContent>
          </Card>

          {(call.outcome === "interested" || call.outcome === "callback") &&
            lead && (
              <Card className="border-success/30 bg-success/[0.04]">
                <CardContent className="space-y-3 pt-6">
                  <p className="text-sm font-medium">Ready for your callback</p>
                  <p className="text-xs text-muted-foreground">
                    Call {lead.name.trim()} back while the interest is warm.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      nativeButton={false}
                      className="flex-1 gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                      render={<a href={`tel:${lead.phone}`} />}
                    >
                      <Phone className="size-4" />
                      Call now
                    </Button>
                    <MarkContactedButton leadId={lead.id} name={lead.name.trim()} />
                  </div>
                </CardContent>
              </Card>
            )}
        </FadeIn>
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
