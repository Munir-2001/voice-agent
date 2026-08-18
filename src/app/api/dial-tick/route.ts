import { NextResponse } from "next/server";
import { runAllActiveWorkspaces, recoverStaleCalls } from "@/lib/agent/dialer";
import { hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// The scheduler tick. Called every minute by Supabase pg_cron (or an external
// scheduler) during the calling window. Delegates to the shared dialer core,
// which picks eligible leads and triggers outbound calls through ElevenLabs.
// Secured by a shared secret header.
//
// Eligibility (enforced in runDialTick): campaign active · lead-local time in
// window · not suppressed · attempts < maxAttempts · today's calls < dailyCap.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`dial-tick:${clientIp(request)}`, 90, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  // Require the shared secret in EVERY environment (constant-time compare).
  if (!hasValidCronSecret(request)) {
    return apiError(401, "Unauthorized");
  }

  // Self-heal any leads orphaned in 'calling' by a missed webhook, then run one
  // tick for every active workspace (each with its own settings/window/cap).
  const recovered = await recoverStaleCalls();
  const results = await runAllActiveWorkspaces();
  return NextResponse.json({ recovered, workspaces: results });
}
