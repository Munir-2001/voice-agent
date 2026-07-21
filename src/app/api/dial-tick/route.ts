import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isWithinCallingWindow } from "@/lib/timezone";
import { playbookForIndustry } from "@/lib/agent/industry-playbooks";
import { hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// The scheduler tick. Called every ~15 min by Supabase pg_cron (or an external
// scheduler) during business hours. Picks a few eligible leads and triggers
// outbound calls through ElevenLabs. Secured by a shared secret header.
//
// Eligibility (Dev-Plan §6 / Dev-Manual Phase 4):
//   campaign active · lead-local time in window · not suppressed ·
//   attempts < maxAttempts · today's calls < dailyCap

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`dial-tick:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  // Require the shared secret in EVERY environment (constant-time compare).
  if (!hasValidCronSecret(request)) {
    return apiError(401, "Unauthorized");
  }

  const supabase = createServiceClient();
  const now = new Date();

  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (!settings?.active) {
    return NextResponse.json({ skipped: "campaign paused" });
  }

  const [startHour] = String(settings.window_start ?? "09:00")
    .split(":")
    .map(Number);
  const [endHour] = String(settings.window_end ?? "18:00")
    .split(":")
    .map(Number);

  // Daily cap check.
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("started_at", startOfDay.toISOString());
  if ((todayCount ?? 0) >= settings.daily_cap) {
    return NextResponse.json({ skipped: "daily cap reached" });
  }

  // Candidate leads not yet exhausted.
  const { data: candidates } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["pending", "callback", "no_answer"])
    .lt("attempts", settings.max_attempts)
    .limit(50);

  type LeadRow = {
    id: string;
    name: string;
    business_name: string;
    industry: string;
    phone: string;
    timezone: string;
    attempts: number;
  };

  const eligible = ((candidates ?? []) as LeadRow[])
    .filter((l) =>
      isWithinCallingWindow(l.timezone, startHour, endHour, now),
    )
    .slice(0, settings.calls_per_tick);

  const numbers: string[] = settings.numbers ?? [];
  const placed: string[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const lead = eligible[i];
    const fromNumber = numbers[i % Math.max(numbers.length, 1)];
    try {
      await placeOutboundCall(lead, fromNumber);
      await supabase
        .from("leads")
        .update({
          status: "calling",
          attempts: lead.attempts + 1,
          last_called_at: now.toISOString(),
        })
        .eq("id", lead.id);
      placed.push(lead.id);
    } catch {
      // leave as-is; it stays eligible for the next tick
    }
  }

  return NextResponse.json({ placed: placed.length, ids: placed });
}

// Triggers an ElevenLabs outbound call via the Twilio-connected number.
async function placeOutboundCall(
  lead: {
    id: string;
    name: string;
    business_name: string;
    industry: string;
    phone: string;
  },
  fromNumber: string,
) {
  const res = await fetch(
    "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: lead.phone,
        from_number: fromNumber,
        // Injected into the agent prompt as dynamic variables.
        conversation_initiation_client_data: {
          dynamic_variables: {
            lead_id: lead.id,
            name: lead.name,
            business_name: lead.business_name,
            industry: lead.industry,
            industry_hook: playbookForIndustry(lead.industry)?.valueHook ?? "",
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs outbound ${res.status}`);
  return res.json();
}
