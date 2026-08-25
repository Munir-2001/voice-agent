import "server-only";
// The scheduler core, shared by the cron route (/api/dial-tick) and the on-demand
// "Call now" button (/api/dial-now). Picks eligible leads and places outbound
// calls through ElevenLabs, rotating caller IDs. All compliance guardrails
// (calling window, suppression, daily cap) live here so BOTH callers honor them.
//
// Everything is scoped to a single workspace: its own settings, leads,
// per-workspace suppression list, cap, window and pacing. The cron runs every
// active workspace independently via runAllActiveWorkspaces().

import { createServiceClient } from "@/lib/supabase/server";
import { isWithinCallingWindow, openTimezones } from "@/lib/timezone";
import {
  placeOutboundCall,
  callerNumberIds,
  areaCodeOf,
  parseAreaMap,
} from "@/lib/agent/outbound";

// TCPA legal calling hours (lead-local). The configured campaign window must stay
// inside this; a manual "Call now" is clamped to it so it can fire outside the
// tighter business window but never breaks the law.
const LEGAL_START_HOUR = 8;
const LEGAL_END_HOUR = 21;

export interface DialTickResult {
  workspaceId?: number;
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
 * Run one dialing tick for ONE workspace.
 *
 * @param workspaceId The workspace whose settings/leads/suppression apply.
 * @param opts.manual When true (the "Call now" button), the campaign `active`
 *   pause flag is ignored and the calling window widens to the full legal
 *   8am–9pm lead-local band. Suppression and the daily cap are ALWAYS enforced.
 */
export async function runDialTick(
  workspaceId: number,
  opts: { manual?: boolean } = {},
): Promise<DialTickResult> {
  const { manual = false } = opts;
  const supabase = createServiceClient();
  const now = new Date();

  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!settings) return { workspaceId, skipped: "no campaign settings" };
  // Scheduled ticks respect the pause switch; a manual dial overrides it.
  if (!settings.active && !manual) return { workspaceId, skipped: "campaign paused" };

  // Effective window: the configured business hours for scheduled ticks, or the
  // full legal band for a manual dial (so "Call now" works outside the window
  // but still never dials before 8am / after 9pm local).
  const [cfgStart] = String(settings.window_start ?? "09:00").split(":").map(Number);
  const [cfgEnd] = String(settings.window_end ?? "18:00").split(":").map(Number);
  const startHour = manual ? LEGAL_START_HOUR : cfgStart;
  const endHour = manual ? LEGAL_END_HOUR : cfgEnd;

  // Daily cap — count BOTH completed calls today (the `calls` table, written by
  // the post-call webhook) AND leads currently mid-call (status 'calling', placed
  // today but no webhook back yet). Scoped to this workspace.
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const [completed, inflight] = await Promise.all([
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("started_at", startOfDay.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "calling")
      .gte("last_called_at", startOfDay.toISOString()),
  ]);
  const placedToday = (completed.count ?? 0) + (inflight.count ?? 0);
  const remainingCap = settings.daily_cap - placedToday;
  if (remainingCap <= 0) return { workspaceId, skipped: "daily cap reached" };

