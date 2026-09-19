import { NextResponse } from "next/server";
import { runEmailTick } from "@/lib/outreach/engine";
import { hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// The outreach send tick. Called by Supabase pg_cron (see PENDING-MIGRATIONS for
// the schedule). Sends the next due sequence step for every active campaign,
// honouring daily cap + send window + suppression inside runEmailTick. Secured
// by the shared cron secret, same as /api/dial-tick.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`email-tick:${clientIp(request)}`, 90, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!hasValidCronSecret(request)) return apiError(401, "Unauthorized");

  const campaigns = await runEmailTick();
  return NextResponse.json({ campaigns });
}
