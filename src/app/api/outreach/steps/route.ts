import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { guardOutreach } from "@/lib/outreach/guard";

// Admin-only. Add / edit / delete the steps of a sequence. Every mutation is
// verified to belong to the active workspace via the step's parent sequence.

export const dynamic = "force-dynamic";

async function sequenceInWorkspace(
  sb: SupabaseClient,
  sequenceId: number,
  ws: number,
): Promise<boolean> {
  const { data } = await sb
    .from("email_sequences")
    .select("id")
    .eq("id", sequenceId)
    .eq("workspace_id", ws)
    .maybeSingle();
  return Boolean(data);
}

// Resolve a step's parent sequence id, but only if it lives in this workspace.
async function stepSequenceInWorkspace(
  sb: SupabaseClient,
  stepId: number,
  ws: number,
): Promise<number | null> {
  const { data } = await sb
    .from("email_steps")
    .select("id, sequence_id, email_sequences!inner(workspace_id)")
    .eq("id", stepId)
    .eq("email_sequences.workspace_id", ws)
    .maybeSingle();
  return data ? ((data as { sequence_id: number }).sequence_id ?? null) : null;
}

const AddSchema = z.object({
  sequenceId: z.number().int().positive(),
  subject: z.string().max(300).optional(),
  body_html: z.string().max(50_000).optional(),
  day_offset: z.number().int().min(0).max(365).optional(),
});

export async function POST(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-step:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid step");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  if (!(await sequenceInWorkspace(sb, parsed.data.sequenceId, ws))) {
    return apiError(404, "Not found");
  }

  // Next step number = current max + 1.
  const { data: last } = await sb
    .from("email_steps")
    .select("step_no")
    .eq("sequence_id", parsed.data.sequenceId)
    .order("step_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = ((last?.step_no as number) ?? 0) + 1;

  const { data, error } = await sb
    .from("email_steps")
    .insert({
      sequence_id: parsed.data.sequenceId,
      step_no: nextNo,
      day_offset: parsed.data.day_offset ?? Math.max(0, nextNo - 1),
      subject: parsed.data.subject ?? "",
      body_html: parsed.data.body_html ?? "",
      active: true,
    })
    .select("id, step_no, day_offset, subject, body_html, active")
    .single();
  if (error) return apiError(500, "Could not add the step");
  return NextResponse.json({ step: data });
}

const UpdateSchema = z.object({
  id: z.number().int().positive(),
  subject: z.string().max(300).optional(),
  body_html: z.string().max(50_000).optional(),
  day_offset: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-step:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid update");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  if (!(await stepSequenceInWorkspace(sb, parsed.data.id, ws))) {
    return apiError(404, "Not found");
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.subject !== undefined) update.subject = parsed.data.subject;
  if (parsed.data.body_html !== undefined) update.body_html = parsed.data.body_html;
  if (parsed.data.day_offset !== undefined) update.day_offset = parsed.data.day_offset;
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (Object.keys(update).length === 0) return apiError(400, "Nothing to update");

  const { data, error } = await sb
    .from("email_steps")
    .update(update)
    .eq("id", parsed.data.id)
    .select("id, step_no, day_offset, subject, body_html, active")
    .single();
  if (error) return apiError(500, "Could not save the step");
  return NextResponse.json({ step: data });
}

const DeleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid id");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  if (!(await stepSequenceInWorkspace(sb, parsed.data.id, ws))) {
    return apiError(404, "Not found");
  }
  const { error } = await sb.from("email_steps").delete().eq("id", parsed.data.id);
  if (error) return apiError(500, "Could not delete the step");
  return NextResponse.json({ ok: true });
}
