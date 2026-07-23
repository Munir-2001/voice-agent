import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

const Body = z.object({ leadId: z.string().uuid() });

// Marks a lead as contacted (the human called them back). Stamps contacted_at.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`contacted:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return apiError(503, "Database isn't configured yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("leads")
    .update({ contacted_at: new Date().toISOString() })
    .eq("id", parsed.data.leadId);

  if (error) {
    // Full detail (often: contacted_at column missing) goes to the server log;
    // the client gets a generic message so we don't leak schema internals.
    console.error("mark-contacted failed:", error);
    return apiError(500, "Could not mark contacted");
  }
  return NextResponse.json({ ok: true });
}
