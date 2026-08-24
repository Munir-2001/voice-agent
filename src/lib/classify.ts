import type { CallOutcome, TranscriptTurn } from "./types";

// Keyword guardrail — opt-out requests must ALWAYS win, never trusted to the
// model alone (Dev-Manual Phase 5, Testing-Plan T5).
const OPT_OUT_PATTERNS =
  /\b(remove me|take me off|stop calling|don'?t call|do not call|unsubscribe|opt me out)\b/i;

export function hasOptOutLanguage(transcript: TranscriptTurn[]): boolean {
  return transcript.some(
    (t) => t.role === "prospect" && OPT_OUT_PATTERNS.test(t.text),
  );
}

// Voicemail-greeting guardrail. A recorded greeting ("leave a message", "you've
// reached…", "after the tone") is NOT a live callback request — but its wording
// ("I'll call you right back") fools the model into "callback". These phrases are
// said almost exclusively by answering machines, so we deterministically force
// "voicemail" and never let such a call reach the warm/Interested queue.
const VOICEMAIL_PATTERNS =
  /\b(leave (a|your|me a) message|after the (tone|beep)|at the (tone|beep)|you'?ve reached|please record|record your message|sorry i missed your call|unavailable to take your call|can'?t (take|get to) your call right now)\b/i;

export function looksLikeVoicemail(transcript: TranscriptTurn[]): boolean {
  return transcript.some(
    (t) => t.role === "prospect" && VOICEMAIL_PATTERNS.test(t.text),
  );
}

export interface Classification {
  outcome: CallOutcome;
  summary: string;
  callbackAt: string | null;
  timezone: string | null; // IANA, only if the prospect stated where they are
  // AI-meeting campaign extras (null for the financing goal)
  meetingEmail?: string | null; // email confirmed/corrected on the call
  meetingCity?: string | null; // city stated on the call
  industry?: string | null; // industry confirmed or clear from the company
}

export type ClassifyGoal = "financing" | "ai_meeting";

// Shared timezone/callback rules reused by both prompts.
const TIME_RULES = `For timezone: if the prospect states where they are (a city, state, or region), infer their IANA timezone (Texas->"America/Chicago", California->"America/Los_Angeles", Arizona->"America/Phoenix", New York->"America/New_York", etc.) and return it in "timezone"; else null.
For callbackAt: resolve any relative time the prospect gives ("tomorrow at 2pm", "Monday morning", "after 3") against the "Current time" provided below, in the PROSPECT'S timezone (their stated location if given, else the assumed timezone). Output a full ISO8601 timestamp WITH that timezone's UTC offset (e.g. 2026-08-17T14:00:00-05:00). "morning"≈9:00, "afternoon"≈14:00, "evening"≈17:00 local. If no specific time was requested, callbackAt is null.`;

const FINANCING_PROMPT = `You classify a completed outbound sales call transcript for a business-financing campaign.
Return STRICT JSON: {"outcome": one of ["interested","not_interested","callback","voicemail","no_answer","opted_out"], "summary": "2 sentences max", "callbackAt": ISO8601 or null, "timezone": IANA timezone string or null}.
Rules: if the prospect asked to be removed or to stop calling, outcome MUST be "opted_out". If they asked to be called at a specific time, outcome is "callback" and set callbackAt. Never invent interest that isn't there.
${TIME_RULES}`;

const MEETING_PROMPT = `You classify a completed outbound call transcript for NextGen AI. The call's goal was to book a FREE exploratory AI-consulting meeting and capture the prospect's email + preferred time.
Return STRICT JSON: {"outcome": one of ["meeting_booked","callback","interested","not_interested","voicemail","no_answer","not_decision_maker","bad_number","opted_out","needs_review"], "summary": "2 sentences max", "callbackAt": ISO8601 or null, "timezone": IANA timezone string or null, "meetingEmail": string or null, "meetingCity": string or null, "industry": string or null}.
Outcome rules (evaluate in this priority order; pick the FIRST that fits):
- "opted_out": asked to stop calling or be removed (this ALWAYS wins).
- "not_decision_maker": the call only ever reached a receptionist, assistant, answering service, IVR/phone menu, or a screening system (e.g. "record your name and reason and I'll see if they're available", "who's calling?", "they're not available") and NEVER reached the actual owner/decision-maker who could agree to a meeting. Politely taking a message is NOT interest.
- "voicemail": reached a recorded greeting / answering machine. A greeting such as "leave a message and I'll call you (right) back", "you've reached…", "after the tone/beep", or "sorry I missed your call" is VOICEMAIL — a RECORDING promising to call back is NOT a live person requesting a callback. If the only prospect turn is such a greeting (and there's no real back-and-forth), it is voicemail.
- "bad_number": wrong number, disconnected, or not the business.
- "meeting_booked": the DECISION-MAKER agreed to the meeting AND gave or confirmed an email (a time is a plus).
- "callback": a LIVE person explicitly asked to be contacted at a specific later time — set callbackAt. This requires a genuine two-way exchange, never a recorded greeting.
- "interested": the DECISION-MAKER THEMSELVES was genuinely warm about the idea and open to a meeting but did NOT commit to one or give a time. Do NOT mark "interested" just because the call was polite, or because a gatekeeper/receptionist engaged — interest must come from the actual prospect.
- "not_interested": the decision-maker declined.
- "no_answer": no meaningful conversation happened (silence, immediate hang-up).
- "needs_review": genuinely ambiguous/unusual — a human should check.
Capture (fill these whenever present, for ANY outcome — especially meeting_booked):
- meetingEmail: the email confirmed or newly given (normalize spoken forms like "name at domain dot com" → name@domain.com; use the corrected one if re-spelled), else null.
- meetingCity: the city, state, or region they said they're in (e.g. "Austin", "California"), else null.
- callbackAt: the specific meeting/callback day+time they gave, resolved to ISO8601 with offset. SET THIS EVEN FOR "meeting_booked" whenever a time was mentioned (e.g. "tomorrow at 2pm") — not only for the "callback" outcome.
- industry: the industry they confirmed or that's clear from the company, else null.
Never invent a booked meeting that didn't happen.
${TIME_RULES}`;

// OpenAI-compatible classification providers, tried in order. Groq is primary
// (fastest, free); DeepSeek and Together are automatic fallbacks so a Groq rate
// limit or outage under high call volume doesn't drop classifications. Only
// providers whose API key is configured are used.
interface Provider {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function providers(): Provider[] {
  const out: Provider[] = [];
  if (process.env.GROQ_API_KEY) {
    out.push({
      name: "groq",
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      // llama-3.3-70b-versatile was decommissioned on Groq; gpt-oss-120b is a
      // current, JSON-capable model. Override with GROQ_MODEL if needed.
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    out.push({
      name: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    });
  }
  if (process.env.TOGETHER_API_KEY) {
    out.push({
      name: "together",
      apiKey: process.env.TOGETHER_API_KEY,
      baseUrl: process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz/v1",
      model:
        process.env.TOGETHER_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    });
  }
  return out;
}

type ChatMessage = { role: "system" | "user"; content: string };

// One classification attempt against a single provider. Throws on any HTTP or
// parse failure so the caller can fall through to the next provider.
async function callProvider(
  p: Provider,
  messages: ChatMessage[],
): Promise<Classification> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content) as Classification;
  return {
    outcome: parsed.outcome,
    summary: parsed.summary,
    callbackAt: parsed.callbackAt ?? null,
    timezone: parsed.timezone ?? null,
    meetingEmail: parsed.meetingEmail ?? null,
    meetingCity: parsed.meetingCity ?? null,
    industry: parsed.industry ?? null,
  };
}

/**
 * Classify a transcript via an OpenAI-compatible LLM, cascading across
 * configured providers (Groq → DeepSeek → Together) so one provider being
 * rate-limited or down doesn't lose the classification. Falls back to a safe
 * default only if every provider fails, so the webhook never throws.
 *
 * `opts.now` + `opts.timezone` let the model turn relative callback requests
 * into an accurate absolute time in the lead's local (US) hours.
 */
export async function classifyTranscript(
  transcript: TranscriptTurn[],
  opts?: { now?: Date; timezone?: string; goal?: ClassifyGoal },
): Promise<Classification> {
  const goal: ClassifyGoal = opts?.goal ?? "financing";
  // Guardrails first — deterministic, model-independent.
  if (hasOptOutLanguage(transcript)) {
    return {
      outcome: "opted_out",
      summary: "Prospect requested removal from the calling list.",
      callbackAt: null,
      timezone: null,
    };
  }
  // A recorded voicemail greeting must never be scored as a warm callback.
  if (looksLikeVoicemail(transcript)) {
    return {
      outcome: "voicemail",
      summary: "Reached a voicemail greeting; no live conversation took place.",
      callbackAt: null,
      timezone: null,
    };
  }

  const provs = providers();
  if (provs.length === 0) {
    // No key configured (e.g. local UI dev) — return a neutral placeholder.
    return {
      outcome: "no_answer",
      summary: "Not classified (no LLM key).",
      callbackAt: null,
      timezone: null,
    };
  }

  const text = transcript
    .map((t) => `${t.role === "agent" ? "AGENT" : "PROSPECT"}: ${t.text}`)
    .join("\n");

  // Give the model the prospect's current local time so it can resolve relative
  // callback requests ("tomorrow at 2pm") into an accurate absolute timestamp.
  const now = opts?.now ?? new Date();
  const timezone = opts?.timezone || "America/New_York";
  const nowLocal = now.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const contextPrompt = `Current time (UTC): ${now.toISOString()}. Assumed prospect timezone from their phone area code (may be wrong if they've moved): ${timezone} — locally that's ${nowLocal}. Resolve any callback time against the current time, preferring the prospect's STATED location timezone if they mention one.`;

  const messages: ChatMessage[] = [
    { role: "system", content: goal === "ai_meeting" ? MEETING_PROMPT : FINANCING_PROMPT },
    { role: "system", content: contextPrompt },
    { role: "user", content: text },
  ];

  // Try each provider in order; the first success wins.
  for (const p of provs) {
    try {
      return await callProvider(p, messages);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`classify: ${p.name} failed, trying next:`, message);
    }
  }

  // Every provider failed — never throw; leave it for manual review.
  return {
    outcome: "no_answer",
    summary: "Classification unavailable; needs manual review.",
    callbackAt: null,
    timezone: null,
  };
}
