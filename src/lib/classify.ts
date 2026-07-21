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

export interface Classification {
  outcome: CallOutcome;
  summary: string;
  callbackAt: string | null;
}

const SYSTEM_PROMPT = `You classify a completed outbound sales call transcript for a business-financing campaign.
Return STRICT JSON: {"outcome": one of ["interested","not_interested","callback","voicemail","no_answer","opted_out"], "summary": "2 sentences max", "callbackAt": ISO8601 or null}.
Rules: if the prospect asked to be removed or to stop calling, outcome MUST be "opted_out". If they asked to be called at a specific time, outcome is "callback" and set callbackAt. Never invent interest that isn't there.`;

/**
 * Classify a transcript via a Groq (OpenAI-compatible) call.
 * Falls back to a safe default on any error so the webhook never throws.
 * Requires GROQ_API_KEY and (optionally) GROQ_MODEL / GROQ_BASE_URL.
 */
export async function classifyTranscript(
  transcript: TranscriptTurn[],
): Promise<Classification> {
  // Guardrail first — deterministic, model-independent.
  if (hasOptOutLanguage(transcript)) {
    return {
      outcome: "opted_out",
      summary: "Prospect requested removal from the calling list.",
      callbackAt: null,
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  if (!apiKey) {
    // No key configured (e.g. local UI dev) — return a neutral placeholder.
    return { outcome: "no_answer", summary: "Not classified (no LLM key).", callbackAt: null };
  }

  const text = transcript
    .map((t) => `${t.role === "agent" ? "AGENT" : "PROSPECT"}: ${t.text}`)
    .join("\n");

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content) as Classification;
    return parsed;
  } catch {
    return {
      outcome: "no_answer",
      summary: "Classification unavailable; needs manual review.",
      callbackAt: null,
    };
  }
}
