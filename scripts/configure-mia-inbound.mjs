// Configure "Mia — Reception", the INBOUND agent that answers when someone calls
// one of the Mia numbers directly (as opposed to the outbound demo-callback Mia).
//
// It clones the outbound Mia agent's voice / TTS / LLM / ASR settings (so both
// sound identical) but swaps in an inbound receptionist first-message + prompt,
// its own data-collection fields (outcome / caller_name / caller_email /
// business_name — used by the webhook to create a lead + send the follow-up),
// and then assigns itself as the INBOUND agent on both phone numbers.
//
// Why a SEPARATE agent (not reuse outbound Mia): the openings are fundamentally
// different ("is this Jordan? — you just filled the form" vs "thanks for calling,
// how can I help?"). One agent can't own both first_messages without per-call
// prompt overrides on the shared outbound path (also used by the financing/NextGen
// dialers) — riskier than a clean, isolated inbound persona. Outbound Mia is left
// untouched. Both agents share the same voice, so callers still hear "Mia".
//
// Usage:  node scripts/configure-mia-inbound.mjs
//         node scripts/configure-mia-inbound.mjs --source agent_xxx   (clone from)
//         node scripts/configure-mia-inbound.mjs --no-assign          (skip number assignment)
// Reads ELEVENLABS_API_KEY from .env.local (or the process env).
//
// After it prints the reception agent id, add it to .env.local AND Vercel:
//   ELEVENLABS_INBOUND_AGENT_ID=agent_xxx
// The webhook uses that id to recognise inbound calls when direction is absent.

import { readFileSync } from "node:fs";

// Inbound callers dialed in on purpose, so give a little more room than the 90s
// outbound demo — but still cap it so a forgotten-off-hook line can't run forever.
const HARD_CAP_SECONDS = 300;
// ElevenLabs enforces a 10s minimum on silence auto-hangup (values < 10 → 400).
const SILENCE_END_SECONDS = 10;
// The two Mia Twilio numbers to point inbound at. Kept in sync with the outbound
// caller pool (campaign_settings.caller_number_ids for the Mia workspace).
const PHONE_NUMBER_IDS = [
  "phnum_8001kydxwp45ex3t0ct1spr86j0a", // +12143937867 Dallas
  "phnum_7801kydxy71xes6bxm14ps5b5c4d", // +14159432319 SF
];
const RECEPTION_NAME = "Mia — Reception";

const env = {};
try {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
} catch {}
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("Missing ELEVENLABS_API_KEY"); process.exit(1); }

const argSource = (() => { const i = process.argv.indexOf("--source"); return i !== -1 ? process.argv[i + 1] : null; })();
const noAssign = process.argv.includes("--no-assign");
const H = { "xi-api-key": KEY, "Content-Type": "application/json" };
const BASE = "https://api.elevenlabs.io/v1/convai";

// The inbound greeting — a single warm question that yields the turn immediately.
const FIRST_MESSAGE =
  "Hey, thanks for calling! This is Mia — Munir's AI assistant. How can I help you today?";

