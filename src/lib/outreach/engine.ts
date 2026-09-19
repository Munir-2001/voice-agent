import "server-only";
// Outreach send engine — the email counterpart of the dialer. A pg_cron tick
// hits /api/email-tick, which calls runEmailTick(). For each ACTIVE campaign it
// sends the next due step to leads whose next_send_at has passed, honouring a
// daily cap, a send window, per-workspace email suppression, and a
// claim-before-send guard so overlapping ticks never double-send.

import { createServiceClient } from "@/lib/supabase/server";
import { sendOutreachEmail, buildVars } from "@/lib/outreach/mailer";

const DAY_MS = 86_400_000;

export interface EmailTickResult {
  campaignId: number;
  skipped?: string;
  sent?: number;
  failed?: number;
}

type LeadEmbed = {
  name: string | null;
  business_name: string | null;
  industry: string | null;
  email: string | null;
};

// Current hour + weekday (1=Mon..7=Sun) in the outreach send timezone. Leads are
// US (Florida) so we pace in Eastern; a coarse gate is fine — the point is "not
// 3am, not the weekend".
function nowInSendTz(): { hour: number; weekday: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { hour: Number(hourStr) % 24, weekday: map[wdStr] ?? 1 };
}

function hourOf(hhmm: string, fallback: number): number {
  const h = Number(String(hhmm ?? "").split(":")[0]);
  return Number.isFinite(h) ? h : fallback;
}

function leadOf(row: { leads: LeadEmbed | LeadEmbed[] | null }): LeadEmbed | null {
  const l = row.leads;
  if (!l) return null;
  return Array.isArray(l) ? (l[0] ?? null) : l;
}

/**
 * Enroll every eligible lead of a campaign's list into the sequence. Idempotent:
 * skips leads already enrolled, without an email, or on the workspace opt-out
 * list. Safe to call again after adding leads. Returns how many were added.
 */
