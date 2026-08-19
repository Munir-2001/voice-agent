import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sendWelcomeEmail,
  sendLeadNotification,
  emailProfile,
  isEmailConfigured,
} from "@/lib/email";
import { isSameOrigin, hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

// Verifies email end-to-end WITHOUT placing a call. Two kinds:
//   • "welcome" (default) → the real welcome email a lead receives, to toEmail.
//   • "notify"            → the internal "new interested lead" alert, to the
//                           EMAIL_NOTIFY team list — so you can confirm those
//                           alerts actually land before going live.
// Gated: dashboard session OR cron secret.

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["welcome", "notify"]).optional().default("welcome"),
  toEmail: z.string().email().optional(),
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
  if (!parsed.success) return apiError(400, "Invalid request");
  const { kind, toEmail, name, businessName } = parsed.data;

  // Team-notification test → goes to the financing EMAIL_NOTIFY list.
  if (kind === "notify") {
    const profile = emailProfile("financing");
    if (profile.notify.length === 0) {
      return apiError(400, "No EMAIL_NOTIFY recipients configured");
    }
    const result = await sendLeadNotification(
      {
        name: name ?? "Alex Morgan (TEST)",
        businessName: businessName ?? "Cedar Comfort HVAC",
        phone: "+15551234567",
        email: "alex@example.com",
        outcome: "callback",
        summary:
          "This is a TEST of your interested-lead alert — no real lead. If you received this, EMAIL_NOTIFY is working.",
        // Sample preferred time (~18h out) so you can see the callback-time row.
        callbackAt: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
        timezone: "America/Los_Angeles",
      },
      profile,
    );
    if (!result.sent) return apiError(502, result.reason ?? "Could not send");
    return NextResponse.json({ ok: true, kind, sentTo: profile.notify });
  }

  // Welcome-email test → needs a destination address.
  if (!toEmail) return apiError(400, "Provide a valid toEmail");
  const result = await sendWelcomeEmail({
    name: name ?? "there",
    businessName: businessName ?? "",
    email: toEmail,
  });
  // Endpoint is gated, so surfacing the SMTP reason here is safe and useful.
  if (!result.sent) return apiError(502, result.reason ?? "Could not send");
  return NextResponse.json({ ok: true, kind, sent: toEmail });
}
