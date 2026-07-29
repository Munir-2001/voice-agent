import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isWithinCallingWindow } from "@/lib/timezone";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";
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
    email: string | null;
    phone: string;
    timezone: string;
    attempts: number;
  };

  // Suppression gate (TCPA): never dial a number on the opt-out/DNC list, even if
  // the lead row itself still looks eligible. Checked against the candidate phones
  // only, so this stays one small indexed query.
  const inWindow = ((candidates ?? []) as LeadRow[]).filter((l) =>
    isWithinCallingWindow(l.timezone, startHour, endHour, now),
  );

  let blocked = new Set<string>();
  if (inWindow.length > 0) {
    const { data: suppressed, error: supErr } = await supabase
      .from("suppression")
      .select("phone")
      .in("phone", inWindow.map((l) => l.phone));
    if (supErr) {
      // Fail CLOSED: if we cannot verify the opt-out list, place no calls.
      console.error("dial-tick: suppression lookup failed:", supErr.message);
      return apiError(503, "Suppression list unavailable");
    }
    blocked = new Set((suppressed ?? []).map((r: { phone: string }) => r.phone));
  }

  const eligible = inWindow
    .filter((l) => !blocked.has(l.phone))
    .slice(0, settings.calls_per_tick);

  // Caller-ID pool = ElevenLabs phone-number IDs (phnum_…), rotated per call.
  const phoneNumberIds = callerNumberIds();
  if (phoneNumberIds.length === 0) {
    console.error("dial-tick: no ELEVENLABS_PHONE_NUMBER_ID(S) configured");
    return NextResponse.json({ skipped: "no caller numbers configured" });
  }

  const placed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const lead = eligible[i];
    const agentPhoneNumberId = phoneNumberIds[i % phoneNumberIds.length];
    try {
      await placeOutboundCall(lead, agentPhoneNumberId);
      await supabase
        .from("leads")
        .update({
          status: "calling",
          attempts: lead.attempts + 1,
          last_called_at: now.toISOString(),
        })
        .eq("id", lead.id);
      placed.push(lead.id);
    } catch (err) {
      // Leave the lead as-is so it stays eligible next tick, but never swallow the
      // reason — a silent catch here hides bad keys/IDs during setup.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`dial-tick: call failed for lead ${lead.id}:`, message);
      failed.push({ id: lead.id, error: message });
    }
  }

  return NextResponse.json({
    placed: placed.length,
    ids: placed,
    failed: failed.length,
    ...(failed.length > 0 ? { errors: failed } : {}),
  });
}
