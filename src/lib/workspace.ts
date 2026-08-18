import "server-only";
// Resolves which workspace the current dashboard user is acting in. Isolation is
// enforced in app code: every data query filters by the active workspace id, and
// a user can only ever resolve to a workspace they're a member of. A user with no
// membership falls back to Default (id 1) so nobody is ever locked out — Private
// workspaces are opt-in via membership only.

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSessionUser } from "@/lib/auth";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";
export const DEFAULT_WORKSPACE_ID = 1;

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  role: string; // 'owner' marks the user's home workspace (default landing)
}

type MemberRow = { role: string | null; workspaces: Omit<Workspace, "role"> | Omit<Workspace, "role">[] | null };

// Every workspace the current user is a member of (sorted by id). Empty if not
// signed in or Supabase isn't configured.
export async function getUserWorkspaces(): Promise<Workspace[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getSessionUser();
  if (!user) return [];

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("workspace_members")
    .select("role, workspaces(id, name, slug)")
    .eq("user_id", user.id);
  if (error) {
    console.error("getUserWorkspaces:", error.message);
    return [];
  }
  const rows = (data ?? []) as MemberRow[];
  const workspaces = rows
    .flatMap((r) => {
      const list = Array.isArray(r.workspaces)
        ? r.workspaces
        : r.workspaces
          ? [r.workspaces]
          : [];
      return list.map((w) => ({ ...w, role: r.role ?? "member" }));
    })
    .sort((a, b) => a.id - b.id);
  return workspaces;
}

// The active workspace id for the current request: the cookie value if the user
// is a member of it; else the user's HOME workspace (the one they own); else
// their first workspace; else Default (never locks anyone out).
export async function getActiveWorkspaceId(): Promise<number> {
  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) return DEFAULT_WORKSPACE_ID;

  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const wanted = raw ? Number(raw) : NaN;
  if (Number.isFinite(wanted) && workspaces.some((w) => w.id === wanted)) {
    return wanted;
  }
  // First visit / no cookie: land on the workspace the user owns (their own
  // data), so the admin opens straight into Private. Falls back to first.
  const home = workspaces.find((w) => w.role === "owner");
  return (home ?? workspaces[0]).id;
}
