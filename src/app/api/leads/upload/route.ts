import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164US, areaCode } from "@/lib/phone";
import { timezoneForAreaCode } from "@/lib/timezone";
import { cleanName, cleanEmail, cleanState } from "@/lib/clean";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

// Per-request cap. The client uploads large lists in batches of this size to
// stay under Vercel's ~4.5MB request-body limit, so total list size is unbounded.
const MAX_ROWS = 5_000;

// Tolerant field: coerce anything (number, null, long text) to a trimmed string
// capped at 300 chars. It NEVER rejects, so a single messy cell can't fail the
// whole upload — invalid rows are dropped later by the phone check instead.
const STR = z.preprocess(
  (v) => (v == null ? "" : String(v).slice(0, 300)),
  z.string(),
);

const Body = z.object({
  // Optional target list — leads are tagged with it so the dialer can run a
  // campaign on just this list. Omit/null to upload without a list.
  listId: z.number().int().positive().nullable().optional(),
  rows: z
    .array(
      z.object({
        name: STR,
        business_name: STR,
        phone: STR,
        email: STR,
        industry: STR,
        state: STR,
        consent_source: STR,
        website: STR,
      }),
    )
    .max(MAX_ROWS),
});

// Accepts parsed CSV rows, validates + normalizes them, drops invalids,
// duplicates, and suppressed numbers, then inserts as pending leads.
//
// NOTE (auth deferred): this writes via the service-role client so it works
// before real auth exists. It's protected by same-origin + rate limiting only.
// When Supabase Auth + middleware land, re-add a `getUser()` gate and switch to
// the user-session client so RLS applies.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`upload:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return apiError(503, "Database isn't configured yet — set the Supabase env vars.");
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, `Invalid upload (max ${MAX_ROWS.toLocaleString()} rows)`);
  }
  const rows = parsed.data.rows;

  const workspaceId = await getActiveWorkspaceId();
  const supabase = createServiceClient();

  // If a target list was given, verify it belongs to this workspace before we
  // tag any leads with it (never let an upload write into another workspace).
  let listId: number | null = parsed.data.listId ?? null;
  if (listId !== null) {
    const { data: list } = await supabase
      .from("lead_lists")
      .select("id")
      .eq("id", listId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!list) listId = null; // unknown list → upload without one rather than fail
  }

  // Load THIS workspace's suppression list so opted-out numbers never get re-added.
  const { data: suppressed } = await supabase
    .from("suppression")
    .select("phone")
    .eq("workspace_id", workspaceId);
  const blocked = new Set(
    ((suppressed ?? []) as { phone: string }[]).map((s) => s.phone),
  );

  const seen = new Set<string>();
  const clean: Record<string, unknown>[] = [];
  const rejects = { invalid: 0, duplicate: 0, suppressed: 0 };

  for (const row of rows) {
    const e164 = toE164US(row.phone ?? "");
    if (!e164) {
      rejects.invalid++;
      continue;
    }
    if (blocked.has(e164)) {
      rejects.suppressed++;
      continue;
    }
    if (seen.has(e164)) {
      rejects.duplicate++;
      continue;
    }
    seen.add(e164);
    clean.push({
      workspace_id: workspaceId,
      list_id: listId,
      name: cleanName(row.name),
      business_name: cleanName(row.business_name),
      phone: e164,
      email: cleanEmail(row.email),
      industry: (row.industry ?? "").trim(),
      state: cleanState(row.state),
      timezone: timezoneForAreaCode(areaCode(e164)),
      status: "pending" as const,
      attempts: 0,
      consent_source: row.consent_source ?? null,
      website: (row.website ?? "").trim() || null,
    });
  }

  if (clean.length === 0) {
    return NextResponse.json({ imported: 0, rejected: rejects });
  }

  // Upsert on (workspace_id, phone) so re-uploads don't duplicate within a
  // workspace, but the same number can still exist in a different workspace.
  const { error, count } = await supabase
    .from("leads")
    .upsert(clean, {
      onConflict: "workspace_id,phone",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (error) {
    console.error("lead upload failed:", error);
    return apiError(500, "Could not import leads");
  }

  return NextResponse.json({
    imported: count ?? clean.length,
    rejected: rejects,
  });
}
