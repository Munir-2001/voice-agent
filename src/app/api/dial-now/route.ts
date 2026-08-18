import { NextResponse } from "next/server";
import { runDialTick } from "@/lib/agent/dialer";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

// On-demand "Call now" — triggers an immediate dialing tick from the dashboard,
// so you don't wait up to a minute for the next scheduled cron tick. Runs as a
// MANUAL tick: it ignores the campaign pause switch and widens the window to the
// full legal 8am–9pm band, but STILL enforces suppression and the daily cap.
// Gated by same-origin + a signed-in session (this places real, billable calls).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  // Tight limit: this is a human-clicked button, not a hot path.
  const rl = rateLimit(`dial-now:${clientIp(request)}`, 6, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests — try again in a moment");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");

  // Dial only the workspace the user is currently viewing.
  const workspaceId = await getActiveWorkspaceId();
  const result = await runDialTick(workspaceId, { manual: true });
  return NextResponse.json(result);
}
