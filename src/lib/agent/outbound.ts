import "server-only";
// Shared outbound-call logic used by BOTH the scheduler (dial-tick) and the
// test-call endpoint, so a test call exercises the exact same path as a real one.

import { researchLead } from "@/lib/agent/research";
import { playbookForIndustry } from "@/lib/agent/industry-playbooks";

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

// Triggers an ElevenLabs outbound call. `agentPhoneNumberId` (phnum_…) sets the
// caller ID — there is no separate from_number on this endpoint. Throws with the
// response body on failure so setup problems are visible.
export async function placeOutboundCall(
  lead: OutboundLead,
  agentPhoneNumberId: string,
  agentId?: string, // per-campaign agent; falls back to the env default
) {
  const { brief } = researchLead({
    name: lead.name,
    email: lead.email,
    businessName: lead.business_name,
    industry: lead.industry,
  });

  const dynamic_variables: Record<string, string> = {
    name: lead.name,
    business_name: lead.business_name,
    // `company` is an alias of business_name so prompts can use either {{company}}
    // or {{business_name}} (the NextGen AI prompt uses {{company}}).
    company: lead.business_name,
    industry: lead.industry,
    industry_hook: playbookForIndustry(lead.industry)?.valueHook ?? "",
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
