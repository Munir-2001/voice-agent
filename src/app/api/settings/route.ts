import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

// "HH:MM" with real 00–23 hours and 00–59 minutes.
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const Body = z
  .object({
    name: z.string().trim().min(1).max(120),
    windowStart: TIME,
    windowEnd: TIME,
    callsPerTick: z.number().int().min(1).max(20),
    dailyCap: z.number().int().min(1).max(2000),
    maxAttempts: z.number().int().min(1).max(10),
  })
  // Enforce legal US calling hours (TCPA 8am–9pm local) and a sane window.
  .refine((s) => toMin(s.windowStart) < toMin(s.windowEnd), {
    message: "Window start must be before window end",
    path: ["windowEnd"],
  })
  .refine((s) => toMin(s.windowStart) >= 8 * 60 && toMin(s.windowEnd) <= 21 * 60, {
    message: "Calling hours must stay within 8:00–21:00 (legal window)",
    path: ["windowStart"],
  });

// Persist the campaign guardrails (calling hours + pacing). The dial-tick
// scheduler reads these before every tick.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`settings:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!(await getSessionUser())) return apiError(401, "Unauthorized");
  if (!isSupabaseConfigured()) return apiError(503, "Database isn't configured yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid settings");
  const s = parsed.data;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("campaign_settings")
    .update({
      name: s.name,
      window_start: s.windowStart,
      window_end: s.windowEnd,
      calls_per_tick: s.callsPerTick,
      daily_cap: s.dailyCap,
      max_attempts: s.maxAttempts,
    })
    .eq("id", 1);

  if (error) {
    console.error("settings update failed:", error);
    return apiError(500, "Could not save settings");
  }
  return NextResponse.json({ ok: true });
}
