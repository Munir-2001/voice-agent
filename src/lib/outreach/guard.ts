import "server-only";
// Shared gate for every /api/outreach/* route: same-origin + admin only.
// Non-admins get a 404 (mirrors requireAdminPage's notFound), so the subsystem
// is invisible to client workspace members. Each route still applies its own
// rate limit and Zod validation on top.

import { isSameOrigin, apiError } from "@/lib/security";
import { isCurrentUserAdmin } from "@/lib/admin";

export async function guardOutreach(request: Request): Promise<Response | null> {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  if (!(await isCurrentUserAdmin())) return apiError(404, "Not found");
  return null;
}