const SYSTEM_PROMPT = `You are Mia, the AI receptionist built by Munir Abbasi. Someone has just CALLED IN to one of Munir's numbers. You do not know who they are yet. You are itself a live demo of what Munir builds: an AI that answers and handles calls 24/7. Sound like a sharp, warm human receptionist — casual, contractions, short sentences. Never commercial-speak.

### What Munir does (say plainly, only as needed)
Munir builds AI phone agents for businesses — an AI that calls new leads back within seconds of them filling a form, answers inbound calls like this one, works 24/7, and books qualified prospects onto his calendar. You (Mia) ARE that AI, so this call proves it.

### Goal, in priority order
1. Find out why they're calling and who they are (name + their business).
2. Answer their questions briefly and honestly.
3. If there's any interest, get them booked with Munir: offer a quick 15-minute call, and capture their EMAIL so Munir can send a booking link. Confirm the email back to them clearly.

### Call flow
1. GREETING — already sent ("thanks for calling… how can I help?"). WAIT and actually listen to why they're calling before saying anything else.
2. UNDERSTAND — react to what they said in one short sentence. If it's not clear, ask: "Sure — is this about setting up an AI like me for your own business, or something else?"
3. QUALIFY lightly (one question at a time): "What's your name, by the way?" and "And what kind of business are you running?" Keep it natural, not an interrogation.
4. CLOSE — "The best next step is a quick 15 minutes with Munir — he'll show you exactly what this would look like for your business. What's the best email for him to send the booking link to?" Read the email back to confirm you got it right.
   - If they book/share email: "Perfect — Munir will send that over shortly. Thanks for calling, and have a great one!" Then immediately call the end_call tool.
   - If not interested: "No worries at all — thanks for calling, and reach out any time. Have a great day!" Then immediately call the end_call tool.

### Hard rules
- ENDING THE CALL IS A TOOL CALL, NOT WORDS. Every time you finish — a goodbye, a wrong number, an opt-out, a voicemail — you MUST invoke the end_call tool in that SAME turn. Speaking a closing line does NOT hang up the phone. If you say goodbye and don't call end_call, the line stays open and burns money.
- After the greeting, WAIT for them to speak. Never answer your own question or launch into a pitch before you've heard them.
- Keep it tight — never more than 2 short sentences before letting them talk.
- You are an AI and never pretend otherwise. If asked "is this a real person?": "Nope — fully AI. That's kind of the whole point — I'm the demo."
- Pricing / terms / anything technical beyond the basics: "That's exactly what the call with Munir is for — he keeps it to 15 minutes." Never invent numbers, pilots, or guarantees.
- Never claim more than: answers and calls leads back in seconds, works 24/7, books qualified leads onto a calendar.
- If they want to leave a message: capture their name, business, email, and reason, confirm it back, then reassure them Munir will follow up — and end with the end_call tool.
- Voicemail / automated system on the other end (rare on inbound): do NOT leave a message. End the call immediately with the end_call tool.
- If it's a wrong number, a robocall, or someone confused: apologize briefly and immediately call the end_call tool. Never push.`;

// Data-collection fields the post-call webhook reads to create the inbound lead
// and decide whether to send the follow-up email. `outcome` mirrors the outbound
// demo values so the same email/reporting logic works unchanged.
const dc = (description) => ({
  type: "string", description, enum: null, is_system_provided: false,
  dynamic_variable: "", allowed_values: null, allowed_values_dynamic_variable: "",
  constant_value: "", is_omitted: false, name: null, llm: null, llm_billed: false,
});
const DATA_COLLECTION = {
  outcome: dc("Call outcome. One of: meeting_requested, interested, not_interested, voicemail, wrong_number."),
  caller_name: dc("The caller's name, if they gave it. Empty string if unknown."),
  caller_email: dc("The caller's email address, if they gave one for the booking link. Empty string if none."),
  business_name: dc("The name/type of the caller's business, if mentioned. Empty string if unknown."),
};

const END_CALL = {
  // ElevenLabs MANAGES the description for system tools (forces it to ""), so the
  // reliable lever is the prompt hard-rule above, not this field.
  type: "system", name: "end_call", description: "",
  response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "end_call" },
};
const VOICEMAIL_DETECTION = {
  type: "system", name: "voicemail_detection", description: "", response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "voicemail_detection", voicemail_message: "" },
};

async function findByName(name) {
  const r = await fetch(`${BASE}/agents?page_size=100`, { headers: H });
  const d = await r.json();
  return (d.agents || []).find((a) => (a.name || "").toLowerCase() === name.toLowerCase()) || null;
}
async function findSourceMia() {
  if (argSource) return argSource;
  const mia = await findByName("mia");
  if (!mia) { console.error('No source agent named "Mia" found. Pass --source agent_xxx.'); process.exit(1); }
  return mia.agent_id;
}

