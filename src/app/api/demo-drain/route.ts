import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { drainDemoQueue } from "@/lib/agent/demo-queue";
import { hasValidCronSecret, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// Safety-net drainer for the Mia demo queue. The queue is normally drained
// event-driven — on call completion (webhook) and on each new submission — so
// this endpoint is only a backstop for the rare case where a queue stalls with
// no completions or submissions to trigger it (e.g. a burst of missed webhooks).
//
// It also self-heals stale 'calling' leads (see drainDemoQueue → reclaimStaleCalling).
// Wire it to a scheduler (Supabase pg_cron, etc.) every minute if you want the
// backstop; it's a no-op when there's nothing queued. Secured by the shared secret.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rl = rateLimit(`demo-drain:${clientIp(request)}`, 90, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  if (!hasValidCronSecret(request)) return apiError(401, "Unauthorized");

  const ws = Number(process.env.MIA_WORKSPACE_ID);
  if (!Number.isInteger(ws) || ws <= 0) {
    return NextResponse.json({ error: "MIA_WORKSPACE_ID not configured" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const result = await drainDemoQueue(supabase, ws);
  return NextResponse.json({ ok: true, ...result });
}
