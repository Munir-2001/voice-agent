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

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const phoneLeads: Record<string, unknown>[] = [];
  const emailOnly: Record<string, unknown>[] = [];
  const rejects = { invalid: 0, duplicate: 0, suppressed: 0 };

  const isValidEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

  const base = (row: (typeof rows)[number]) => ({
    workspace_id: workspaceId,
    list_id: listId,
    name: cleanName(row.name),
    business_name: cleanName(row.business_name),
    industry: (row.industry ?? "").trim(),
    state: cleanState(row.state),
    status: "pending" as const,
    attempts: 0,
    consent_source: row.consent_source ?? null,
    website: (row.website ?? "").trim() || null,
  });

  for (const row of rows) {
    const e164 = toE164US(row.phone ?? "");
    const email = cleanEmail(row.email);

    if (e164) {
      if (blocked.has(e164)) {
        rejects.suppressed++;
        continue;
      }
      if (seenPhones.has(e164)) {
        rejects.duplicate++;
        continue;
      }
      seenPhones.add(e164);
      phoneLeads.push({
        ...base(row),
        phone: e164,
        email,
        timezone: timezoneForAreaCode(areaCode(e164)),
      });
      continue;
    }

    // No callable phone — keep it ONLY if it has a valid email (email-only lead,
    // imported for email outreach; the dialer skips null-phone leads).
    if (email && isValidEmail(email)) {
      const key = email.toLowerCase();
      if (seenEmails.has(key)) {
        rejects.duplicate++;
        continue;
      }
      seenEmails.add(key);
      emailOnly.push({
        ...base(row),
        phone: null,
        email,
        timezone: timezoneForAreaCode(areaCode("")),
      });
      continue;
    }

    rejects.invalid++;
  }

  let imported = 0;

  // Phone leads: upsert on (workspace_id, phone) so re-uploads don't duplicate
  // within a workspace (the same number can still exist in another workspace).
  if (phoneLeads.length > 0) {
    const { error, count } = await supabase.from("leads").upsert(phoneLeads, {
      onConflict: "workspace_id,phone",
      ignoreDuplicates: true,
      count: "exact",
    });
    if (error) {
      console.error("lead upload failed:", error);
      return apiError(500, "Could not import leads");
    }
    imported += count ?? phoneLeads.length;
  }

  // Email-only leads: (workspace_id, phone) can't dedupe NULL phones, so dedupe
  // by email against what's already in the workspace before inserting.
  if (emailOnly.length > 0) {
    const emails = emailOnly.map((l) => (l.email as string).toLowerCase());
    const { data: existing } = await supabase
      .from("leads")
      .select("email")
      .eq("workspace_id", workspaceId)
      .in("email", emails);
    const have = new Set(
      ((existing ?? []) as { email: string | null }[]).map((r) =>
        (r.email ?? "").toLowerCase(),
      ),
    );
    const toInsert = emailOnly.filter(
      (l) => !have.has((l.email as string).toLowerCase()),
    );
    rejects.duplicate += emailOnly.length - toInsert.length;
    if (toInsert.length > 0) {
      const { error, count } = await supabase
        .from("leads")
        .insert(toInsert, { count: "exact" });
      if (error) {
        console.error("email-only lead upload failed:", error);
        return apiError(500, "Could not import leads");
      }
      imported += count ?? toInsert.length;
    }
  }

  return NextResponse.json({ imported, rejected: rejects });
}