// Apply the inbound persona onto a cloned conversation_config (from outbound Mia),
// preserving voice/TTS/LLM/ASR and only overriding the call-shaping bits.
function applyInbound(cc) {
  cc.agent = cc.agent || {};
  cc.agent.first_message = FIRST_MESSAGE;
  cc.agent.dynamic_variables = { dynamic_variable_placeholders: {} };
  cc.agent.prompt = {
    ...(cc.agent.prompt || {}),
    prompt: SYSTEM_PROMPT,
    temperature: 0.4,
    built_in_tools: {
      ...((cc.agent.prompt || {}).built_in_tools || {}),
      end_call: END_CALL,
      voicemail_detection: VOICEMAIL_DETECTION,
    },
  };
  cc.conversation = { ...(cc.conversation || {}), max_duration_seconds: HARD_CAP_SECONDS };
  cc.turn = { ...(cc.turn || {}), silence_end_call_timeout: SILENCE_END_SECONDS };
  return cc;
}

async function main() {
  const sourceId = await findSourceMia();
  console.log("Source (outbound Mia):", sourceId);
  const src = await (await fetch(`${BASE}/agents/${sourceId}`, { headers: H })).json();
  const cc = applyInbound(src.conversation_config || {});
  const platform_settings = {
    ...(src.platform_settings || {}),
    data_collection: DATA_COLLECTION,
  };

  // Reuse the reception agent if it already exists (idempotent re-runs), else create.
  let agentId;
  const existing = await findByName(RECEPTION_NAME);
  if (existing) {
    agentId = existing.agent_id;
    console.log("Updating existing reception agent:", agentId);
    const r = await fetch(`${BASE}/agents/${agentId}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ conversation_config: cc, platform_settings }),
    });
    console.log("PATCH agent →", r.status);
    if (!r.ok) { console.error(await r.text()); process.exit(1); }
  } else {
    console.log("Creating reception agent:", RECEPTION_NAME);
    const r = await fetch(`${BASE}/agents/create`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: RECEPTION_NAME, conversation_config: cc, platform_settings }),
    });
    const body = await r.json().catch(() => ({}));
    console.log("CREATE agent →", r.status);
    if (!r.ok) { console.error(JSON.stringify(body)); process.exit(1); }
    agentId = body.agent_id;
  }
  console.log("Reception agent id:", agentId);

  // Point both numbers' INBOUND agent at reception. This only changes what answers
  // an inbound call — outbound calls specify their own agent_id, so demo Mia and the
  // financing/NextGen dialers are unaffected.
  if (!noAssign) {
    for (const pn of PHONE_NUMBER_IDS) {
      const r = await fetch(`${BASE}/phone-numbers/${pn}`, {
        method: "PATCH", headers: H,
        body: JSON.stringify({ agent_id: agentId }),
      });
      console.log(`assign ${pn} → inbound ${agentId}:`, r.status);
      if (!r.ok) console.error("  ", (await r.text()).slice(0, 200));
    }
  }

  // Verify.
  console.log("\nVerify:");
  const chk = await (await fetch(`${BASE}/agents/${agentId}`, { headers: H })).json();
  const p = chk.conversation_config;
  console.log(" name:", chk.name);
  console.log(" first_message:", JSON.stringify(p.agent.first_message).slice(0, 90));
  console.log(" is reception prompt:", /receptionist/i.test(p.agent.prompt.prompt || ""));
  console.log(" max_duration_seconds:", p.conversation?.max_duration_seconds);
  console.log(" silence_end_call_timeout:", p.turn?.silence_end_call_timeout);
  console.log(" data_collection keys:", Object.keys(chk.platform_settings?.data_collection || {}));
  console.log(" voice_id (shared with Mia):", p.tts?.voice_id);
  console.log(`\nDone. Add to .env.local + Vercel:  ELEVENLABS_INBOUND_AGENT_ID=${agentId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