  // Even-spread pacing (scheduled ticks only): spread `daily_cap` calls evenly
  // across the window. gap = window-minutes / daily-cap; place only if the most
  // recent placement today was at least `gap` ago. A manual "Call now" bypasses.
  if (!manual) {
    const windowMinutes = Math.max(1, (endHour - startHour) * 60);
    const gapMs = (windowMinutes / settings.daily_cap) * 60_000;
    const { data: recent } = await supabase
      .from("leads")
      .select("last_called_at")
      .eq("workspace_id", workspaceId)
      .gte("last_called_at", startOfDay.toISOString())
      .order("last_called_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMs = recent?.last_called_at
      ? new Date(recent.last_called_at).getTime()
      : 0;
    if (lastMs && now.getTime() - lastMs < gapMs) {
      return { workspaceId, skipped: "pacing: waiting for next slot" };
    }
  }

  // Which US timezones are open RIGHT NOW (weekday + local hour in window).
  // We query only these, so the dialer always reaches whoever is open (East
  // Coast in the morning, West Coast later) instead of stalling on out-of-window
  // leads that happen to be first by upload order.
  const openTzs = openTimezones(startHour, endHour, now);
  if (openTzs.length === 0) {
    return { workspaceId, skipped: "outside calling window" };
  }

  // Which statuses are re-dialable. The AI-meeting goal also retries voicemail
  // and gatekeeper (not_decision_maker) calls; financing keeps its original set.
  const retryable =
    settings.goal_type === "ai_meeting"
      ? ["pending", "callback", "no_answer", "voicemail", "not_decision_maker"]
      : ["pending", "callback", "no_answer"];

  // Candidate leads not yet exhausted, in this workspace, whose local time is
  // currently open. Order by attempts first so EVERY lead gets a first call
  // before anyone is retried, then upload order.
  let candidatesQuery = supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", retryable)
    .in("timezone", openTzs)
    .lt("attempts", settings.max_attempts);

  // Run the campaign on ONLY the active list, when one is set (null = all leads).
  if (settings.active_list_id != null) {
    candidatesQuery = candidatesQuery.eq("list_id", settings.active_list_id);
  }

  // AI-meeting: never retry a lead the SAME day — only first-touch (never called)
  // or leads last called before today are eligible.
  if (settings.goal_type === "ai_meeting") {
    candidatesQuery = candidatesQuery.or(
      `last_called_at.is.null,last_called_at.lt.${startOfDay.toISOString()}`,
    );
  }

  const { data: candidates } = await candidatesQuery
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  const inWindow = ((candidates ?? []) as LeadRow[]).filter((l) =>
    isWithinCallingWindow(l.timezone, startHour, endHour, now),
  );

  // Suppression gate (TCPA), per-workspace: never dial a number on THIS
  // workspace's opt-out/DNC list, even if the lead row still looks eligible.
  let blocked = new Set<string>();
  if (inWindow.length > 0) {
    const { data: suppressed, error: supErr } = await supabase
      .from("suppression")
      .select("phone")
      .eq("workspace_id", workspaceId)
      .in("phone", inWindow.map((l) => l.phone));
    if (supErr) {
      // Fail CLOSED: if we cannot verify the opt-out list, place no calls.
      console.error("dial-tick: suppression lookup failed:", supErr.message);
      return { workspaceId, skipped: "suppression list unavailable" };
    }
    blocked = new Set((suppressed ?? []).map((r: { phone: string }) => r.phone));
  }

  // Never place more than the per-tick pacing OR the cap allows, whichever is
  // smaller — so the cap is respected even within a single burst.
  const batchSize = Math.min(settings.calls_per_tick, remainingCap);
  const eligible = inWindow.filter((l) => !blocked.has(l.phone)).slice(0, batchSize);

  // Caller-ID pool: the campaign's own numbers if set (e.g. the California number
  // for NextGen), else the env default. Rotated per call.
  const phoneNumberIds = settings.caller_number_ids
    ? String(settings.caller_number_ids)
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : callerNumberIds();
  if (phoneNumberIds.length === 0) {
    console.error("dial-tick: no ELEVENLABS_PHONE_NUMBER_ID(S) configured");
    return { workspaceId, skipped: "no caller numbers configured" };
  }

  // Nothing to place — report WHICH gate emptied the list.
  if (eligible.length === 0) {
    if (!candidates || candidates.length === 0) return { workspaceId, skipped: "no eligible leads" };
    if (inWindow.length === 0) return { workspaceId, skipped: "outside calling window" };
    return { workspaceId, skipped: "all remaining leads suppressed" };
  }

  // Local-presence map (area code → phnum id). When a lead's area code matches,
  // we call from a same-area number for a much higher pickup rate; otherwise we
  // fall back to normal day-long rotation below.
  const areaMap = parseAreaMap(process.env.ELEVENLABS_PHONE_AREA_MAP);

  const placed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const lead = eligible[i];
    // Prefer a caller ID in the lead's own area code (local presence). If none
    // is configured for that area, rotate caller ID across the WHOLE day —
    // offset by how many calls were already placed today so number A / B / A / B
    // alternate even when only 1 call is placed per tick.
    const localId = areaMap[areaCodeOf(lead.phone) ?? ""];
    const agentPhoneNumberId =
      localId ?? phoneNumberIds[(placedToday + i) % phoneNumberIds.length];
    try {
      await placeOutboundCall(
        lead,
        agentPhoneNumberId,
        settings.elevenlabs_agent_id ?? undefined,
        settings.goal_type === "ai_meeting" ? "ai_meeting" : "financing",
      );
      await supabase
        .from("leads")
        .update({
          status: "calling",
          attempts: lead.attempts + 1,
          last_called_at: now.toISOString(),
        })
        .eq("id", lead.id)
        .eq("workspace_id", workspaceId);
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
    workspaceId,
    placed: placed.length,
    ids: placed,
    failed: failed.length,
    ...(failed.length > 0 ? { errors: failed } : {}),
  };
}

/**
 * Recover leads orphaned in the 'calling' state — the dialer sets 'calling' when
 * it places a call and relies on the post-call webhook to move it to the real
 * outcome. If a webhook is ever missed (e.g. a no-answer that fires no webhook,
 * or a webhook outage), the lead would be stuck 'calling' forever and never
 * retried. Any lead 'calling' longer than a real call could last is reset to
 * 'no_answer' so it re-enters the queue. A late webhook still corrects it (it
 * upserts the call and re-sets the lead status). Runs across ALL workspaces.
 */
export async function recoverStaleCalls(olderThanMinutes = 15): Promise<number> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("leads")
    .update({ status: "no_answer" })
    .eq("status", "calling")
    .lt("last_called_at", cutoff)
    .select("id");
  if (error) {
    console.error("recoverStaleCalls:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Cron entry point: run one tick for EVERY active workspace, independently.
 * Each workspace uses its own settings/window/cap/pacing, so campaigns never
 * interfere. Returns a per-workspace result array.
 */
export async function runAllActiveWorkspaces(): Promise<DialTickResult[]> {
  const supabase = createServiceClient();
  const { data: active, error } = await supabase
    .from("campaign_settings")
    .select("workspace_id")
    .eq("active", true);
  if (error) {
    console.error("dial-tick: could not list active workspaces:", error.message);
    return [{ skipped: "settings lookup failed" }];
  }
  const ids = (active ?? []).map((r: { workspace_id: number }) => r.workspace_id);
  if (ids.length === 0) return [{ skipped: "no active campaigns" }];

  // Sequential to keep total concurrency (and caller-number load) sane.
  const results: DialTickResult[] = [];
  for (const id of ids) {
    results.push(await runDialTick(id));
  }
  return results;
}
