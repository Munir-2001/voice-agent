import { NextResponse } from "next/server";
import { z } from "zod";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";
import { isSameOrigin, hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

// Places a single live test call to a chosen number, using the real agent + the
// real outbound path — so you can pick up the phone and talk to it. Not tied to
// any lead in the DB. This places a REAL, billable call, so it's gated: allow
// either a signed-in dashboard session OR the cron secret (so it's curl-able).

export const dynamic = "force-dynamic";

const Body = z.object({
  toNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, "E.164, e.g. +15551234567"),
  name: z.string().max(80).optional(),
  businessName: z.string().max(120).optional(),
  industry: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`test-call:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  // Auth: cron-secret header (curl) OR same-origin + signed-in (dashboard).
  if (!hasValidCronSecret(request)) {
    if (!isSameOrigin(request)) return apiError(403, "Forbidden");
    if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a valid E.164 toNumber");
  const { toNumber, name, businessName, industry } = parsed.data;

  const ids = callerNumberIds();
  if (ids.length === 0) return apiError(503, "No caller number configured");

  try {
    const result = await placeOutboundCall(
      {
        id: "", // standalone test — not linked to a DB lead
        name: name ?? "there",
        business_name: businessName ?? "",
        industry: industry ?? "",
        email: null,
        phone: toNumber,
      },
      ids[0],
    );
    return NextResponse.json({ ok: true, calling: toNumber, result });
  } catch (err) {
    // Return the ElevenLabs detail — the endpoint is gated, and this is exactly
    // what you need to see when a key/id/number is misconfigured during setup.
    const message = err instanceof Error ? err.message : String(err);
    console.error("test-call failed:", message);
    return apiError(502, message);
  }
}
