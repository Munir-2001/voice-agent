import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";

// "HH:MM" with real 00–23 hours and 00–59 minutes.
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Agent id (agent_…) and a comma-separated list of caller phone-number ids
// (phnum_…). Empty string is allowed and means "fall back to the env default".
const AGENT_ID = z.union([
  z.literal(""),
  z.string().trim().regex(/^agent_[A-Za-z0-9]+$/, "Must be an ElevenLabs agent id (agent_…)"),
]);
const PHNUM_LIST = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .regex(
      /^phnum_[A-Za-z0-9]+(\s*,\s*phnum_[A-Za-z0-9]+)*$/,
      "Comma-separated ElevenLabs phone-number ids (phnum_…)",
    ),
]);
// Per-workspace booking URL (Cal.com etc.). Empty = fall back to env BOOKING_LINK.
const BOOKING_LINK = z.union([
  z.literal(""),
  z.string().trim().url("Must be a valid URL (https://…)").max(500),
]);

const Body = z
  .object({
    name: z.string().trim().min(1).max(120),
    windowStart: TIME,
    windowEnd: TIME,
    callsPerTick: z.number().int().min(1).max(20),
    dailyCap: z.number().int().min(1).max(2000),
    maxAttempts: z.number().int().min(1).max(10),
    goalType: z.enum(["financing", "ai_meeting"]),
    agentId: AGENT_ID.optional(),
    callerNumberIds: PHNUM_LIST.optional(),
    bookingLink: BOOKING_LINK.optional(),
  })
  // Enforce legal US calling hours (TCPA 8am–9pm local) and a sane window.
  .refine((s) => toMin(s.windowStart) < toMin(s.windowEnd), {
    message: "Window start must be before window end",
    path: ["windowEnd"],
  })
  .refine((s) => toMin(s.windowStart) >= 8 * 60 && toMin(s.windowEnd) <= 21 * 60, {
    message: "Calling hours must stay within 8:00–21:00 (legal window)",
    path: ["windowStart"],
  })
  // Mirror the dialer's guard: an AI-meeting campaign must use its OWN agent, or it
  // would answer as the shared financing agent. Refuse to save an unsafe config.
  .refine((s) => s.goalType !== "ai_meeting" || Boolean(s.agentId && s.agentId.length > 0), {
    message: "An AI-meeting campaign needs its own ElevenLabs agent id",
    path: ["agentId"],
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

  const workspaceId = await getActiveWorkspaceId();
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
      goal_type: s.goalType,
      // Empty string → null so the dialer falls back to the env default agent/numbers.
      elevenlabs_agent_id: s.agentId ? s.agentId : null,
      caller_number_ids: s.callerNumberIds ? s.callerNumberIds : null,
      // Empty → null so the follow-up falls back to the env BOOKING_LINK default.
      booking_link: s.bookingLink ? s.bookingLink : null,
    })
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("settings update failed:", error);
    return apiError(500, "Could not save settings");
  }
  return NextResponse.json({ ok: true });
}
