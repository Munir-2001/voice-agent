import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164US, areaCode } from "@/lib/phone";
import { timezoneForAreaCode } from "@/lib/timezone";
import { cleanName, cleanEmail, cleanState } from "@/lib/clean";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

const MAX_ROWS = 20_000; // hard cap: bounds memory and one campaign's list size
const STR = z.string().max(200).optional();

const Body = z.object({
  rows: z
    .array(
      z.object({
        name: STR,
        business_name: STR,
        phone: z.string().max(40).optional(),
        email: z.string().max(200).optional(),
        industry: STR,
        state: STR,
        consent_source: STR,
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

  const supabase = createServiceClient();

  // Load the suppression list once so opted-out numbers never get re-added.
  const { data: suppressed } = await supabase.from("suppression").select("phone");
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
    });
  }

  if (clean.length === 0) {
    return NextResponse.json({ imported: 0, rejected: rejects });
  }

  // Upsert on phone so re-uploads don't duplicate existing leads.
  const { error, count } = await supabase
    .from("leads")
    .upsert(clean, { onConflict: "phone", ignoreDuplicates: true, count: "exact" });

  if (error) {
    console.error("lead upload failed:", error);
    return apiError(500, "Could not import leads");
  }

  return NextResponse.json({
    imported: count ?? clean.length,
    rejected: rejects,
  });
}
