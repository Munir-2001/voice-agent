// Simulate an ElevenLabs post-call webhook for a demo ("Mia") call, so you can
// test the webhook → DB path end to end without placing a real call.
//
// It builds a synthetic post_call_transcription payload (including the analysis /
// data-collection results Mia captures), signs it with ELEVENLABS_WEBHOOK_SECRET
// exactly like ElevenLabs does (t=<unixsec>,v0=<hmac-sha256(secret,"t.body")>),
// and POSTs it to your /api/webhook.
//
// Usage:
//   node scripts/simulate-demo-webhook.mjs
//   node scripts/simulate-demo-webhook.mjs --url https://your-app/api/webhook --lead <lead_uuid> \
//        --outcome interested --inbound yes --speed "within an hour"
//
// Notes:
//   • Reads ELEVENLABS_WEBHOOK_SECRET from .env.local (or the process env).
//   • Pass --lead <uuid> to attach the call to a real lead (so the lead updates);
//     omit it to just verify the call row + analysis are stored.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local — rely on process.env */
  }
  return env;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const fileEnv = loadEnvLocal();
const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || fileEnv.ELEVENLABS_WEBHOOK_SECRET;
if (!secret) {
  console.error("Missing ELEVENLABS_WEBHOOK_SECRET (set it in .env.local).");
  process.exit(1);
}

const url = arg("url", "http://localhost:3000/api/webhook");
const leadId = arg("lead", null);
const outcome = arg("outcome", "interested");
const inbound = arg("inbound", "yes");
const speed = arg("speed", "usually a few hours");
const nowSec = Math.floor(Date.now() / 1000);

const payload = {
  type: "post_call_transcription",
  data: {
    conversation_id: `sim_${nowSec}_${Math.floor(Math.random() * 1e6)}`,
    agent_id: "agent_simulated",
    status: "done",
    metadata: {
      call_duration_secs: 78,
      start_time_unix_secs: nowSec - 80,
      phone_call: { external_number: "+14155550142", agent_number: "+14159432319" },
    },
    conversation_initiation_client_data: {
      dynamic_variables: {
        lead_name: "Jordan",
        company: "Acme Realty",
        ...(leadId ? { lead_id: leadId } : {}),
      },
    },
    transcript: [
      { role: "agent", message: "Hi, is this Jordan?", time_in_call_secs: 1 },
      { role: "user", message: "Yeah, who's this?", time_in_call_secs: 3 },
      { role: "agent", message: "I'm Mia, Munir's AI assistant — you just filled out the demo form.", time_in_call_secs: 5 },
      { role: "user", message: "Oh nice, that was fast. Yeah we get leads from our site.", time_in_call_secs: 9 },
    ],
    analysis: {
      call_successful: "success",
      transcript_summary: "Prospect experienced the instant callback and was interested.",
      data_collection_results: {
        outcome: { value: outcome },
        gets_inbound_leads: { value: inbound },
        current_callback_speed: { value: speed },
      },
    },
  },
};

const body = JSON.stringify(payload);
const sig = crypto.createHmac("sha256", secret).update(`${nowSec}.${body}`).digest("hex");
const header = `t=${nowSec},v0=${sig}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "elevenlabs-signature": header },
  body,
});
console.log("POST", url, "→", res.status);
console.log(await res.text());
