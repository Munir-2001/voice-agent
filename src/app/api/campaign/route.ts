import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({ active: z.boolean() });

// Toggle the campaign on/off. The dial-tick scheduler reads `active` before
// placing any calls, so this is the master switch behind the dashboard toggle.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`campaign:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(401, "Unauthorized");

  const { error } = await supabase
    .from("campaign_settings")
    .update({ active: parsed.data.active })
    .eq("id", 1);

  if (error) {
    console.error("campaign update failed:", error);
    return apiError(500, "Could not update the campaign");
  }
  return NextResponse.json({ ok: true, active: parsed.data.active });
}
