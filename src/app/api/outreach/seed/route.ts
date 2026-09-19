import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { guardOutreach } from "@/lib/outreach/guard";
import { STARTER_SEQUENCES } from "@/lib/outreach/seed-sequences";

// Admin-only. Seeds the starter Soap Opera + Seinfeld sequences (and their
// steps) into the active workspace. Idempotent by name: a sequence whose name
// already exists is skipped, so re-running never duplicates.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-seed:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();

  const { data: existing } = await sb
    .from("email_sequences")
    .select("name")
    .eq("workspace_id", ws);
  const have = new Set((existing ?? []).map((r: { name: string }) => r.name));

  let created = 0;
  for (const seq of STARTER_SEQUENCES) {
    if (have.has(seq.name)) continue;
    const { data: ins, error } = await sb
      .from("email_sequences")
      .insert({ workspace_id: ws, name: seq.name, kind: seq.kind })
      .select("id")
      .single();
    if (error || !ins) continue;
    const stepRows = seq.steps.map((s) => ({
      sequence_id: ins.id as number,
      step_no: s.step_no,
      day_offset: s.day_offset,
      subject: s.subject,
      body_html: s.body_html,
      active: true,
    }));
    const { error: stepErr } = await sb.from("email_steps").insert(stepRows);
    if (stepErr) return apiError(500, "Could not seed sequence steps");
    created++;
  }

  return NextResponse.json({ ok: true, created });
}
