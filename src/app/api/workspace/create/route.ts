import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getUserWorkspaces, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

// Create a new workspace (= a new campaign) from the dashboard. A workspace needs
// three linked rows: the workspace, its OWN campaign_settings row (paused, so it
// can never auto-dial before you configure it), and a membership making you owner.
// campaign_settings.id has no sequence, so it's set equal to the workspace id
// (the convention the seed established). Inserts are ordered with cleanup so a
// partial failure never leaves an orphan workspace.
export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().trim().min(1).max(120) });

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`ws-create:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  const user = await getSessionUser();
  if (!user) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return apiError(503, "Database isn't configured yet.");

  // Only workspace owners can create more (partners with a single member seat
  // can't). This mirrors the UI, which only shows the control to owners.
  const existing = await getUserWorkspaces();
  if (!existing.some((w) => w.role === "owner")) {
    return apiError(403, "Only a workspace owner can create workspaces");
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid workspace name");
  const name = parsed.data.name;

  const supabase = createServiceClient();

  // 1) workspace — retry the slug on a unique collision (slug isn't user-facing).
  const baseSlug = slugify(name);
  let workspaceId: number | null = null;
  for (let attempt = 0; attempt < 4 && workspaceId === null; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name, slug })
      .select("id")
      .single();
    if (!error && data) {
      workspaceId = data.id as number;
      break;
    }
    // 23505 = unique_violation (slug taken) → try another slug; else hard-fail.
    if (error && error.code !== "23505") {
      console.error("workspace create failed:", error.message);
      return apiError(500, "Could not create the workspace");
    }
  }
  if (workspaceId === null) return apiError(500, "Could not create the workspace");

  // 2) its campaign_settings row (paused). id = workspaceId by convention.
  const { error: csErr } = await supabase
    .from("campaign_settings")
    .insert({ id: workspaceId, workspace_id: workspaceId, name, active: false });
  if (csErr) {
    console.error("workspace settings insert failed:", csErr.message);
    await supabase.from("workspaces").delete().eq("id", workspaceId);
    return apiError(500, "Could not create the workspace");
  }

  // 3) membership — the creator owns it.
  const { error: memErr } = await supabase
    .from("workspace_members")
    .insert({ user_id: user.id, workspace_id: workspaceId, role: "owner" });
  if (memErr) {
    console.error("workspace membership insert failed:", memErr.message);
    await supabase.from("campaign_settings").delete().eq("id", workspaceId);
    await supabase.from("workspaces").delete().eq("id", workspaceId);
    return apiError(500, "Could not create the workspace");
  }

  // Land the user in the new workspace immediately.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, String(workspaceId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, workspaceId, name });
}
