import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { guardOutreach } from "@/lib/outreach/guard";
import {
  sendOutreachEmail,
  buildVars,
  isOutreachConfigured,
} from "@/lib/outreach/mailer";

// Admin-only. Sends ONE test email through the real outreach pipeline (Gmail
// SMTP → merge render → tracking wrap → CAN-SPAM footer) to the admin's own
// address (or a provided one), so you can confirm deliverability + formatting
// before enrolling any real leads. Uses a throwaway enrollment id, so the
// open/click links in the test won't record events — that's expected.

export const dynamic = "force-dynamic";

const SAMPLE_LEAD = {
  name: "Alex Rivera",
  business_name: "Sunrise Realty",
  industry: "Real Estate",
  email: "alex@example.com",
};

const Body = z.object({
  toEmail: z.string().email().optional(),
  subject: z.string().min(1).max(300),
  bodyHtml: z.string().min(1).max(50_000),
});

export async function POST(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-test:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  if (!isOutreachConfigured()) {
    return apiError(503, "Outreach SMTP isn't configured — set OUTREACH_SMTP_* first.");
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a subject and body");

  const user = await getSessionUser();
  const to = (parsed.data.toEmail ?? user?.email ?? "").trim();
  if (!to) return apiError(400, "No recipient — pass toEmail or sign in with an email");

  try {
    await sendOutreachEmail({
      enrollmentId: crypto.randomUUID(), // throwaway — test send, not a real enrollment
      stepNo: 1,
      to,
      subject: `[TEST] ${parsed.data.subject}`,
      bodyHtml: parsed.data.bodyHtml,
      vars: buildVars(SAMPLE_LEAD),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return apiError(502, message);
  }

  return NextResponse.json({ ok: true, sent: to });
}
