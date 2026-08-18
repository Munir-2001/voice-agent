import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getUserWorkspaces, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

// Switches the active workspace. Validates that the signed-in user is actually a
// member of the requested workspace before setting the cookie — so nobody can
// jump into a workspace they don't belong to by forging the request.
export const dynamic = "force-dynamic";

const Body = z.object({ workspaceId: z.number().int().positive() });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`ws-switch:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");

  const workspaces = await getUserWorkspaces();
  if (!workspaces.some((w) => w.id === parsed.data.workspaceId)) {
    return apiError(403, "Not a member of that workspace");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, String(parsed.data.workspaceId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
}
