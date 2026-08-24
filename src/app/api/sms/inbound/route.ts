import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioSignature, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { lookupLeadByPhone, generateSmsReply, normalizePhone } from "@/lib/sms";

// Inbound SMS handler (Twilio Messaging webhook). Configure the number's
// "A MESSAGE COMES IN" webhook to POST here. Verifies the Twilio signature,
// handles STOP/HELP for compliance, and otherwise AI-replies in context with the
// booking link. Responds with TwiML so Twilio sends the reply.
//
// Requires TWILIO_AUTH_TOKEN (signature check). Uses BOOKING_LINK for the reply.

export const dynamic = "force-dynamic";

const STOP_WORDS = /^(stop|stopall|unsubscribe|cancel|end|quit|optout|opt-out)$/i;
const HELP_WORDS = /^(help|info)$/i;

// Minimal XML escaping for the message body inside TwiML.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string | null): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  const rl = rateLimit(`sms-inbound:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  // Twilio sends application/x-www-form-urlencoded.
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  // Verify the signature over the PUBLIC url Twilio posted to (rebuilt from
  // proxy headers, since request.url may carry an internal host on Vercel).
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const publicUrl = `${proto}://${host}${new URL(request.url).pathname}`;
  const sig = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(publicUrl, params, sig)) {
    return apiError(401, "Invalid signature");
  }

  const from = params.From ?? "";
  const bodyText = (params.Body ?? "").trim();
  if (!from) return twiml(null);

  const sb = createServiceClient();
  const ctx = await lookupLeadByPhone(from);

  // ── Opt-out (legal requirement — always wins) ─────────────────────────────
  if (STOP_WORDS.test(bodyText)) {
    const { e164 } = normalizePhone(from);
    if (e164) {
      await sb
        .from("suppression")
        .upsert(
          { workspace_id: ctx.workspaceId ?? 1, phone: e164, reason: "sms_opt_out" },
          { onConflict: "workspace_id,phone" },
        )
        .then(() => {}, () => {}); // best-effort
    }
    await logSms(sb, ctx, from, params.To ?? "", bodyText, "opt_out");
    // Twilio auto-sends its own STOP confirmation for registered senders; an
    // empty TwiML avoids a duplicate. Keep a confirmation for safety.
    return twiml("You're unsubscribed and won't receive more messages. Reply START to opt back in.");
  }

  if (HELP_WORDS.test(bodyText)) {
    await logSms(sb, ctx, from, params.To ?? "", bodyText, "help");
    return twiml("This is NextGen AI. We help businesses automate calls & admin. Reply STOP to opt out.");
  }

  // ── AI reply in context ───────────────────────────────────────────────────
  const bookingLink = process.env.BOOKING_LINK ?? "";
  const reply = await generateSmsReply(bodyText, ctx, bookingLink);
  await logSms(sb, ctx, from, params.To ?? "", bodyText, "inbound", reply);
  return twiml(reply);
}

// Best-effort logging — never let a missing table break the reply. Create the
// sms_messages table (see migration) to persist the thread.
async function logSms(
  sb: ReturnType<typeof createServiceClient>,
  ctx: { leadId: string | null; workspaceId: number | null },
  from: string,
  to: string,
  body: string,
  kind: string,
  reply?: string,
) {
  try {
    await sb.from("sms_messages").insert({
      workspace_id: ctx.workspaceId,
      lead_id: ctx.leadId,
      from_number: from,
      to_number: to,
      body,
      reply: reply ?? null,
      kind,
    });
  } catch {
    // table may not exist yet — ignore
  }
}
