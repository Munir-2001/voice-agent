import { AlertTriangle } from "lucide-react";
import { getActiveCampaignsForUser } from "@/lib/data";

// Account-wide transparency: shows exactly which campaigns are dialing RIGHT NOW.
// Silent when 0–1 campaigns are live (the safe case). When 2+ are live it turns
// into a warning — running agents in parallel doubles Twilio + ElevenLabs spend,
// which is the failure that went unnoticed for a week. A server component so it
// reflects true DB state on every load (the overview auto-refreshes every 15s).
export async function ActiveCampaignsBanner() {
  const active = await getActiveCampaignsForUser();
  if (active.length < 2) return null;

  const totalCap = active.reduce((s, c) => s + c.dailyCap, 0);
  const totalPlaced = active.reduce((s, c) => s + c.placedToday, 0);

  return (
    <div className="rounded-xl border border-warning/40 bg-warning-muted/40 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20">
          <AlertTriangle className="size-4 text-warning-ink" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {active.length} campaigns are live at the same time
          </p>
          <p className="text-sm text-muted-foreground">
            Running agents in parallel multiplies your Twilio + ElevenLabs spend
            (~{totalCap} calls/day combined · {totalPlaced} placed today). Pause any
            you&apos;re not actively using from its workspace.
          </p>
          <ul className="mt-3 space-y-1.5">
            {active.map((c) => (
              <li
                key={c.workspaceId}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span className="font-medium">{c.name}</span>
                  {c.isCurrent && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      current
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {c.goalType === "ai_meeting" ? "AI meeting" : "Financing"}
                  </span>
                </span>
                <span className="tnum text-xs text-muted-foreground">
                  {c.placedToday}/{c.dailyCap} today
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
