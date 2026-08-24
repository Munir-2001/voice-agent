import "server-only";
// Shared helpers for inbound handling (voice caller-lookup + SMS auto-reply).
// Both need to identify who's contacting us by their phone number and pull the
// lead's context so replies are personalized and on-campaign.

import { createServiceClient } from "@/lib/supabase/server";
import { providers } from "@/lib/classify";

// Normalize a phone to E.164 (US) plus its last-10 digits for loose matching.
export function normalizePhone(raw: string): { e164: string | null; last10: string | null } {
  const digits = (raw || "").replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return { e164: null, last10: null };
  return { e164: `+1${national}`, last10: national };
}

export interface CallerContext {
  found: boolean;
  name: string;
  firstName: string;
  company: string;
  industry: string;
  status: string;
  leadId: string | null;
  workspaceId: number | null;
  goal: "financing" | "ai_meeting";
}

const EMPTY_CONTEXT: CallerContext = {
  found: false,
  name: "",
  firstName: "",
  company: "",
  industry: "",
  status: "",
  leadId: null,
  workspaceId: null,
  goal: "ai_meeting",
};

// Look up a lead by the phone that called/texted us. Not workspace-scoped —
// inbound can hit any campaign — so we take the most recently-contacted match.
// The lead's workspace resolves the campaign goal (drives the reply framing).
export async function lookupLeadByPhone(phone: string): Promise<CallerContext> {
  const { e164, last10 } = normalizePhone(phone);
  if (!last10) return EMPTY_CONTEXT;

  const sb = createServiceClient();
  const { data } = await sb
    .from("leads")
    .select("id, name, business_name, industry, status, workspace_id, phone, last_called_at")
    .or(`phone.eq.${e164},phone.ilike.%${last10}`)
    .order("last_called_at", { ascending: false, nullsFirst: false })
    .limit(1);

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return EMPTY_CONTEXT;

  const workspaceId = (row.workspace_id as number) ?? null;
  let goal: CallerContext["goal"] = "ai_meeting";
  if (workspaceId != null) {
    const { data: cs } = await sb
      .from("campaign_settings")
      .select("goal_type")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    goal = (cs?.goal_type as string) === "financing" ? "financing" : "ai_meeting";
  }

  const name = (row.name as string) ?? "";
  return {
    found: true,
    name,
    firstName: name.trim().split(/\s+/)[0] || name,
    company: (row.business_name as string) ?? "",
    industry: (row.industry as string) ?? "",
    status: (row.status as string) ?? "",
    leadId: (row.id as string) ?? null,
    workspaceId,
    goal,
  };
}

// Generate a SHORT, on-brand SMS reply via the LLM provider cascade. Keeps it to
// 1–2 sentences and works in the booking link when relevant. Returns a safe
// fallback if no provider is configured or all fail (SMS must never 500).
export async function generateSmsReply(
  body: string,
  ctx: CallerContext,
  bookingLink: string,
): Promise<string> {
  const fallback = bookingLink
    ? `Thanks for the reply! This is Emma from NextGen AI. If it's easier, you can grab a quick time with our founder Munir here: ${bookingLink}`
    : "Thanks for the reply! This is Emma from NextGen AI — happy to help. What's the best email to send a few details to?";

  const provs = providers();
  if (provs.length === 0) return fallback;

  const who = ctx.found
    ? `You're texting with ${ctx.firstName || ctx.name}${ctx.company ? ` at ${ctx.company}` : ""}${ctx.industry ? ` (industry: ${ctx.industry})` : ""}. We recently called them about NextGen AI.`
    : "You don't have prior context on this person; they just texted the NextGen AI line.";

  const system = `You are Emma from NextGen AI replying to an INBOUND text message. NextGen AI helps businesses put repetitive work (answering calls, follow-ups, scheduling, admin) on autopilot to save time and win back customers. Your goal is to book a free 20-minute exploratory call with our founder Munir.
${who}
Rules: Reply in ONE or at most TWO short sentences (this is an SMS, keep it under ~300 characters). Warm, human, never pushy, no jargon. If they seem interested or ask how to talk, share the booking link${bookingLink ? ` (${bookingLink})` : ""}. If they ask a question, answer briefly then nudge toward the call. Never invent prices or guarantees. Output ONLY the message text, nothing else.`;

  for (const p of provs) {
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.4,
          max_tokens: 160,
          messages: [
            { role: "system", content: system },
            { role: "user", content: body.slice(0, 800) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${p.name} ${res.status}`);
      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content ?? "").trim();
      if (text) return text.slice(0, 480);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`sms reply: ${p.name} failed, trying next:`, message);
    }
  }
  return fallback;
}
