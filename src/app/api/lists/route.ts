import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getLeadLists, listBelongsToActiveWorkspace } from "@/lib/data";

// Lead-list management, all scoped to the active workspace:
//   GET    -> list all lists (with counts)
//   POST   -> create a list { name }
//   DELETE -> delete a list  { id }  (its leads become unassigned; if it was the
//             active list, the workspace falls back to "all leads")
export const dynamic = "force-dynamic";

async function gate(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  return null;
}

export async function GET(request: Request) {
  const denied = await gate(request);
  if (denied) return denied;
  return NextResponse.json({ lists: await getLeadLists() });
}

export async function POST(request: Request) {
  const denied = await gate(request);
  if (denied) return denied;
  const rl = rateLimit(`lists:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a list name (1–80 chars)");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("lead_lists")
    .insert({ workspace_id: ws, name: parsed.data.name })
    .select("id, name, created_at")
    .single();
  if (error) {
    console.error("create list failed:", error.message);
    return apiError(500, "Could not create the list");
  }
  return NextResponse.json({ list: data });
}

export async function DELETE(request: Request) {
  const denied = await gate(request);
  if (denied) return denied;

  const parsed = z
    .object({ id: z.number().int().positive() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a list id");
  if (!(await listBelongsToActiveWorkspace(parsed.data.id))) {
    return apiError(404, "List not found");
  }

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  // If this was the active list, clear it first so the dialer doesn't point at a
  // deleted list (FK on delete set null also handles it, but be explicit).
  await sb
    .from("campaign_settings")
    .update({ active_list_id: null })
    .eq("workspace_id", ws)
    .eq("active_list_id", parsed.data.id);
  const { error } = await sb
    .from("lead_lists")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", ws);
  if (error) return apiError(500, "Could not delete the list");
  return NextResponse.json({ ok: true });
}
