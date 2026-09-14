"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveWaveform } from "@/components/live-indicator";
import { useCampaign } from "@/components/campaign-context";
import { cn } from "@/lib/utils";

// One live campaign elsewhere in the account (mirrors data.ts ActiveCampaign).
interface OtherCampaign {
  workspaceId: number;
  name: string;
  dailyCap: number;
  goalType: string;
  placedToday: number;
}

export function CampaignControl() {
  const { active, setActive } = useCampaign();
  const [pending, setPending] = useState(false);
  // Non-empty → the confirm dialog is open, listing the campaigns already live.
  const [conflicts, setConflicts] = useState<OtherCampaign[] | null>(null);

  // POST the toggle. `force` bypasses the double-activation guardrail after the
  // user confirms. Returns true when the campaign's active state actually changed.
  async function post(next: boolean, force: boolean): Promise<boolean> {
    const res = await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next, force }),
    });
    // 409 = another campaign is already live. Surface the confirm dialog instead
    // of flipping on — this is the guard against two agents dialing in parallel.
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setConflicts((data.others as OtherCampaign[]) ?? []);
      return false;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Could not update the campaign");
    }
    return true;
  }

  async function toggle(next: boolean) {
    setPending(true);
    try {
      const changed = await post(next, false);
      if (changed) {
        setActive(next);
        toast[next ? "success" : "message"](
          next ? "Campaign activated" : "Campaign paused",
          {
            description: next
              ? "The agent will place calls during business hours."
              : "No new calls will be placed until reactivated.",
          },
        );
      }
      // If not changed, either a conflict dialog opened (handled) or nothing to do.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the campaign");
    } finally {
      setPending(false);
    }
  }

  // User saw the warning and chose to run in parallel anyway.
  async function confirmActivate() {
    setPending(true);
    try {
      const changed = await post(true, true);
      if (changed) {
        setActive(true);
        setConflicts(null);
        toast.success("Campaign activated", {
          description: "Running alongside another live campaign — watch your spend.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate the campaign");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border py-1.5 pl-3 pr-1.5 transition-colors",
          active ? "border-success/30 bg-success/5" : "border-border bg-card",
        )}
      >
        <LiveWaveform active={active} />
        <span
          className={cn(
            "text-sm font-medium tnum",
            active ? "text-success" : "text-muted-foreground",
          )}
        >
          {active ? "Live" : "Paused"}
        </span>
        <Switch
          checked={active}
          disabled={pending}
          onCheckedChange={toggle}
          aria-label="Toggle campaign"
          className="data-[state=checked]:bg-success"
        />
      </div>

      <Dialog
        open={conflicts !== null}
        onOpenChange={(open) => !open && setConflicts(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Another campaign is already live
            </DialogTitle>
            <DialogDescription>
              Activating this one means{" "}
              <strong>two agents dial in parallel</strong>, which doubles your
              Twilio + ElevenLabs spend. Only continue if that&apos;s intended.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {(conflicts ?? []).map((c) => (
              <div
                key={c.workspaceId}
                className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.goalType === "ai_meeting" ? "AI meeting" : "Financing"} · cap{" "}
                    {c.dailyCap}/day
                  </div>
                </div>
                <span className="tnum text-xs text-muted-foreground">
                  {c.placedToday} placed today
                </span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConflicts(null)}
              disabled={pending}
            >
              Keep it paused
            </Button>
            <Button
              variant="destructive"
              onClick={confirmActivate}
              disabled={pending}
            >
              Run both anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
