import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyTranscript } from "@/lib/classify";
import type { TranscriptTurn } from "@/lib/types";
import { verifyWebhookSignature, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

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

  let payload: Record<string, unknown> & {
    conversation_id?: string;
    id?: string;
    metadata?: Record<string, unknown>;
    dynamic_variables?: Record<string, unknown>;
    recording_url?: string | null;
    transcript?: unknown[];
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return apiError(400, "Invalid payload");
  }
  const meta = (payload.metadata ?? {}) as Record<string, unknown>;
  const dyn = (payload.dynamic_variables ?? {}) as Record<string, unknown>;
  const conversationId = (payload.conversation_id ?? payload.id) as string | undefined;
  if (!conversationId) return apiError(400, "Invalid payload");

  const leadId = (meta.lead_id ?? dyn.lead_id) as string | undefined;
  const durationSecs = (meta.call_duration_secs as number) ?? 0;
  const recordingUrl = (payload.recording_url ?? null) as string | null;
  const numberUsed = (meta.from_number as string) ?? "";
  const toNumber = meta.to_number as string | undefined;

  const transcript: TranscriptTurn[] = ((payload.transcript ?? []) as Array<{
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

  const { outcome, summary, callbackAt } = await classifyTranscript(transcript);

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
  });

  if (leadId) {
    const patch: Record<string, unknown> = { status: outcome };
    if (outcome === "opted_out" && toNumber) {
      await supabase
        .from("suppression")
        .upsert({ phone: toNumber, reason: "opt_out" }, { onConflict: "phone" });
    }
    if (callbackAt) patch.callback_at = callbackAt;
    await supabase.from("leads").update(patch).eq("id", leadId);
  }

  return NextResponse.json({ ok: true, outcome });
}
