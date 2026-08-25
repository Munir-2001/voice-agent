import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSameOrigin, apiError } from "@/lib/security";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { listBelongsToActiveWorkspace } from "@/lib/data";

// Set which lead list the dialer calls for the active workspace. Passing
// listId: null means "call all leads" (no list restriction).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");

  const parsed = z
    .object({ listId: z.number().int().positive().nullable() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide listId (number or null)");
  const { listId } = parsed.data;

  if (listId !== null && !(await listBelongsToActiveWorkspace(listId))) {
    return apiError(404, "List not found");
  }

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { error } = await sb
    .from("campaign_settings")
    .update({ active_list_id: listId })
    .eq("workspace_id", ws);
  if (error) {
    console.error("activate list failed:", error.message);
    return apiError(500, "Could not set the active list");
  }
  return NextResponse.json({ ok: true, activeListId: listId });
}
