import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getActiveCampaignsForUser } from "@/lib/data";

// `force` skips the double-activation guardrail (used after the user confirms the
// "another campaign is already live" warning). Absent/false = enforce the guard.
const Body = z.object({ active: z.boolean(), force: z.boolean().optional() });

export const dynamic = "force-dynamic";

// List every campaign that is live right now across the user's workspaces, so the
// dashboard can show what's dialing and the toggle can pre-check before activating.
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return NextResponse.json({ active: [] });
  return NextResponse.json({ active: await getActiveCampaignsForUser() });
}

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

  // Double-activation guardrail: if the user is turning this campaign ON and
  // ANOTHER campaign in their account is already live, refuse (409) unless they
  // explicitly confirm with force:true. This is what stops two agents dialing in
  // parallel and silently doubling Twilio + ElevenLabs spend. Pausing is never
  // guarded — you can always stop.
  if (parsed.data.active && !parsed.data.force) {
    const others = (await getActiveCampaignsForUser()).filter(
      (c) => c.workspaceId !== workspaceId,
    );
    if (others.length > 0) {
      return NextResponse.json(
        { error: "another_campaign_active", conflict: true, others },
        { status: 409 },
      );
    }
  }

  // Re-activating is the "I've topped up / fixed it, resume" action: clear the
  // auto-pause reason so the campaign can dial again. We deliberately do NOT zero
  // `consecutive_failures`: the breaker decays it on healthy calls, so if the root
  // cause really is fixed it clears itself within a few good calls — but if the
  // pipeline is still broken, keeping the streak means the very next failure
  // re-halts us after ONE wasted call instead of buying another full breaker's
  // worth of billed failures on every resume.
  const patch = parsed.data.active
    ? { active: true, halt_reason: null, halted_at: null }
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
