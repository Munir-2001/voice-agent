import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { areaCode } from "@/lib/phone";
import { timezoneForAreaCode } from "@/lib/timezone";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

// Authenticated management of inbound call requests. APPROVE converts a pending
// request into a callable lead (the active campaign then dials it through every
// safeguard); REJECT closes it out. Nothing here places a call directly — approval
// just makes the lead eligible, so the balance gate + circuit breaker still apply.

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`call-requests:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  const user = await getSessionUser();
  if (!user) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return apiError(503, "Database isn't configured yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");
  const { id, action } = parsed.data;

  const workspaceId = await getActiveWorkspaceId();
  const supabase = createServiceClient();

  // Load the request, scoped to the current workspace so you can only action your
  // own queue. Must still be pending (idempotent against double-clicks).
  const { data: req } = await supabase
    .from("call_requests")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!req) return apiError(404, "Request not found");
  if (req.status !== "pending") {
    return NextResponse.json({ ok: true, already: req.status });
  }

  const reviewedBy = user.email ?? "unknown";
  const now = new Date().toISOString();

  if (action === "reject") {
    await supabase
      .from("call_requests")
      .update({ status: "rejected", reviewed_at: now, reviewed_by: reviewedBy })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // APPROVE → ensure a lead exists for this number in this workspace, then link it.
  const phone = req.phone as string;

  // Never re-add an opted-out number.
  const { data: blocked } = await supabase
    .from("suppression")
    .select("phone")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .maybeSingle();
  if (blocked) {
    return apiError(409, "This number is on your suppression (opt-out) list");
  }

  // Route the new lead onto the campaign's active list (if one is set) so the
  // dialer — which can be scoped to a single list — actually picks it up.
  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("active_list_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const listId = (settings?.active_list_id as number) ?? null;

  // Reuse an existing lead for this number if there is one, else create it.
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .maybeSingle();

  let leadId = existingLead?.id as string | undefined;
  if (!leadId) {
    const { data: inserted, error: insErr } = await supabase
      .from("leads")
      .insert({
        workspace_id: workspaceId,
        list_id: listId,
        name: (req.name as string) ?? "",
        business_name: (req.business_name as string) ?? "",
        phone,
        email: (req.email as string) ?? null,
        industry: (req.industry as string) ?? "",
        timezone: timezoneForAreaCode(areaCode(phone)),
        status: "pending",
        attempts: 0,
        // Provenance: this lead opted in by requesting the call themselves.
        consent_source: `inbound_request:${req.source ?? "portfolio"}`,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("approve: lead insert failed:", insErr?.message);
      return apiError(500, "Could not create the lead");
    }
    leadId = inserted.id as string;
  }

  await supabase
    .from("call_requests")
    .update({
      status: "approved",
      lead_id: leadId,
      reviewed_at: now,
      reviewed_by: reviewedBy,
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true, status: "approved", leadId });
}
