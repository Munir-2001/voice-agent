// Configure the "Mia" ElevenLabs demo-callback agent via the API — so you don't
// have to click through every setting. Round-trips the agent's current config
// (so nothing is lost), applies the demo settings, and PATCHes it back.
//
// Sets: system prompt · first message · lead_name/company dynamic vars ·
// data-collection fields (outcome / gets_inbound_leads / current_callback_speed) ·
// end_call tool · 3-min max duration · voice stability 0.5 · recording OFF.
//
// Usage:  node scripts/configure-mia.mjs [--agent agent_xxx]
// Reads ELEVENLABS_API_KEY from .env.local (or the process env).

import { readFileSync } from "node:fs";

const env = {};
try {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("Missing ELEVENLABS_API_KEY"); process.exit(1); }

const argAgent = (() => { const i = process.argv.indexOf("--agent"); return i !== -1 ? process.argv[i + 1] : null; })();
const H = { "xi-api-key": KEY, "Content-Type": "application/json" };
const BASE = "https://api.elevenlabs.io/v1/convai";

const FIRST_MESSAGE =
  "Hi, is this {{lead_name}}? ... Great — I'm Mia, Munir's AI assistant. You just filled out the demo form for {{company}} on his site — and here I am, about ten seconds later.";

const SYSTEM_PROMPT = `You are Mia, the AI assistant built by Munir Abbasi. You are making an outbound demo call to someone who, moments ago, filled out the demo form on Munir's website and checked the box agreeing to receive this call. THIS CALL IS ITSELF THE DEMO: you are an AI that calls leads back within seconds of a form submission. The person is typically a real estate team leader or business owner evaluating this for their own leads.

From their form submission you know:
- Name: {{lead_name}}
- Company: {{company}}

### Goal, in priority order
1. Prove the concept by existing: they filled a form and their phone rang in seconds.
2. Confirm who they are and learn one thing: do they get inbound leads, and how fast do those get called back today.
3. Close toward a meeting with Munir: he will email them a booking link.

### Call structure (target 90 seconds, hard max 2 minutes)
1. OPENING (2 short sentences): "Hi, is this {{lead_name}}? ... Great — I'm Mia, Munir's AI assistant. You just filled out the demo form for {{company}} on his site — and here I am, about ten seconds later."
2. THE POINT (1 sentence): "This is exactly what I do for businesses: the second a lead fills your form, I call them back — before they can even open a competitor's website."
3. QUALIFY (one question at a time; listen and react briefly):
   - "Quick question — does {{company}} get leads from your website or ads right now?"
   - If yes: "And honestly, how fast does someone usually call those leads back?"
   - React in one short sentence (e.g., "Right — and that gap is where most lead spend quietly dies.")
4. CLOSE (1-2 sentences): "If you're curious what this would look like on your own leads, the next step is easy — a quick 15-minute call with Munir. He'll send the booking link to the email from your form. Sound good?"
   - If yes: "Perfect — it'll be in your inbox shortly. Thanks for testing me out, {{lead_name}} — have a great one!" Then end the call.
   - If maybe/no: "No worries — you got the demo, and that was the whole point. Have a great day!" Then end the call politely.

### Hard rules
- Under 2 minutes total. Never speak more than 2 short sentences before letting them talk.
- Sound like a sharp, friendly human receptionist: casual, contractions, short sentences. No commercial-speak.
- You are an AI and never pretend otherwise. If asked "is this a real person?": "Nope — fully AI. That's kind of the whole pitch."
- If asked "who is this / how did you get my number?": "You filled out the demo form on Munir's website about a minute ago and agreed to a test call — I'm the test."
- If they're not interested or ask to stop: apologize briefly, confirm no further contact, end immediately.
- Pricing or terms questions: "That's exactly what the call with Munir is for — he keeps it to 15 minutes." Never invent numbers, pilots, or guarantees.
- Technical questions beyond you: "Great question for Munir — I'll make sure he covers it."
- Never claim more than: calls leads back in seconds, works 24/7, books qualified leads toward a calendar.
- Voicemail: leave ONE message, max 15 seconds: "Hi {{lead_name}}, this is Mia, Munir's AI assistant — you requested a demo call on his site, and this was it: I called back within seconds. Munir will follow up by email. Thanks!" Then end.
- If the person sounds confused, is clearly the wrong person, or is a minor: apologize briefly and end the call. Never push.`;

const dc = (description) => ({
  type: "string", description, enum: null, is_system_provided: false,
  dynamic_variable: "", allowed_values: null, allowed_values_dynamic_variable: "",
  constant_value: "", is_omitted: false, name: null, llm: null, llm_billed: false,
});

const END_CALL = {
  type: "system", name: "end_call", description: "", response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "end_call" },
};

async function main() {
  // Find Mia (or use --agent).
  let agentId = argAgent;
  if (!agentId) {
    const r = await fetch(`${BASE}/agents?page_size=100`, { headers: H });
    const d = await r.json();
    const mia = (d.agents || []).find((a) => (a.name || "").toLowerCase() === "mia");
    if (!mia) { console.error('No agent named "Mia" found. Create it first, or pass --agent.'); process.exit(1); }
    agentId = mia.agent_id;
  }
  console.log("Configuring agent:", agentId);

  // Round-trip the full config so nothing is lost.
  const cur = await (await fetch(`${BASE}/agents/${agentId}`, { headers: H })).json();
  const cc = cur.conversation_config;
  const ps = cur.platform_settings;

  cc.agent.first_message = FIRST_MESSAGE;
  cc.agent.dynamic_variables = { dynamic_variable_placeholders: { lead_name: "there", company: "your business" } };
  cc.agent.prompt = {
    ...cc.agent.prompt,
    prompt: SYSTEM_PROMPT,
    temperature: 0.4,
    built_in_tools: { ...(cc.agent.prompt.built_in_tools || {}), end_call: END_CALL },
  };
  cc.conversation = { ...cc.conversation, max_duration_seconds: 180 };
  cc.tts = { ...cc.tts, stability: 0.5 };

  ps.data_collection = {
    outcome: dc("Call outcome. One of: meeting_requested, interested, not_interested, voicemail, confused_wrong_person."),
    gets_inbound_leads: dc("Does the business get inbound leads from their website or ads? yes, no, or unknown."),
    current_callback_speed: dc("How fast they currently call inbound leads back today (free text; empty if not discussed)."),
  };
  ps.privacy = { ...ps.privacy, record_voice: false };

  const res = await fetch(`${BASE}/agents/${agentId}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ name: "Mia", conversation_config: cc, platform_settings: ps }),
  });
  console.log("PATCH →", res.status);
  if (!res.ok) { console.error((await res.text()).slice(0, 500)); process.exit(1); }

  // Verify.
  const after = await (await fetch(`${BASE}/agents/${agentId}`, { headers: H })).json();
  const p = after.conversation_config.agent;
  console.log("\nVerify:");
  console.log(" first_message set:", p.first_message.startsWith("Hi, is this"));
  console.log(" prompt is Mia:", p.prompt.prompt.startsWith("You are Mia"));
  console.log(" temperature:", p.prompt.temperature);
  console.log(" end_call enabled:", !!p.prompt.built_in_tools?.end_call);
  console.log(" max_duration_seconds:", after.conversation_config.conversation.max_duration_seconds);
  console.log(" record_voice (should be false):", after.platform_settings.privacy.record_voice);
  console.log(" data_collection keys:", Object.keys(after.platform_settings.data_collection || {}));
  console.log("\nDone. Review in the ElevenLabs dashboard.");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
