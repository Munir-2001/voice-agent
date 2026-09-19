import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyTranscript } from "@/lib/classify";
import { isValidTimeZone } from "@/lib/timezone";
import type { TranscriptTurn } from "@/lib/types";
import { verifyWebhookSignature, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail, sendLeadNotification, sendMeetingEmail, sendDemoFollowupEmail, emailProfile } from "@/lib/email";
import { drainDemoQueue } from "@/lib/agent/demo-queue";

// Outcomes that make a lead "warm" — they get the welcome email + appear in the
// /interested dashboard queue. Callbacks are deliberately NOT here: they're their
// own category (/callbacks queue) and are not treated as interested/success.
const QUALIFIED: string[] = ["interested"];

// ElevenLabs post-call webhook. Verifies the signed payload (HMAC + timestamp),
// stores the call, classifies the transcript, and updates the lead's status.
// Requires ELEVENLABS_WEBHOOK_SECRET in every environment (fails closed).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`webhook:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const raw = await request.text();
  const sig = request.headers.get("elevenlabs-signature");

  if (!verifyWebhookSignature(raw, sig)) {
    return apiError(401, "Invalid signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return apiError(400, "Invalid payload");
  }

  // ElevenLabs' post_call_transcription webhook nests everything under `data`.
  // Fall back to the top level so a flattened/proxied payload still parses.
  const evt = ((payload.data as Record<string, unknown>) ?? payload) as Record<
    string,
    unknown
  >;
  const meta = (evt.metadata ?? {}) as Record<string, unknown>;
  const init = (evt.conversation_initiation_client_data ?? {}) as Record<
    string,
    unknown
  >;
  // dynamic_variables live under conversation_initiation_client_data on real
  // payloads; tolerate a top-level copy too.
  const dyn = (init.dynamic_variables ??
    evt.dynamic_variables ??
    {}) as Record<string, unknown>;

  const conversationId = (evt.conversation_id ??
    evt.id ??
    payload.conversation_id) as string | undefined;
  if (!conversationId) return apiError(400, "Invalid payload");

  // Deep link to the exact conversation in the ElevenLabs dashboard, so the
  // Interested queue can jump straight to the recording/transcript. Built from
  // the agent id + conversation id; falls back to the by-id conversation route.
  const agentId = (evt.agent_id ?? meta.agent_id ?? init.agent_id) as
    | string
    | undefined;
  const conversationUrl = agentId
    ? `https://elevenlabs.io/app/agents/agents/${agentId}/history/${conversationId}`
    : `https://elevenlabs.io/app/conversations/${conversationId}`;

  const leadId = (dyn.lead_id ?? meta.lead_id) as string | undefined;
  const durationSecs = (meta.call_duration_secs as number) ?? 0;
  // Prefer the ACTUAL call-start time from metadata (unix seconds) so the local
  // time we display/audit is when the call really happened, not webhook receipt.
  const startUnix = Number(meta.start_time_unix_secs);
  const startedAtIso = Number.isFinite(startUnix) && startUnix > 0
    ? new Date(startUnix * 1000).toISOString()
    : new Date().toISOString();
  // Recordings arrive on a SEPARATE post_call_audio webhook — never in this one.
  const recordingUrl = (evt.recording_url ?? null) as string | null;

  // On phone calls the numbers are nested under metadata.phone_call (shape
  // differs Twilio vs SIP); fall back to older flat fields.
  const phoneCall = (meta.phone_call ?? {}) as Record<string, unknown>;
  const numberUsed = (phoneCall.agent_number ?? meta.from_number ?? "") as string;
  const toNumber = (phoneCall.external_number ?? meta.to_number) as
    | string
    | undefined;

  // Inbound receptionist ("Mia — Reception"): the caller dialed us, so NO lead_id
  // is passed and the CALLER (external_number) is the prospect. Detect it by the
  // call direction, or by the reception agent id as a fallback when direction is
  // absent. When true we create/resolve a lead in the Mia workspace below so the
  // call is recorded + followed up exactly like an outbound demo.
  const callDirection = String(phoneCall.direction ?? "").toLowerCase();
  const inboundAgentId = process.env.ELEVENLABS_INBOUND_AGENT_ID;
  const miaWorkspaceId = Number(process.env.MIA_WORKSPACE_ID);
  const isInboundDemo =
    !leadId &&
    Number.isInteger(miaWorkspaceId) &&
    miaWorkspaceId > 0 &&
    !!toNumber &&
    (callDirection === "inbound" ||
      (!!inboundAgentId && agentId === inboundAgentId));

  const transcript: TranscriptTurn[] = ((evt.transcript ?? []) as Array<{
    role: string;
    message: string;
    time_in_call_secs?: number;
  }>).map((t) => ({
    role: t.role === "agent" ? "agent" : "prospect",
    text: t.message,
    at: t.time_in_call_secs ?? 0,
  }));

  const supabase = createServiceClient();

  // Idempotency: skip if we already stored this conversation.
  const { data: existing } = await supabase
    .from("calls")
    .select("id")
    .eq("elevenlabs_conversation_id", conversationId)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, deduped: true });

  // Fetch the lead once: its timezone lets the classifier resolve relative
  // callback times into the prospect's local (US) hours; the other fields feed
  // the warm-lead emails below.
  // `let` (not const): an inbound receptionist call has no leadId, so we resolve /
  // create the lead from the caller's number further down and reassign this.
  let { data: lead } = leadId
    ? await supabase
        .from("leads")
        .select("id, name, business_name, email, phone, timezone, workspace_id")
        .eq("id", leadId)
        .maybeSingle()
    : { data: null as
        | { id: string; name: string | null; business_name: string | null; email: string | null; phone: string | null; timezone: string | null; workspace_id: number }
        | null };

  // The lead we actually operate on downstream — for outbound it's the passed
  // leadId; for inbound it's the caller lead we resolve below.
  let resolvedLeadId: string | undefined = leadId;

  // The workspace the call belongs to. Inbound receptionist calls belong to the
  // Mia workspace; outbound calls take it from their lead; test calls → Default.
  const workspaceId = isInboundDemo
    ? miaWorkspaceId
    : ((lead?.workspace_id as number) ?? 1);

  // The campaign goal drives how the call is classified + followed up.
  const { data: wsSettings } = await supabase
    .from("campaign_settings")
    .select("goal_type")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const goalType = (wsSettings?.goal_type as string) ?? "financing";
  const goal = goalType === "ai_meeting" ? "ai_meeting" : "financing";

  // ElevenLabs post-call analysis (data-collection results) → stored on the call
  // for the demo-callback ("Mia") review view. Absent on non-demo calls → null.
  const analysis = (evt.analysis ?? {}) as Record<string, unknown>;
  const dcr = (analysis.data_collection_results ?? {}) as Record<
    string,
    { value?: unknown } | undefined
  >;
  const dcValue = (k: string): string | null => {
    const v = dcr[k]?.value;
    return v == null || v === "" ? null : String(v).slice(0, 500);
  };

  const {
    outcome,
    summary,
    callbackAt,
    timezone: statedTimezone,
    meetingEmail,
    meetingCity,
    industry: statedIndustry,
  } = await classifyTranscript(transcript, {
    now: new Date(),
    timezone: (lead?.timezone as string) ?? undefined,
    goal,
  });

  // Inbound: resolve the caller to a lead in the Mia workspace (keyed on their
  // number). Reuse an existing lead if this caller is already known (don't clobber
  // their stored name/email); otherwise create one from what Mia captured on the
  // call. The downstream block then updates status + sends the follow-up email
  // exactly as it does for an outbound demo.
  if (isInboundDemo && toNumber) {
    const callerName = dcValue("caller_name");
    const callerEmail = dcValue("caller_email");
    const callerBiz = dcValue("business_name");
    const { data: found } = await supabase
      .from("leads")
      .select("id, name, business_name, email, phone, timezone, workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("phone", toNumber)
      .maybeSingle();
    if (found) {
      resolvedLeadId = found.id as string;
      lead = found;
    } else {
      const { data: ins } = await supabase
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          name: callerName || "Inbound caller",
          business_name: callerBiz || "",
          phone: toNumber,
          email: callerEmail || "",
          consent_source: "inbound_call",
          last_called_at: startedAtIso,
          attempts: 0,
        })
        .select("id, name, business_name, email, phone, timezone, workspace_id")
        .maybeSingle();
      if (ins) {
        resolvedLeadId = ins.id as string;
        lead = ins;
      }
    }
    // Prefer the email captured on THIS call for the follow-up (the caller may have
    // given a fresh one), falling back to whatever is on the resolved lead.
    if (lead && callerEmail && !lead.email) lead.email = callerEmail;
  }

  await supabase.from("calls").insert({
    workspace_id: workspaceId,
    lead_id: resolvedLeadId,
    elevenlabs_conversation_id: conversationId,
    started_at: startedAtIso,
    duration_secs: durationSecs,
    transcript,
    recording_url: recordingUrl,
    outcome,
    summary,
    number_used: numberUsed,
    // The other party's number (lead on outbound, caller on inbound) — powers
    // the call-log phone search and makes callbacks identifiable.
    external_number: toNumber ?? null,
    // The lead's local timezone at call time — lets the dashboard show the
    // prospect's local call time so you can audit that it wasn't a night call.
    local_timezone: (lead?.timezone as string) ?? null,
    // Store on the call too, so even a standalone test call (no lead) shows the
    // extracted callback time on the call detail page.
    callback_at: callbackAt,
    // Demo-callback ("Mia") analysis — null on normal calls.
    demo_outcome: dcValue("outcome"),
    gets_inbound_leads: dcValue("gets_inbound_leads"),
    current_callback_speed: dcValue("current_callback_speed"),
  });

  if (resolvedLeadId) {
    // Always record the link to this call's conversation on the lead, so every
    // interested/callback lead points at the exact call that qualified it.
    const patch: Record<string, unknown> = {
      status: outcome,
      conversation_url: conversationUrl,
    };
    if (outcome === "opted_out" && toNumber) {
      // Per-workspace opt-out: suppress the number only for this workspace.
      await supabase
        .from("suppression")
        .upsert(
          { workspace_id: workspaceId, phone: toNumber, reason: "opt_out" },
          { onConflict: "workspace_id,phone" },
        );
    }
    if (callbackAt) patch.callback_at = callbackAt;
    // The prospect told us where they are → correct the lead's timezone (more
    // reliable than the area-code guess), so future scheduling uses real hours.
    if (isValidTimeZone(statedTimezone)) patch.timezone = statedTimezone;
    // AI-meeting capture: store the confirmed email, city, and confirmed industry.
    if (goal === "ai_meeting") {
      if (meetingEmail) patch.meeting_email = meetingEmail;
      if (meetingCity) patch.meeting_city = meetingCity;
      if (statedIndustry) patch.industry = statedIndustry;
    }
    await supabase.from("leads").update(patch).eq("id", resolvedLeadId);

    // This call just ended → a demo line freed up. If it belongs to the Mia demo
    // workspace, drain the queue so the next waiting lead is dialed immediately.
    // Best-effort: a drain failure must never break the webhook.
    const miaWs = Number(process.env.MIA_WORKSPACE_ID);
    if (Number.isInteger(miaWs) && miaWs > 0 && workspaceId === miaWs) {
      try {
        const drained = await drainDemoQueue(supabase, workspaceId);
        if (drained.dialed > 0 || drained.reclaimed > 0) {
          console.log(`webhook: demo queue drained — dialed ${drained.dialed}, reclaimed ${drained.reclaimed}`);
        }
      } catch (e) {
        console.error("webhook: demo queue drain failed:", e instanceof Error ? e.message : String(e));
      }
    }

    // Warm outcome → email the prospect and alert the team. Both best-effort;
    // email must never break the webhook. Reuses the lead fetched above.
    const qualifies =
      goal === "ai_meeting"
        ? ["meeting_booked", "interested"].includes(outcome)
        : QUALIFIED.includes(outcome);
    // Demo ("Mia") calls get their OWN automated follow-up: if the prospect
    // actually engaged (interested / meeting_requested), email them the recap +
    // booking link. voicemail / no-answer / not-interested get nothing.
    if (goalType === "demo") {
      const demoOutcome = dcValue("outcome"); // meeting_requested | interested | ...
      const demoEngaged =
        ["interested", "meeting_requested"].includes(demoOutcome ?? "") ||
        ["interested", "meeting_booked"].includes(outcome);
      if (demoEngaged && lead) {
        const email = (lead.email as string) ?? null;
        if (email) {
          const r = await sendDemoFollowupEmail({
            name: (lead.name as string) ?? "",
            businessName: (lead.business_name as string) ?? "",
            email,
          });
          if (!r.sent) console.error("demo follow-up email skipped:", r.reason);
        }
      }
    } else if (qualifies && lead) {
      // Per-campaign email identity (own SMTP/brand/reply-to/notify list).
      const profile = emailProfile(goal);
      const name = (lead.name as string) ?? "";
      const businessName = (lead.business_name as string) ?? "";
      // Prefer the email confirmed on the call, else the one on file.
      const email = (meetingEmail as string) || ((lead.email as string) ?? null);
      const tz = isValidTimeZone(statedTimezone)
        ? statedTimezone
        : ((lead.timezone as string) ?? null);

      if (email) {
        const r =
          goal === "ai_meeting"
            ? await sendMeetingEmail({ name, businessName, email }, profile)
            : await sendWelcomeEmail({ name, businessName, email }, profile);
        if (!r.sent) console.error("prospect email skipped:", r.reason);
      }

      // The profile's own notify list keeps NextGen alerts separate from Rose's.
      const n = await sendLeadNotification(
        {
          name,
          businessName,
          phone: (lead.phone as string) ?? "",
          email,
          outcome,
          summary,
          callbackAt,
          timezone: tz,
        },
        profile,
      );
      if (!n.sent) console.error("lead notification skipped:", n.reason);
    }
  }

  return NextResponse.json({ ok: true, outcome });
}
