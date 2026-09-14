import "server-only";
// Live inventory of the ElevenLabs account — the agents and phone numbers you've
// set up — so the campaign UI can offer them as pick-lists instead of asking you
// to paste raw agent_… / phnum_… ids. Read-only; cached briefly. Fails soft: on
// any error the caller falls back to manual id entry, so the form never breaks.

export interface EleAgent {
  id: string; // agent_…
  name: string;
}

export interface ElePhoneNumber {
  id: string; // phnum_…
  number: string; // E.164, e.g. +14159432319
  label: string; // human label from ElevenLabs, e.g. "SF USA Number"
  assignedAgentId: string | null; // which agent this number is bound to, if any
}

export interface EleInventory {
  agents: EleAgent[];
  phoneNumbers: ElePhoneNumber[];
  available: boolean; // did we successfully reach ElevenLabs?
}

const TTL = 60_000;
let cache: { at: number; data: EleInventory } | null = null;

export async function getElevenLabsInventory(force = false): Promise<EleInventory> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { agents: [], phoneNumbers: [], available: false };

  const now = Date.now();
  if (!force && cache && now - cache.at < TTL) return cache.data;

  try {
    const headers = { "xi-api-key": key };
    const [aRes, pRes] = await Promise.all([
      fetch("https://api.elevenlabs.io/v1/convai/agents?page_size=100", { headers }),
      fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", { headers }),
    ]);

    const agents: EleAgent[] = [];
    if (aRes.ok) {
      const d = (await aRes.json()) as { agents?: { agent_id: string; name?: string }[] };
      for (const a of d.agents ?? []) {
        agents.push({ id: a.agent_id, name: a.name?.trim() || a.agent_id });
      }
    } else {
      console.error("ElevenLabs agents list:", aRes.status);
    }

    const phoneNumbers: ElePhoneNumber[] = [];
    if (pRes.ok) {
      const raw = (await pRes.json()) as unknown;
      const list = (Array.isArray(raw) ? raw : (raw as { phone_numbers?: unknown[] }).phone_numbers ?? []) as {
        phone_number_id: string;
        phone_number?: string;
        label?: string;
        assigned_agent?: { agent_id?: string } | null;
      }[];
      for (const p of list) {
        phoneNumbers.push({
          id: p.phone_number_id,
          number: p.phone_number ?? "",
          label: p.label?.trim() || "",
          assignedAgentId: p.assigned_agent?.agent_id ?? null,
        });
      }
    } else {
      console.error("ElevenLabs phone-numbers list:", pRes.status);
    }

    // If BOTH calls failed we're effectively blind → fall back to manual entry.
    const available = aRes.ok || pRes.ok;
    const data: EleInventory = { agents, phoneNumbers, available };
    cache = { at: now, data };
    return data;
  } catch (err) {
    console.error(
      "getElevenLabsInventory:",
      err instanceof Error ? err.message : String(err),
    );
    return { agents: [], phoneNumbers: [], available: false };
  }
}
