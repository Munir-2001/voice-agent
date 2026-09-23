// Enable ElevenLabs' native voicemail detection on the OUTBOUND agents.
//
// Why: on a cold call the agent was pitching over voicemail/IVR greetings (and
// over the ring) instead of recognising a machine. ElevenLabs ships a system
// tool `voicemail_detection` that the LLM fires the moment it hears an automated
// greeting — it then either leaves a short message or hangs up, gracefully.
//
// Per-agent policy (see VOICEMAIL_POLICY below):
//   • Cold outreach agents (financing "Ava", NextGen "Emma") → HANG UP, no
//     message. We do NOT want to blast an artificial-voice voicemail across a
//     cold list (compliance + brand + cost).
//   • Demo callback "Mia" → leave a short message: that person just asked to be
//     called and is expecting it, so a "we'll try you again" beat is friendly.
//
// The inbound "Mia — Reception" agent already has voicemail_detection (set by
// configure-mia-inbound.mjs) and is intentionally left untouched here.
//
// Idempotent: GETs each agent, merges the tool into the EXISTING built_in_tools
// (preserving end_call and everything else), then PATCHes. Safe to re-run.
//
// Usage:  node scripts/enable-voicemail-detection.mjs            (apply)
//         node scripts/enable-voicemail-detection.mjs --dry-run  (print, no write)
// Reads ELEVENLABS_API_KEY from .env.local (or the process env).

import { readFileSync } from "node:fs";

const env = {};
try {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
} catch {}
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("Missing ELEVENLABS_API_KEY"); process.exit(1); }

const DRY = process.argv.includes("--dry-run");
const H = { "xi-api-key": KEY, "Content-Type": "application/json" };
const BASE = "https://api.elevenlabs.io/v1/convai";

// agent_id → { label, voicemail_message }.  "" = detect then hang up (no message).
const VOICEMAIL_POLICY = {
  "agent_1301kyddnafefd8ak4zbvwnzjhfg": {
    label: "Ava — financing (cold outbound)",
    voicemail_message: "",
  },
  "agent_6301m0cxnf15ea7bayn51zebekmj": {
    label: "Emma — NextGen (cold outbound)",
    voicemail_message: "",
  },
  "agent_2301m2gf84c0etstqx9hkdg595qg": {
    label: "Mia — demo callback (outbound)",
    voicemail_message:
      "Hi, it's Mia — Munir's AI assistant, returning your request for a quick demo call. " +
      "I'll try you again shortly. Talk soon!",
  },
};

const voicemailTool = (voicemail_message) => ({
  type: "system", name: "voicemail_detection", description: "",
  response_timeout_secs: 20,
  disable_interruptions: false, interruption_mode: "allow", force_pre_tool_speech: false,
  pre_tool_speech: "auto", assignments: [], tool_call_sound: null,
  tool_call_sound_behavior: "auto", tool_error_handling_mode: "auto",
  params: { system_tool_type: "voicemail_detection", voicemail_message },
});

async function main() {
  for (const [agentId, policy] of Object.entries(VOICEMAIL_POLICY)) {
    const getRes = await fetch(`${BASE}/agents/${agentId}`, { headers: H });
    if (!getRes.ok) {
      console.error(`GET ${agentId} → ${getRes.status}: ${(await getRes.text()).slice(0, 160)}`);
      continue;
    }
    const agent = await getRes.json();
    const cc = agent.conversation_config || {};
    const prompt = (cc.agent && cc.agent.prompt) || {};
    const existingTools = prompt.built_in_tools || {};
    const hadIt = !!existingTools.voicemail_detection;

    // ElevenLabs deep-merges conversation_config on PATCH. Send a MINIMAL nested
    // payload — ONLY built_in_tools with the genuinely-enabled tools + our
    // voicemail_detection. Spreading the full prompt back silently drops the
    // change (a legacy `tools`/`tool_ids` field in the GET reconciles built_in_tools
    // and wipes voicemail_detection). PATCH returns 200 either way, so this bit
    // us; keep it minimal.
    const enabledTools = Object.fromEntries(
      Object.entries(existingTools).filter(([, v]) => v !== null && v !== undefined),
    );

    const merged = {
      conversation_config: {
        agent: {
          prompt: {
            built_in_tools: {
              ...enabledTools,
              voicemail_detection: voicemailTool(policy.voicemail_message),
            },
          },
        },
      },
    };

    const action = policy.voicemail_message ? `leave message` : `hang up (no message)`;
    console.log(`\n${policy.label}  [${agentId}]`);
    console.log(`  existing built-in tools: ${Object.keys(existingTools).join(", ") || "(none)"}`);
    console.log(`  voicemail_detection: ${hadIt ? "present → updating" : "MISSING → adding"} · policy: ${action}`);

    if (DRY) { console.log("  (dry-run — no write)"); continue; }

    const patch = await fetch(`${BASE}/agents/${agentId}`, {
      method: "PATCH", headers: H, body: JSON.stringify(merged),
    });
    console.log(`  PATCH → ${patch.status}`);
    if (!patch.ok) { console.error("  ", (await patch.text()).slice(0, 240)); continue; }

    // Verify the tool landed.
    const chk = await (await fetch(`${BASE}/agents/${agentId}`, { headers: H })).json();
    const vt = chk.conversation_config?.agent?.prompt?.built_in_tools?.voicemail_detection;
    console.log(`  verify: voicemail_detection ${vt ? "✓ enabled" : "✗ MISSING"}` +
      (vt ? ` · message="${(vt.params?.voicemail_message || "").slice(0, 40)}${vt.params?.voicemail_message ? "…" : "(none → hang up)"}"` : ""));
  }
  console.log(DRY ? "\nDry-run complete." : "\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
