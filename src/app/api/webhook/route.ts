import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyTranscript } from "@/lib/classify";
import { isValidTimeZone } from "@/lib/timezone";
import type { TranscriptTurn } from "@/lib/types";
import { verifyWebhookSignature, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail, sendLeadNotification } from "@/lib/email";

// Outcomes that make a lead "warm" — they get the welcome email + appear in the
// /interested dashboard queue for Rose to handle.
const QUALIFIED: string[] = ["interested", "callback"];

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

  const leadId = (dyn.lead_id ?? meta.lead_id) as string | undefined;
  const durationSecs = (meta.call_duration_secs as number) ?? 0;
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
        .select("name, business_name, email, phone, timezone")
        .eq("id", leadId)
        .maybeSingle()
    : { data: null };

  const { outcome, summary, callbackAt, timezone: statedTimezone } =
    await classifyTranscript(transcript, {
      now: new Date(),
      timezone: (lead?.timezone as string) ?? undefined,
    });

  await supabase.from("calls").insert({
    lead_id: leadId,
    elevenlabs_conversation_id: conversationId,
    started_at: new Date().toISOString(),
    duration_secs: durationSecs,
    transcript,
    recording_url: recordingUrl,
    outcome,
    summary,
    number_used: numberUsed,
    // Store on the call too, so even a standalone test call (no lead) shows the
    // extracted callback time on the call detail page.
    callback_at: callbackAt,
  });

  if (leadId) {
    const patch: Record<string, unknown> = { status: outcome };
    if (outcome === "opted_out" && toNumber) {
      await supabase
        .from("suppression")
        .upsert({ phone: toNumber, reason: "opt_out" }, { onConflict: "phone" });
    }
    if (callbackAt) patch.callback_at = callbackAt;
    // The prospect told us where they are → correct the lead's timezone (more
    // reliable than the area-code guess), so future scheduling uses real hours.
    if (isValidTimeZone(statedTimezone)) patch.timezone = statedTimezone;
    await supabase.from("leads").update(patch).eq("id", leadId);

    // Warm lead → (1) email the lead the welcome/next-steps message, and
    // (2) alert the internal team (Naveed / Rosemarie). Both best-effort — email
    // must never break the webhook. Reuses the lead fetched above.
    if (QUALIFIED.includes(outcome) && lead) {
      const name = (lead.name as string) ?? "";
      const businessName = (lead.business_name as string) ?? "";
      const email = (lead.email as string) ?? null;

      if (email) {
        const r = await sendWelcomeEmail({ name, businessName, email });
        if (!r.sent) console.error("welcome email skipped:", r.reason);
      }

      const n = await sendLeadNotification({
        name,
        businessName,
        phone: (lead.phone as string) ?? "",
        email,
        outcome,
        summary,
        callbackAt,
        // Prefer the timezone the prospect stated on the call; else what's stored.
        timezone: isValidTimeZone(statedTimezone)
          ? statedTimezone
          : ((lead.timezone as string) ?? null),
      });
      if (!n.sent) console.error("lead notification skipped:", n.reason);
    }
  }

  return NextResponse.json({ ok: true, outcome });
}
