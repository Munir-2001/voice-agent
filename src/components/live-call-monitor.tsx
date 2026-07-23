"use client";

import { Radio, Building2, PhoneOutgoing, PhoneOff } from "lucide-react";
import { initials } from "@/lib/format";
import { useCampaign } from "@/components/campaign-context";

export interface CallingNow {
  name: string;
  business: string;
  industry: string;
}

// Shows the lead the agent is dialing right now (leads.status === "calling"),
// or an honest idle/paused state. The full transcript lands on the call detail
// page once ElevenLabs posts the completed call back — we don't fake a stream.
export function LiveCallMonitor({ calling }: { calling: CallingNow | null }) {
  const { active } = useCampaign();

  if (calling) {
    return (
      <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2.5 border-b bg-success/[0.04] px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-success">
            On a call
          </span>
          <BigWaveform />
        </div>

        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials(calling.name) || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{calling.name || "Unknown"}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Building2 className="size-3" />
              {[calling.business, calling.industry].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10">
            <PhoneOutgoing className="size-5 text-success" />
          </span>
          <p className="text-sm font-medium">Agent is speaking with this lead</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The transcript and outcome appear on the call detail page the moment
            the call wraps up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {active ? (
          <Radio className="size-5 text-muted-foreground" />
        ) : (
          <PhoneOff className="size-5 text-muted-foreground" />
        )}
      </span>
      <p className="text-sm font-medium">
        {active ? "No active call right now" : "Campaign paused"}
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {active
          ? "The agent dials eligible leads during business hours. Live calls appear here as they connect."
          : "Flip the switch in the top bar to put the agent live. Active calls appear here in real time."}
      </p>
    </div>
  );
}

function BigWaveform() {
  const bars = [0.2, 0.5, 0.15, 0.35, 0.6, 0.25, 0.45, 0.3, 0.55, 0.2];
  return (
    <span className="ml-1 flex h-4 items-center gap-[2px]" aria-hidden>
      {bars.map((d, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-success/70"
          style={{ height: "100%", animation: `eq 0.9s ease-in-out ${d}s infinite` }}
        />
      ))}
    </span>
  );
}
