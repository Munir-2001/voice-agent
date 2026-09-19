import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { guardOutreach } from "@/lib/outreach/guard";
import { enrollCampaignLeads } from "@/lib/outreach/engine";

// Admin-only. Create + edit + launch email campaigns. Launching flips status to
// 'active' and enrolls the list's leads into the sequence (the pg_cron email
// tick then sends). A campaign can only launch once it has a sequence.

export const dynamic = "force-dynamic";

const HHMM = /^\d{2}:\d{2}$/;

async function campaignInWorkspace(
  sb: SupabaseClient,
  id: number,
  ws: number,
): Promise<{ id: number; sequence_id: number | null; status: string } | null> {
  const { data } = await sb
    .from("email_campaigns")
    .select("id, sequence_id, status")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  return (data as { id: number; sequence_id: number | null; status: string } | null) ?? null;
}

// Only one campaign per workspace can catch inbound signups. When one is
// flagged, clear the flag on every other campaign in that workspace.
async function makeSoleAutoEnroll(sb: SupabaseClient, ws: number, keepId: number) {
  await sb
    .from("email_campaigns")
    .update({ auto_enroll_inbound: false })
    .eq("workspace_id", ws)
    .neq("id", keepId);
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  listId: z.number().int().positive().nullable().optional(),
  sequenceId: z.number().int().positive().nullable().optional(),
  fromIdentity: z.string().trim().max(200).optional(),
  dailyCap: z.number().int().min(1).max(1000).optional(),
  windowStart: z.string().regex(HHMM).optional(),
  windowEnd: z.string().regex(HHMM).optional(),
  autoEnroll: z.boolean().optional(),
});

export async function POST(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-camp:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a campaign name (1–120 chars)");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("email_campaigns")
    .insert({
      workspace_id: ws,
      name: parsed.data.name,
      list_id: parsed.data.listId ?? null,
      sequence_id: parsed.data.sequenceId ?? null,
      from_identity: parsed.data.fromIdentity ?? null,
      daily_cap: parsed.data.dailyCap ?? 50,
      window_start: parsed.data.windowStart ?? "09:00",
      window_end: parsed.data.windowEnd ?? "17:00",
      auto_enroll_inbound: parsed.data.autoEnroll ?? false,
      status: "draft",
    })
    .select("id, name, status")
    .single();
  if (error) return apiError(500, "Could not create the campaign");
  if (parsed.data.autoEnroll && data) {
    await makeSoleAutoEnroll(sb, ws, data.id as number);
  }
  return NextResponse.json({ campaign: data });
}

const UpdateSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["launch", "pause", "resume"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  listId: z.number().int().positive().nullable().optional(),
  sequenceId: z.number().int().positive().nullable().optional(),
  fromIdentity: z.string().trim().max(200).optional(),
  dailyCap: z.number().int().min(1).max(1000).optional(),
  windowStart: z.string().regex(HHMM).optional(),
  windowEnd: z.string().regex(HHMM).optional(),
  autoEnroll: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-camp:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid update");
  const body = parsed.data;

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const current = await campaignInWorkspace(sb, body.id, ws);
  if (!current) return apiError(404, "Not found");

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.listId !== undefined) update.list_id = body.listId;
  if (body.sequenceId !== undefined) update.sequence_id = body.sequenceId;
  if (body.fromIdentity !== undefined) update.from_identity = body.fromIdentity;
  if (body.dailyCap !== undefined) update.daily_cap = body.dailyCap;
  if (body.windowStart !== undefined) update.window_start = body.windowStart;
  if (body.windowEnd !== undefined) update.window_end = body.windowEnd;
  if (body.autoEnroll !== undefined) update.auto_enroll_inbound = body.autoEnroll;

  // The sequence in effect after this update (may be changed in the same call).
  const effectiveSequenceId =
    body.sequenceId !== undefined ? body.sequenceId : current.sequence_id;

  if (body.action === "launch") {
    if (!effectiveSequenceId) {
      return apiError(400, "Attach a sequence before launching this campaign");
    }
    update.status = "active";
  } else if (body.action === "pause") {
    update.status = "paused";
  } else if (body.action === "resume") {
    update.status = "active";
  }

  if (Object.keys(update).length > 0) {
    const { error } = await sb.from("email_campaigns").update(update).eq("id", body.id);
    if (error) return apiError(500, "Could not update the campaign");
  }
  if (body.autoEnroll === true) {
    await makeSoleAutoEnroll(sb, ws, body.id);
  }

  // Enroll on launch (idempotent — safe if leads were already enrolled).
  let enrolled: number | undefined;
  if (body.action === "launch") {
    const res = await enrollCampaignLeads(body.id);
    enrolled = res.enrolled;
  }

  return NextResponse.json({ ok: true, enrolled });
}
