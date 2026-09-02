import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

const Body = z.object({ active: z.boolean() });

// Toggle the campaign on/off. The dial-tick scheduler reads `active` before
// placing any calls, so this is the master switch behind the dashboard toggle.
// Gated by same-origin + a signed-in session; writes run via the service client.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`campaign:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return apiError(503, "Database isn't configured yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");

  const workspaceId = await getActiveWorkspaceId();
  const supabase = createServiceClient();
  // Re-activating is the "I've topped up / fixed it, resume" action: clear any
  // auto-pause reason and reset the failure counter so the safeguards start fresh.
  // Otherwise a stale halt_reason / non-zero streak would trip us again instantly.
  const patch = parsed.data.active
    ? { active: true, halt_reason: null, halted_at: null, consecutive_failures: 0 }
    : { active: false };
  const { error } = await supabase
    .from("campaign_settings")
    .update(patch)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("campaign update failed:", error);
    return apiError(500, "Could not update the campaign");
  }
  return NextResponse.json({ ok: true, active: parsed.data.active });
}
