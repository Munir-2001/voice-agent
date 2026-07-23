import Link from "next/link";
import { Phone, PhoneOutgoing, Sparkles, Clock, ChevronRight, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { CampaignHero } from "@/components/campaign-hero";
import { LiveCallMonitor } from "@/components/live-call-monitor";
import { LiveActivityFeed, type ActivityItem } from "@/components/live-activity-feed";
import { CallsChart } from "@/components/calls-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stagger, StaggerItem, FadeIn } from "@/components/motion";
import { getLeads, getCalls, computeStats } from "@/lib/data";
import { LEAD_STATUS_META, TONE_DOT } from "@/lib/status";

export const dynamic = "force-dynamic";

const MONTH_TARGET = 500;

export default async function OverviewPage() {
  // 35-day window fully covers "this month" (so month stats never truncate) and
  // bounds the connect rate to recent performance. Newest-first from getCalls.
  const since = new Date(Date.now() - 35 * 86_400_000).toISOString();
  const [leads, calls] = await Promise.all([getLeads(), getCalls(2000, since)]);
  const stats = computeStats(leads, calls);
  const warm = stats.interested + stats.callbacks;
  const maxCount = Math.max(1, ...stats.outcomeCounts.map((c) => c.count));

  // Real feeds for the live row (no simulated data).
  const activity: ActivityItem[] = calls.slice(0, 8).map((c) => ({
    id: c.id,
    name: c.leadName || c.businessName,
    outcome: c.outcome,
    text: c.summary,
    at: c.startedAt,
  }));
  const dialing = leads.find((l) => l.status === "calling");
  const calling = dialing
    ? { name: dialing.name, business: dialing.businessName, industry: dialing.industry }
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FadeIn>
        <CampaignHero
          callsToday={stats.callsToday}
          interestedToday={stats.interestedToday}
          monthDone={stats.dialsThisMonth}
          monthTarget={MONTH_TARGET}
        />
      </FadeIn>

      {/* actionable "needs your attention" banner */}
      {warm > 0 && (
        <FadeIn delay={0.05}>
          <Link
            href="/interested"
            className="group flex items-center gap-4 rounded-xl border border-success/30 bg-success/[0.05] px-5 py-4 transition-colors hover:bg-success/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15">
              <Sparkles className="size-5 text-success" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {warm} warm {warm === 1 ? "lead is" : "leads are"} waiting for your callback
              </p>
              <p className="text-sm text-muted-foreground">
                The agent qualified them — call them back while the interest is fresh.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
              Review
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </FadeIn>
      )}

      {/* stats */}
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Dials this month" value={stats.dialsThisMonth} accent="blue" hint={`Target ${MONTH_TARGET} / month`} icon={<PhoneOutgoing className="size-4" />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Connect rate" value={stats.connectRate} suffix="%" accent="blue" hint="Live human answers" icon={<Phone className="size-4" />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Interested" value={stats.interested} accent="green" hint="Ready for callback" icon={<Sparkles className="size-4" />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Callbacks due" value={stats.callbacks} accent="yellow" hint="Requested a time" icon={<Clock className="size-4" />} />
        </StaggerItem>
      </Stagger>

      {/* live row (real state — current call + recent activity) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.1} className="lg:col-span-2">
          <LiveCallMonitor calling={calling} />
        </FadeIn>
        <FadeIn delay={0.16}>
          <Card className="h-full gap-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                Recent activity
                {calling && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    on a call
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <LiveActivityFeed items={activity} />
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* analytics row (live) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.1} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Dials &amp; interested — last 2 weeks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.dialsThisMonth === 0 && calls.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
                  No calls yet — activate the campaign and this fills in.
                </div>
              ) : (
                <CallsChart data={stats.dailySeries} />
              )}
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.16}>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Outcomes</CardTitle>
              <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                All leads
                <ChevronRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {stats.outcomeCounts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No leads yet — upload a list to get started.
                </p>
              ) : (
                stats.outcomeCounts.map((c) => (
                  <div key={c.status} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${TONE_DOT[LEAD_STATUS_META[c.status].tone]}`} />
                        {LEAD_STATUS_META[c.status].label}
                      </span>
                      <span className="font-medium tnum">{c.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${TONE_DOT[LEAD_STATUS_META[c.status].tone]}`}
                        style={{ width: `${(c.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
