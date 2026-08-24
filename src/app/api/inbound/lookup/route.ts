import { NextResponse } from "next/server";
import { lookupLeadByPhone } from "@/lib/sms";
import { hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// Caller-lookup tool for INBOUND calls. When someone calls our number back,
// the inbound agent calls this (as a custom tool) with the caller's number; we
// return the matching lead's context so the agent can greet them by name and
// continue where the outbound call left off.
//
// Configure in ElevenLabs as a custom (webhook) tool:
//   • URL: https://<your-domain>/api/inbound/lookup
//   • Method: POST, header x-cron-secret: <CRON_SECRET>
//   • Body: { "phone": "{{system__caller_id}}" }  (or system__from_number)
// Gated by the shared cron secret so it isn't publicly queryable.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`inbound-lookup:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!hasValidCronSecret(request)) return apiError(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const phone = String(
    body.phone ?? body.caller_id ?? body.caller_number ?? body.from ?? "",
  );
  if (!phone) return apiError(400, "Provide a phone number");

  const ctx = await lookupLeadByPhone(phone);

  // Flat, string-friendly shape so the agent can drop fields straight into speech.
  return NextResponse.json({
    found: ctx.found,
    name: ctx.name,
    first_name: ctx.firstName,
    company: ctx.company,
    industry: ctx.industry,
    status: ctx.status,
    // A ready-to-use line the agent can act on.
    greeting_hint: ctx.found
      ? `This is a returning lead: ${ctx.firstName || ctx.name}${ctx.company ? ` from ${ctx.company}` : ""}. Greet them warmly by name and pick up where we left off — the goal is still to book the free 20-minute call with Munir.`
      : "No prior record for this caller — greet warmly, find out who they are and how you can help, and offer the free 20-minute call with Munir.",
  });
}
