// Configure the "Mia" ElevenLabs demo-callback agent via the API — so you don't
// have to click through every setting. Round-trips the agent's current config
// (so nothing is lost), applies the demo settings, and PATCHes it back.
//
// Sets: system prompt · first message · lead_name/company dynamic vars ·
// data-collection fields (outcome / gets_inbound_leads / current_callback_speed) ·
// end_call tool · 90-second max duration · voice stability 0.5 · recording OFF.

// Cost control for the public demo. This is the ElevenLabs backstop that
// force-ends the call. Mia is separately prompted to aim for ~75s and deliver a
// "book a meeting" wrap around ~80s, so she lands the CTA gracefully BEFORE this
// hard cut rather than getting guillotined mid-sentence.
const HARD_CAP_SECONDS = 90;
// Auto-hang-up after this many seconds of total silence (backstop for a missed
// end_call after a goodbye). ElevenLabs enforces a MINIMUM of 10s here (values
// below 10 are rejected with a 400), so 10 is as snappy as this lever allows.
// It sits above the 7s turn_timeout, so a normal thinking pause makes Mia
// re-prompt (breaking silence) before this fires — it only triggers on a
// genuinely dead line after she's done.
const SILENCE_END_SECONDS = 10;
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

// FIRST MESSAGE = the greeting ONLY. In ElevenLabs the entire first_message is
// spoken as one uninterrupted turn — a "..." is just a short TTS pause, NOT a
// "wait for the human" boundary. If the intro lives here too, Mia asks "is this
// you?" and immediately steamrolls into the pitch without hearing the answer.
// So the first_message is a single question that yields the turn; the rest of
// the opening is delivered by the LLM (see prompt OPENING) AFTER they reply.
const FIRST_MESSAGE = "Hi — is this {{lead_name}}?";

const SYSTEM_PROMPT = `You are Mia, the AI assistant built by Munir Abbasi. You are making an outbound demo call to someone who, moments ago, filled out the demo form on Munir's website and checked the box agreeing to receive this call. THIS CALL IS ITSELF THE DEMO: you are an AI that calls leads back within seconds of a form submission. The person is typically a real estate team leader or business owner evaluating this for their own leads.

From their form submission you know:
- Name: {{lead_name}}
- Company: {{company}}

### Goal, in priority order
1. Prove the concept by existing: they filled a form and their phone rang in seconds.
2. Confirm who they are and learn one thing: do they get inbound leads, and how fast do those get called back today.
3. Close toward a meeting with Munir: he will email them a booking link.

### Call structure (target ~75 seconds, HARD max 90 seconds)
1. OPENING — TWO SEPARATE TURNS. Your FIRST turn is ONLY the greeting question "Hi — is this {{lead_name}}?" (this is already sent as the first message). Then STOP and WAIT — do not say anything else until they respond. Only AFTER they answer, deliver your intro as your next turn: "Great — I'm Mia, Munir's AI assistant. You just filled out the demo form for {{company}} on his site — and here I am, about ten seconds later." If they say it's the wrong person or ask who's calling, adapt instead of pushing the scripted intro.
2. THE POINT + INVITE (2 short sentences, then STOP and let them talk): "This is exactly what I do for businesses: the second a lead fills your form, I call them back — before they can even open a competitor's website. And hey — feel free to ask me anything while you've got me; that's kind of the point of a demo." Then wait — actually give them room to ask.
   - If they ask something: answer in ONE short, honest sentence, then bridge back with a question of your own (see QUALIFY). Keep it tight — you're on a 90-second clock.
   - If they have nothing to ask ("no", silence): "All good — let me ask YOU one then." and move to QUALIFY.
3. QUALIFY (one question at a time; listen and react briefly):
   - "Quick question — does {{company}} get leads from your website or ads right now?"
   - If yes: "And honestly, how fast does someone usually call those leads back?"
   - React in one short sentence (e.g., "Right — and that gap is where most lead spend quietly dies.")
4. CLOSE (1-2 sentences): "If you're curious what this would look like on your own leads, the next step is easy — a quick 15-minute call with Munir. He'll send the booking link to the email from your form. Sound good?"
   - If yes: "Perfect — it'll be in your inbox shortly. Thanks for testing me out, {{lead_name}} — have a great one!" Then immediately call the end_call tool to hang up.
   - If maybe/no: "No worries — you got the demo, and that was the whole point. Have a great day!" Then immediately call the end_call tool to hang up.

### TIME LIMIT — this is a short public demo (about 90 seconds, hard cap)
- These demo calls are strictly time-limited. Keep the whole call tight — aim to be done in about 75 seconds. Don't over-explain; move quickly through the structure.
- When you sense the call is running long (roughly a minute and a half in), STOP whatever you're on and give the wrap directly: "I have to keep these demos short — if you'd like to see this on your own leads, the best next step is to book a quick meeting with Munir. Just head back to the form and request a meeting and he'll take it from there. Thanks {{lead_name}}!" Then immediately call the end_call tool to hang up.
- Never let the call drift past the limit hoping to say more — always deliver the book-a-meeting wrap and end cleanly rather than getting cut off.

### Hard rules
- ENDING THE CALL IS A TOOL CALL, NOT WORDS. Every time you finish — a goodbye, the time-limit wrap, a voicemail, an opt-out, a wrong number — you MUST invoke the end_call tool in that SAME turn. Speaking your closing line does not hang up the phone. If you say goodbye and don't call end_call, the line stays open and burns money. Never end a turn on a closing line without calling end_call.
- After your opening greeting ("is this {{lead_name}}?"), you MUST wait for their reply before saying anything. Never answer your own question or continue into the intro until you have actually heard them speak.
- HARD 90-second limit. Aim to finish in ~75 seconds and ALWAYS end with the book-a-meeting wrap (see TIME LIMIT). Never speak more than 2 short sentences before letting them talk.
- Sound like a sharp, friendly human receptionist: casual, contractions, short sentences. No commercial-speak.
- You are an AI and never pretend otherwise. If asked "is this a real person?": "Nope — fully AI. That's kind of the whole pitch."
- If asked "who is this / how did you get my number?": "You filled out the demo form on Munir's website about a minute ago and agreed to a test call — I'm the test."
- If they're not interested or ask to stop: apologize briefly, confirm no further contact, end immediately.
- Pricing or terms questions: "That's exactly what the call with Munir is for — he keeps it to 15 minutes." Never invent numbers, pilots, or guarantees.
- Technical questions beyond you: "Great question for Munir — I'll make sure he covers it."
- Never claim more than: calls leads back in seconds, works 24/7, books qualified leads toward a calendar.
- Voicemail / answering machine / automated system: DO NOT leave a message and DO NOT keep talking. The moment you detect a voicemail greeting, an "leave a message after the tone" prompt, or any automated/recorded system, END THE CALL IMMEDIATELY (use end_call). Leaving a message wastes call time and money — never do it.
- If the person sounds confused, is clearly the wrong person, or is a minor: apologize briefly and immediately call the end_call tool to hang up. Never push.`;

