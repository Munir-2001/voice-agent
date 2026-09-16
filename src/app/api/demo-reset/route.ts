import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

// Dashboard-only "reset a demo number" action. Deletes a lead (and its call rows)
// by phone so that number can be demo-called again — the self-service version of
// the manual cleanup we'd otherwise do by hand for re-tests / recordings.
//
// NOTE: this lives at /api/demo-reset, NOT /api/demo-call/reset — the proxy's
// public allowlist matches by prefix, so a subpath of /api/demo-call would be
// treated as public. Here it stays gated: same-origin + a signed-in session, and
// it only ever touches the workspace the user is currently viewing.
export const dynamic = "force-dynamic";

const Body = z.object({ phone: z.string().min(3).max(40) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`demo-reset:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests — try again in a moment");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "A phone number is required");
  const phone = parsed.data.phone.trim();

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();

  // Delete call rows for this number first (the demos view keys on external_number),
  // then the lead itself. Both scoped to the active workspace so a user can only
  // ever clear data in a workspace they belong to.
  const { data: deletedCalls } = await sb
    .from("calls")
    .delete()
    .eq("workspace_id", ws)
    .eq("external_number", phone)
    .select("id");

  const { data: deletedLeads } = await sb
    .from("leads")
    .delete()
    .eq("workspace_id", ws)
    .eq("phone", phone)
    .select("id");

  return NextResponse.json({
    ok: true,
    deletedLeads: deletedLeads?.length ?? 0,
    deletedCalls: deletedCalls?.length ?? 0,
  });
}