export async function enrollCampaignLeads(campaignId: number): Promise<{ enrolled: number }> {
  const supabase = createServiceClient();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, workspace_id, list_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { enrolled: 0 };

  let leadsQuery = supabase
    .from("leads")
    .select("id, email")
    .eq("workspace_id", campaign.workspace_id)
    .not("email", "is", null);
  if (campaign.list_id != null) leadsQuery = leadsQuery.eq("list_id", campaign.list_id);
  const { data: leads } = await leadsQuery;

  const withEmail = (leads ?? []).filter(
    (l: { email: string | null }) => (l.email ?? "").trim().length > 0,
  );
  if (withEmail.length === 0) return { enrolled: 0 };

  const [{ data: already }, { data: suppressed }] = await Promise.all([
    supabase.from("email_enrollments").select("lead_id").eq("campaign_id", campaignId),
    supabase.from("email_suppression").select("email").eq("workspace_id", campaign.workspace_id),
  ]);
  const enrolledIds = new Set((already ?? []).map((r: { lead_id: string }) => r.lead_id));
  const optedOut = new Set(
    (suppressed ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  );

  const nowIso = new Date().toISOString();
  const rows = withEmail
    .filter((l: { id: string; email: string | null }) => !enrolledIds.has(l.id))
    .filter((l: { email: string | null }) => !optedOut.has((l.email ?? "").toLowerCase()))
    .map((l: { id: string }) => ({
      campaign_id: campaignId,
      lead_id: l.id,
      current_step: 0,
      next_send_at: nowIso,
      status: "active",
    }));
  if (rows.length === 0) return { enrolled: 0 };

  const { error } = await supabase.from("email_enrollments").insert(rows);
  if (error) {
    console.error("enrollCampaignLeads:", error.message);
    return { enrolled: 0 };
  }
  return { enrolled: rows.length };
}

/**
 * Enroll ONE lead into a campaign — used to auto-start the drip when a new
 * inbound lead signs up (e.g. the instant-demo form). Idempotent (a repeat
 * signup won't double-enroll), skips leads with no email or on the opt-out
 * list, and never throws — a nurture hiccup must not break the signup flow.
 */
export async function enrollLead(
  campaignId: number,
  leadId: string,
): Promise<{ enrolled: boolean }> {
  const supabase = createServiceClient();

  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { enrolled: false };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, email")
    .eq("id", leadId)
    .maybeSingle();
  const email = (lead?.email ?? "").trim();
  if (!email) return { enrolled: false };

  // Respect the workspace opt-out list.
  const { data: suppressed } = await supabase
    .from("email_suppression")
    .select("email")
    .eq("workspace_id", campaign.workspace_id)
    .ilike("email", email)
    .maybeSingle();
  if (suppressed) return { enrolled: false };

  const { error } = await supabase.from("email_enrollments").upsert(
    {
      campaign_id: campaignId,
      lead_id: leadId,
      current_step: 0,
      next_send_at: new Date().toISOString(),
      status: "active",
    },
    { onConflict: "campaign_id,lead_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("enrollLead:", error.message);
    return { enrolled: false };
  }
  return { enrolled: true };
}

/**
 * Auto-enroll a new inbound lead into whichever ACTIVE campaign in its
 * workspace is flagged `auto_enroll_inbound` (set via the campaign UI toggle —
 * no env config). Enrolls into every flagged campaign found (the UI keeps it to
 * one per workspace). Best-effort + never throws.
 */
export async function autoEnrollInboundLead(
  workspaceId: number,
  leadId: string,
): Promise<{ enrolled: number }> {
  const supabase = createServiceClient();
  const { data: campaigns } = await supabase
    .from("email_campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("auto_enroll_inbound", true);
  if (!campaigns || campaigns.length === 0) return { enrolled: 0 };

  let enrolled = 0;
  for (const c of campaigns) {
    const res = await enrollLead(c.id as number, leadId);
    if (res.enrolled) enrolled++;
  }
  return { enrolled };
}

/** Run one send tick for every active campaign. */
export async function runEmailTick(): Promise<EmailTickResult[]> {
  const supabase = createServiceClient();
  const { data: campaigns, error } = await supabase
    .from("email_campaigns")
    .select("id, workspace_id, sequence_id, daily_cap, window_start, window_end, status")
    .eq("status", "active");
  if (error) {
    console.error("runEmailTick: campaign lookup failed:", error.message);
    return [];
  }
  const results: EmailTickResult[] = [];
  for (const c of campaigns ?? []) {
    results.push(await runCampaignTick(c));
  }
  return results;
}

type CampaignRow = {
  id: number;
  workspace_id: number;
  sequence_id: number | null;
  daily_cap: number;
  window_start: string;
  window_end: string;
};

async function runCampaignTick(campaign: CampaignRow): Promise<EmailTickResult> {
  const supabase = createServiceClient();
  const cid = campaign.id;

  if (!campaign.sequence_id) return { campaignId: cid, skipped: "no sequence" };

  // Send window (Eastern), weekdays only.
  const { hour, weekday } = nowInSendTz();
  if (weekday > 5) return { campaignId: cid, skipped: "weekend" };
  const start = hourOf(campaign.window_start, 9);
  const end = hourOf(campaign.window_end, 17);
  if (hour < start || hour >= end) return { campaignId: cid, skipped: "outside window" };

  // Daily cap — count today's sends for this campaign (events joined to its
  // enrollments), so an interrupted day resumes under the same ceiling.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from("email_events")
    .select("id, email_enrollments!inner(campaign_id)", { count: "exact", head: true })
    .eq("email_enrollments.campaign_id", cid)
    .eq("type", "sent")
    .gte("at", startOfDay.toISOString());
  const remaining = campaign.daily_cap - (sentToday ?? 0);
  if (remaining <= 0) return { campaignId: cid, skipped: "daily cap reached" };

  // Sequence steps (active), ordered.
  const { data: stepRows } = await supabase
    .from("email_steps")
    .select("step_no, day_offset, subject, body_html, active")
    .eq("sequence_id", campaign.sequence_id)
    .eq("active", true)
    .order("step_no", { ascending: true });
  const steps = stepRows ?? [];
  if (steps.length === 0) return { campaignId: cid, skipped: "sequence has no steps" };
  const stepByNo = new Map(steps.map((s: { step_no: number }) => [s.step_no, s]));

  // Opt-out set for the workspace (belt-and-suspenders alongside enrollment status).
  const { data: suppressed } = await supabase
    .from("email_suppression")
    .select("email")
    .eq("workspace_id", campaign.workspace_id);
  const optedOut = new Set(
    (suppressed ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  );

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("email_enrollments")
    .select("id, current_step, lead_id, leads(name, business_name, industry, email)")
    .eq("campaign_id", cid)
    .eq("status", "active")
    .lte("next_send_at", nowIso)
    .order("next_send_at", { ascending: true })
    .limit(remaining);

  let sent = 0;
  let failed = 0;

  for (const enr of due ?? []) {
    const fromStep = enr.current_step as number;
    const nextNo = fromStep + 1;
    const step = stepByNo.get(nextNo) as
      | { step_no: number; day_offset: number; subject: string; body_html: string }
      | undefined;

    // Sequence finished for this lead.
    if (!step) {
      await supabase
        .from("email_enrollments")
        .update({ status: "done", next_send_at: null })
        .eq("id", enr.id)
        .eq("current_step", fromStep)
        .eq("status", "active");
      continue;
    }

    const lead = leadOf(enr as { leads: LeadEmbed | LeadEmbed[] | null });
    const email = (lead?.email ?? "").trim();
    if (!email) {
      await supabase
        .from("email_enrollments")
        .update({ status: "done", next_send_at: null })
        .eq("id", enr.id);
      continue;
    }
    if (optedOut.has(email.toLowerCase())) {
      await supabase
        .from("email_enrollments")
        .update({ status: "unsubscribed", next_send_at: null })
        .eq("id", enr.id);
      continue;
    }

    // When does the NEXT step fire? gap = day difference (min 1 day).
    const following = stepByNo.get(nextNo + 1) as { day_offset: number } | undefined;
    const gapDays = following ? Math.max(1, following.day_offset - step.day_offset) : 0;
    const nextSendAt = following
      ? new Date(Date.now() + gapDays * DAY_MS).toISOString()
      : null;

    // Claim-before-send: advance the step FIRST, guarded on the current step +
    // active status, so an overlapping tick can't grab the same enrollment. If
    // 0 rows match, someone else already claimed it — skip.
    const { data: claimed } = await supabase
      .from("email_enrollments")
      .update({
        current_step: nextNo,
        next_send_at: nextSendAt,
        status: following ? "active" : "done",
      })
      .eq("id", enr.id)
      .eq("current_step", fromStep)
      .eq("status", "active")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      await sendOutreachEmail({
        enrollmentId: enr.id as string,
        stepNo: nextNo,
        to: email,
        subject: step.subject,
        bodyHtml: step.body_html,
        vars: buildVars(lead ?? {}),
      });
      await supabase
        .from("email_events")
        .insert({ enrollment_id: enr.id, step_no: nextNo, type: "sent" });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`email-tick: send failed for enrollment ${enr.id}:`, message);
      await supabase
        .from("email_events")
        .insert({ enrollment_id: enr.id, step_no: nextNo, type: "bounce", meta: { error: message } });
      failed++;
    }
  }

  return { campaignId: cid, sent, failed };
}
