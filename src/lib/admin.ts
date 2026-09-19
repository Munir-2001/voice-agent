import "server-only";
// Admin gate. Everything under the Outreach section (cold-email campaigns) is
// admin-only — it must NEVER be visible to a client workspace member (e.g. Rose).
// Admins are listed in ADMIN_EMAILS (comma-separated). The check is by the
// VERIFIED session email, and every /api/outreach route + Outreach page re-checks
// server-side (defense in depth — never trust the client to hide a menu item).

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// True only if `email` is on the allow-list. Fails CLOSED: if ADMIN_EMAILS is
// unset there are no admins, so nobody is granted access rather than everybody.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

// Whether the CURRENT session belongs to an admin. Use in API routes and server
// pages/layouts to decide what to render or allow.
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return isAdminEmail(user?.email ?? null);
}

// Page-level guard: 404 (not 403) for non-admins so an Outreach route is
// indistinguishable from a route that doesn't exist. Call at the top of every
// Outreach server page.
export async function requireAdminPage(): Promise<void> {
  if (!(await isCurrentUserAdmin())) notFound();
}
