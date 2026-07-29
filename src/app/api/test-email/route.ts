import { NextResponse } from "next/server";
import { z } from "zod";
import { sendWelcomeEmail, isEmailConfigured } from "@/lib/email";
import { isSameOrigin, hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

// Sends the real welcome email to a chosen address so you can see exactly what
// an interested lead receives — without placing a call. Gated: dashboard session
// OR cron secret.

export const dynamic = "force-dynamic";

const Body = z.object({
  toEmail: z.string().email(),
  name: z.string().max(80).optional(),
  businessName: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`test-email:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  if (!hasValidCronSecret(request)) {
    if (!isSameOrigin(request)) return apiError(403, "Forbidden");
    if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  }

  if (!isEmailConfigured()) return apiError(503, "Email (SMTP) isn't configured yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a valid toEmail");
  const { toEmail, name, businessName } = parsed.data;

  const result = await sendWelcomeEmail({
    name: name ?? "there",
    businessName: businessName ?? "",
    email: toEmail,
  });
  // Endpoint is gated, so surfacing the SMTP reason here is safe and useful.
  if (!result.sent) return apiError(502, result.reason ?? "Could not send");
  return NextResponse.json({ ok: true, sent: toEmail });
}
