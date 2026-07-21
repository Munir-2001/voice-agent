"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { LiveWaveform } from "@/components/live-indicator";
import { useCampaign } from "@/components/campaign-context";
import { cn } from "@/lib/utils";

export function CampaignControl() {
  const { active, setActive } = useCampaign();
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setPending(true);
    setActive(next);
    // Real wiring: await fetch("/api/campaign", { method: "POST", body: JSON.stringify({ active: next }) })
    await new Promise((r) => setTimeout(r, 300));
    setPending(false);
    toast[next ? "success" : "message"](
      next ? "Campaign activated" : "Campaign paused",
      {
        description: next
          ? "The agent will place calls during business hours."
          : "No new calls will be placed until reactivated.",
      },
    );
  }

  return (
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
  );
}