const dc = (description) => ({
  type: "string", description, enum: null, is_system_provided: false,
  dynamic_variable: "", allowed_values: null, allowed_values_dynamic_variable: "",
  constant_value: "", is_omitted: false, name: null, llm: null, llm_billed: false,
});

const END_CALL = {
  // NOTE: ElevenLabs MANAGES the description for system tools — it ignores any
  // value we send here and forces it back to "". So the reliable lever for "say
  // goodbye AND actually hang up" is the system prompt (the "ENDING THE CALL IS A
  // TOOL CALL" hard rule), not this field. Left empty on purpose.
  type: "system", name: "end_call", description: "",
  response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "end_call" },
};

// Voicemail detection → HANG UP, no message. An empty voicemail_message means the
// agent ends the call the moment it detects a voicemail/answering machine instead
// of recording anything (which wastes call time + ElevenLabs/Twilio credits).
const VOICEMAIL_DETECTION = {
  type: "system", name: "voicemail_detection", description: "", response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "voicemail_detection", voicemail_message: "" },
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
    built_in_tools: { ...(cc.agent.prompt.built_in_tools || {}), end_call: END_CALL, voicemail_detection: VOICEMAIL_DETECTION },
  };
  cc.conversation = { ...cc.conversation, max_duration_seconds: HARD_CAP_SECONDS };
  cc.tts = { ...cc.tts, stability: 0.5 };
  // Safety net for "said goodbye but didn't hang up": end the call after this many
  // seconds of TOTAL silence. Set well above the 7s turn_timeout so a prospect's
  // normal thinking pause (which makes Mia re-prompt, breaking silence) never
  // triggers it — only a genuinely dead line after a close does. The system
  // prompt's "ENDING THE CALL IS A TOOL CALL" rule is the primary fix; this + the
  // 90s hard cap bound the worst case if the model still forgets the tool.
  cc.turn = { ...cc.turn, silence_end_call_timeout: SILENCE_END_SECONDS };

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
  console.log(" first_message (greeting only):", JSON.stringify(p.first_message));
  console.log(" prompt is Mia:", p.prompt.prompt.startsWith("You are Mia"));
  console.log(" temperature:", p.prompt.temperature);
  console.log(" end_call enabled:", !!p.prompt.built_in_tools?.end_call);
  console.log(" max_duration_seconds:", after.conversation_config.conversation.max_duration_seconds);
  console.log(" record_voice (should be false):", after.platform_settings.privacy.record_voice);
  console.log(" data_collection keys:", Object.keys(after.platform_settings.data_collection || {}));
  console.log("\nDone. Review in the ElevenLabs dashboard.");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
