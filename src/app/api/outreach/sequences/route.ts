import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { guardOutreach } from "@/lib/outreach/guard";

// Admin-only. Create a new (empty) email sequence in the active workspace.
// Steps are added via /api/outreach/steps.

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["soap_opera", "seinfeld", "custom"]).optional(),
});

export async function POST(request: Request) {
  const denied = await guardOutreach(request);
  if (denied) return denied;
  const rl = rateLimit(`outreach-seq:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Provide a sequence name (1–120 chars)");

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("email_sequences")
    .insert({ workspace_id: ws, name: parsed.data.name, kind: parsed.data.kind ?? "custom" })
    .select("id, name, kind, created_at")
    .single();
  if (error) return apiError(500, "Could not create the sequence");
  return NextResponse.json({ sequence: data });
}
