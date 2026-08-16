import "server-only";
// The scheduler core, shared by the cron route (/api/dial-tick) and the on-demand
// "Call now" button (/api/dial-now). Picks eligible leads and places outbound
// calls through ElevenLabs, rotating caller IDs. All compliance guardrails
// (calling window, suppression, daily cap) live here so BOTH callers honor them.

import { createServiceClient } from "@/lib/supabase/server";
import { isWithinCallingWindow } from "@/lib/timezone";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";

// TCPA legal calling hours (lead-local). The configured campaign window must stay
// inside this; a manual "Call now" is clamped to it so it can fire outside the
// tighter business window but never breaks the law.
const LEGAL_START_HOUR = 8;
const LEGAL_END_HOUR = 21;

export interface DialTickResult {
  skipped?: string;
  placed?: number;
  ids?: string[];
  failed?: number;
  errors?: { id: string; error: string }[];
}

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

/**
 * Run one dialing tick.
 *
 * @param opts.manual When true (the "Call now" button), the campaign `active`
 *   pause flag is ignored and the calling window widens to the full legal
 *   8am–9pm lead-local band. Suppression and the daily cap are ALWAYS enforced.
 */
export async function runDialTick(
  opts: { manual?: boolean } = {},
): Promise<DialTickResult> {
  const { manual = false } = opts;
  const supabase = createServiceClient();
  const now = new Date();

  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (!settings) return { skipped: "no campaign settings" };
  // Scheduled ticks respect the pause switch; a manual dial overrides it.
  if (!settings.active && !manual) return { skipped: "campaign paused" };

  // Effective window: the configured business hours for scheduled ticks, or the
  // full legal band for a manual dial (so "Call now" works outside 10–12 but
  // still never dials before 8am / after 9pm local).
  const [cfgStart] = String(settings.window_start ?? "09:00").split(":").map(Number);
  const [cfgEnd] = String(settings.window_end ?? "18:00").split(":").map(Number);
  const startHour = manual ? LEGAL_START_HOUR : cfgStart;
  const endHour = manual ? LEGAL_END_HOUR : cfgEnd;

  // Daily cap — count BOTH completed calls today (the `calls` table, written by
  // the post-call webhook) AND leads currently mid-call (status 'calling', placed
  // today but no webhook back yet). Without the in-flight count a fast, per-minute
  // cadence could overshoot the cap before webhooks land.
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const [completed, inflight] = await Promise.all([
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startOfDay.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "calling")
      .gte("last_called_at", startOfDay.toISOString()),
  ]);
  const placedToday = (completed.count ?? 0) + (inflight.count ?? 0);
  const remainingCap = settings.daily_cap - placedToday;
  if (remainingCap <= 0) return { skipped: "daily cap reached" };

  // Candidate leads not yet exhausted, in upload order so the list is worked
  // top-to-bottom ("one by one down the list").
  const { data: candidates } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["pending", "callback", "no_answer"])
    .lt("attempts", settings.max_attempts)
    .order("created_at", { ascending: true })
    .limit(50);

  const inWindow = ((candidates ?? []) as LeadRow[]).filter((l) =>
    isWithinCallingWindow(l.timezone, startHour, endHour, now),
  );

  // Suppression gate (TCPA): never dial a number on the opt-out/DNC list, even if
  // the lead row itself still looks eligible.
  let blocked = new Set<string>();
  if (inWindow.length > 0) {
    const { data: suppressed, error: supErr } = await supabase
      .from("suppression")
      .select("phone")
      .in("phone", inWindow.map((l) => l.phone));
    if (supErr) {
      // Fail CLOSED: if we cannot verify the opt-out list, place no calls.
      console.error("dial-tick: suppression lookup failed:", supErr.message);
      return { skipped: "suppression list unavailable" };
    }
    blocked = new Set((suppressed ?? []).map((r: { phone: string }) => r.phone));
  }

  // Never place more than the per-tick pacing OR the cap allows, whichever is
  // smaller — so the cap is respected even within a single burst.
  const batchSize = Math.min(settings.calls_per_tick, remainingCap);
  const eligible = inWindow.filter((l) => !blocked.has(l.phone)).slice(0, batchSize);

  // Caller-ID pool = ElevenLabs phone-number IDs (phnum_…), rotated per call.
  const phoneNumberIds = callerNumberIds();
  if (phoneNumberIds.length === 0) {
    console.error("dial-tick: no ELEVENLABS_PHONE_NUMBER_ID(S) configured");
    return { skipped: "no caller numbers configured" };
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

  return {
    placed: placed.length,
    ids: placed,
    failed: failed.length,
    ...(failed.length > 0 ? { errors: failed } : {}),
  };
}
