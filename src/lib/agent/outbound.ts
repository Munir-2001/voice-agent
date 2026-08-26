import "server-only";
// Shared outbound-call logic used by BOTH the scheduler (dial-tick) and the
// test-call endpoint, so a test call exercises the exact same path as a real one.

import { researchLead } from "@/lib/agent/research";
import {
  playbookForIndustry,
  automationHookForIndustry,
} from "@/lib/agent/industry-playbooks";

export type CampaignGoal = "financing" | "ai_meeting";

export interface OutboundLead {
  id: string; // "" for a standalone test call not tied to a DB lead
  name: string;
  business_name: string;
  industry: string;
  email: string | null;
  phone: string; // E.164
}

// The caller-ID pool = ElevenLabs phone-number ids (phnum_…). The outbound API
// derives the caller ID from agent_phone_number_id, so rotation happens on these
// ids — NOT on the raw Twilio E.164 numbers (TWILIO_NUMBER_* are not read here).
//
// Sources are merged (and de-duplicated, order preserved) so any convention works:
//   • ELEVENLABS_PHONE_NUMBER_IDS  — comma-separated list (preferred)
//   • ELEVENLABS_PHONE_NUMBER_ID   — single primary id
//   • ELEVENLABS_PHONE_NUMBER_ID_2 / _ID_3 — extra ids for rotation
export function callerNumberIds(): string[] {
  const merged = [
    process.env.ELEVENLABS_PHONE_NUMBER_IDS,
    process.env.ELEVENLABS_PHONE_NUMBER_ID,
    process.env.ELEVENLABS_PHONE_NUMBER_ID_2,
    process.env.ELEVENLABS_PHONE_NUMBER_ID_3,
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(merged)];
}

// Area codes we should NEVER dial for cold outreach:
//   • Toll-free (800/888/877/866/855/844/833/822) — company IVRs/switchboards,
//     not a decision-maker's line, and often unroutable for outbound.
//   • US territories / Caribbean NANP that Twilio blocks under geo-permissions
//     (Puerto Rico 787/939, USVI 340, Guam 671, CNMI 670, Samoa 684) — these
//     hard-fail with "Account not authorized to call".
const UNCALLABLE_AREA_CODES = new Set([
  "800", "888", "877", "866", "855", "844", "833", "822",
  "787", "939", "340", "671", "670", "684",
]);

export function isUncallableUsNumber(phoneE164: string): boolean {
  const ac = areaCodeOf(phoneE164);
  return ac != null && UNCALLABLE_AREA_CODES.has(ac);
}

// Extract the US/NANP area code from an E.164 number: +1AAANXXXXXX → "AAA".
// Returns null for anything that isn't a 10-digit US number.
export function areaCodeOf(phoneE164: string): string | null {
  const digits = (phoneE164 || "").replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national.slice(0, 3) : null;
}

// Local-presence map: area code → ElevenLabs phnum id. Parsed from
// ELEVENLABS_PHONE_AREA_MAP="214:phnum_x,360:phnum_y". Lets the dialer call a
// lead from a number in THEIR area code (much higher pickup) and fall back to
// normal rotation when there's no match. Malformed entries are skipped.
export function parseAreaMap(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [area, id] = pair.split(":").map((s) => s.trim());
    if (/^\d{3}$/.test(area) && id) map[area] = id;
  }
  return map;
}

// Triggers an ElevenLabs outbound call. `agentPhoneNumberId` (phnum_…) sets the
// caller ID — there is no separate from_number on this endpoint. Throws with the
// response body on failure so setup problems are visible.
export async function placeOutboundCall(
  lead: OutboundLead,
  agentPhoneNumberId: string,
  agentId?: string, // per-campaign agent; falls back to the env default
  goal: CampaignGoal = "financing", // which campaign — drives the value hook
) {
  const { brief } = researchLead({
    name: lead.name,
    email: lead.email,
    businessName: lead.business_name,
    industry: lead.industry,
  });

  const dynamic_variables: Record<string, string> = {
    name: lead.name,
    // First name only, for a natural greeting ("is this Jordan?"). Falls back to
    // the full name, then a friendly default if the name is blank.
    first_name: lead.name.trim().split(/\s+/)[0] || lead.name || "there",
    business_name: lead.business_name,
    // `company` is an alias of business_name so prompts can use either {{company}}
    // or {{business_name}} (the NextGen AI prompt uses {{company}}).
    company: lead.business_name,
    industry: lead.industry,
    // A contact email the agent can leave with a gatekeeper who offers to pass a
    // message to the owner (NextGen reply-to, else the shared one). Empty is fine
    // — the prompt just skips reading it out.
    callback_email:
      process.env.NEXTGEN_REPLY_TO ?? process.env.EMAIL_REPLY_TO ?? "",
    // Value hook MUST match the campaign: the AI-meeting agent (Emma) gets an
    // automation hook, the financing agent gets the lending playbook line.
    // Sending the financing hook to Emma was the "walk-in cooler / Financing
    // helps you…" bug seen in the NextGen agent's dynamic variables.
    industry_hook:
      goal === "ai_meeting"
        ? automationHookForIndustry(lead.industry)
        : playbookForIndustry(lead.industry)?.valueHook ?? "",
    lead_brief: brief,
  };
  // Only tie the call to a lead when there is one (test calls omit this so the
  // webhook doesn't try to update a non-existent lead row).
  if (lead.id) dynamic_variables.lead_id = lead.id;

  const res = await fetch(
    "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        agent_id: agentId || process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: lead.phone,
        conversation_initiation_client_data: { dynamic_variables },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs outbound ${res.status}: ${detail.slice(0, 300)}`);
  }
  // ElevenLabs returns HTTP 200 even when the underlying Twilio call is rejected
  // (e.g. trial account, geo permissions) — the real status is in `success`.
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
  };
  if (data.success === false) {
    throw new Error(`Call rejected: ${data.message ?? "unknown error"}`);
  }
  return data;
}
