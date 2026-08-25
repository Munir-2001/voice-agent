import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyTranscript } from "@/lib/classify";
import { isValidTimeZone } from "@/lib/timezone";
import type { TranscriptTurn } from "@/lib/types";
import { verifyWebhookSignature, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail, sendLeadNotification, sendMeetingEmail, emailProfile } from "@/lib/email";

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
  const { data: lead } = leadId
    ? await supabase
        .from("leads")
        .select("name, business_name, email, phone, timezone, workspace_id")
        .eq("id", leadId)
        .maybeSingle()
    : { data: null };

  // The workspace the call belongs to (from its lead). Standalone test calls
  // (no lead) fall back to Default.
  const workspaceId = (lead?.workspace_id as number) ?? 1;

  // The campaign goal drives how the call is classified + followed up.
  const { data: wsSettings } = await supabase
    .from("campaign_settings")
    .select("goal_type")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const goal =
    (wsSettings?.goal_type as string) === "ai_meeting" ? "ai_meeting" : "financing";

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

  await supabase.from("calls").insert({
    workspace_id: workspaceId,
    lead_id: leadId,
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
  });

  if (leadId) {
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
    await supabase.from("leads").update(patch).eq("id", leadId);

    // Warm outcome → email the prospect and alert the team. Both best-effort;
    // email must never break the webhook. Reuses the lead fetched above.
    const qualifies =
      goal === "ai_meeting"
        ? ["meeting_booked", "interested"].includes(outcome)
        : QUALIFIED.includes(outcome);
    if (qualifies && lead) {
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
