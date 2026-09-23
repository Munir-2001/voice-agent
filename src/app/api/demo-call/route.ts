import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164International, areaCode } from "@/lib/phone";
import { timezoneForAreaCode } from "@/lib/timezone";
import { cleanName, cleanEmail } from "@/lib/clean";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";
import { checkTwilioBalance } from "@/lib/agent/billing-guard";
import { autoEnrollInboundLead } from "@/lib/outreach/engine";
import {
  demoMaxConcurrent,
  demoMaxQueue,
  demoDailyCap,
  pickCallerNumber,
  countInFlight,
  countQueued,
  countPlacedToday,
  queuePosition,
  reclaimStaleCalling,
} from "@/lib/agent/demo-queue";

// Instant demo-callback ("Mia"). A public form submit → the AI calls back within
// seconds. THE CALL IS THE DEMO. Because this dials immediately (no human review),
// every guardrail matters:
//   • consent must be explicitly true · honeypot must be empty
//   • phone normalized to E.164
//   • rate limits: 1 call/phone/24h · N submits/IP/hour · global daily cap
//   • Twilio balance gate (never dial a drained/suspended account)
//   • DRY-RUN by DEFAULT — nothing dials unless DEMO_LIVE is explicitly enabled
//
// It reuses the existing call path: it creates a lead (the "initiated" record) and
// calls placeOutboundCall; the post-call webhook writes the calls row + analysis.
export const dynamic = "force-dynamic";

const DEFAULTS = { perIpHour: 3 };

// Countries we'll place a demo call to (ISO-3166 alpha-2). Keeps Twilio geo cost +
// fraud exposure bounded. Override via DEMO_ALLOWED_COUNTRIES (comma-separated).
// NOTE: each country here must ALSO be enabled in Twilio Voice Geo Permissions.
// US, UK (+ the crown dependencies that share +44: Isle of Man, Jersey, Guernsey),
// Italy, Australia. libphonenumber resolves the exact country from the number.
const DEFAULT_ALLOWED_COUNTRIES = ["US", "GB", "IM", "JE", "GG", "IT", "AU"] as const;
function allowedCountries(): readonly string[] {
  const raw = (process.env.DEMO_ALLOWED_COUNTRIES ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return raw.length > 0 ? raw : DEFAULT_ALLOWED_COUNTRIES;
}

function isLive(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.DEMO_LIVE ?? "");
}
function miaWorkspaceId(): number | null {
  const v = Number(process.env.MIA_WORKSPACE_ID);
  return Number.isInteger(v) && v > 0 ? v : null;
}
function perIpHour(): number {
  const v = Number(process.env.DEMO_MAX_PER_IP_HOUR);
  return Number.isInteger(v) && v > 0 ? v : DEFAULTS.perIpHour;
}

// CORS so the form can post directly if ever needed (normally the portfolio
// forwards server-side). No credentials are used, so reflecting the origin is safe.
function corsHeaders(request: Request): Record<string, string> {
  const configured = (process.env.PORTFOLIO_ORIGIN ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("origin") ?? "";
  const allow = configured.length === 0 ? "*" : configured.includes(origin) ? origin : configured[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

const STR = z.preprocess((v) => (v == null ? "" : String(v).slice(0, 500)), z.string());
const Body = z.object({
  // Accept lead_name or name; company or businessName.
  lead_name: STR.optional(),
  name: STR.optional(),
  email: STR.optional(),
  phone: STR,
  company: STR.optional(),
  businessName: STR.optional(),
  consent: z.boolean().optional(),
  hp: STR.optional(), // honeypot
});

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  const json = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: cors });

  const ip = clientIp(request);
  const rl = rateLimit(`demo-ip:${ip}`, perIpHour(), 60 * 60_000);
  if (!rl.ok) return json({ error: "Too many requests — try again later" }, 429);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const b = parsed.data;

  // Honeypot → silently succeed (store nothing).
  if (b.hp && b.hp.trim()) return json({ ok: true }, 200);

  // Consent is mandatory for an outbound call.
  if (b.consent !== true) return json({ error: "Consent is required to place the call" }, 422);

  const phone = toE164International(b.phone ?? "", allowedCountries());
  if (!phone) return json({ error: "We can only place a demo call to US, UK, Italy, or Australia numbers right now." }, 422);
  const name = cleanName(b.lead_name || b.name || "");
  if (!name) return json({ error: "Please enter your name" }, 422);
  const company = cleanName(b.company || b.businessName || "");
  const email = cleanEmail(b.email ?? "");

  const workspaceId = miaWorkspaceId();
  if (workspaceId === null) {
    console.error("demo-call: MIA_WORKSPACE_ID not configured");
    return json({ error: "Demo calling isn't configured yet" }, 503);
  }

  const supabase = createServiceClient();

  // The Mia campaign MUST have its own agent + a caller number, or the call would
  // answer as the wrong (env-default) agent. Refuse rather than cross-wire.
  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("elevenlabs_agent_id, caller_number_ids")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const agentId = settings?.elevenlabs_agent_id as string | undefined;
  if (!agentId) {
    console.error("demo-call: Mia workspace has no elevenlabs_agent_id");
    return json({ error: "Demo agent isn't configured yet" }, 503);
  }
  const numberIds = settings?.caller_number_ids
    ? String(settings.caller_number_ids).split(",").map((s: string) => s.trim()).filter(Boolean)
    : callerNumberIds();
  if (numberIds.length === 0) {
    console.error("demo-call: no caller number configured for Mia");
    return json({ error: "Demo calling isn't configured yet" }, 503);
  }

  const now = new Date();

  // Abuse guard — one demo call per number, checked in the DB BEFORE we dispatch to
  // ElevenLabs. DEMO_RECALL_HOURS: unset/0 = a number can NEVER be called again
  // (one demo per number, period); >0 = allow another after that many hours. A
  // number currently mid-call ('calling') is always blocked (stops double-dispatch
  // from a double click or the two entry points firing together).
  const recallHours = Number(process.env.DEMO_RECALL_HOURS) || 0;
  // Allowlisted numbers (the owner's own test lines) can be re-demoed with no
  // one-per-number limit. Defaults to Munir's number; extend via DEMO_TEST_NUMBERS
  // (comma-separated E.164). The mid-call double-dispatch guard + daily cap still apply.
  const bypassNumbers = new Set(
    ["+393773929050", ...(process.env.DEMO_TEST_NUMBERS ?? "").split(",")]
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const bypassLimit = bypassNumbers.has(phone);
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id, last_called_at, status")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .maybeSingle();
  if (existingLead) {
    // Already waiting in line → don't create a second attempt; reassure them.
    if (existingLead.status === "queued") {
      return json(
        { error: "You're already in line — sit tight, your phone will ring the moment a line frees up.", queued: true },
        429,
      );
    }
    const lastMs = existingLead.last_called_at
      ? new Date(existingLead.last_called_at as string).getTime()
      : 0;
    // A number mid-call is ALWAYS blocked (stops double-dispatch), even allowlisted.
    // The "one free demo per number" time limit is skipped for allowlisted numbers.
    const alreadyCalled =
      existingLead.status === "calling" ||
      (!bypassLimit &&
        lastMs > 0 &&
        (recallHours <= 0 || Date.now() - lastMs < recallHours * 3600_000));
    if (alreadyCalled) {
      return json(
        { error: "Sorry — you've already used your one free demo call on this number. Want to see more? Book a quick call with Munir and he'll walk you through it." },
        429,
      );
    }
  }

  // Global daily cap: total demo calls PLACED today (dialed, not queued). Hard
  // cost ceiling — even the queue won't push past it.
  await reclaimStaleCalling(supabase, workspaceId);
  if ((await countPlacedToday(supabase, workspaceId)) >= demoDailyCap()) {
    return json({ error: "Daily demo limit reached — please try again tomorrow" }, 429);
  }

  // Concurrency + smart queue. The demo's promise is an INSTANT call, so we dial
  // right away whenever a line is free and only queue the overflow. A slot frees
  // when a call ends (webhook drains the queue) or when the next person submits.
  const cap = demoMaxConcurrent(numberIds.length);
  const inFlight = await countInFlight(supabase, workspaceId);
  const dialNow = inFlight < cap;

  // Overflow → queue, but bound its length so it can't grow forever. Past the cap,
  // steer them to a meeting instead of an open-ended wait.
  if (!dialNow) {
    if ((await countQueued(supabase, workspaceId)) >= demoMaxQueue()) {
      return json(
        {
          error:
            "We're swamped with free demo calls right now — the fastest way in is a quick meeting with Munir. He'll show you live.",
          swamped: true,
        },
        429,
      );
    }
  }

  // Billing safeguard only gates an immediate dial; the drainer re-checks balance
  // before dialing a queued lead, so a temporary dip just holds people in line.
  if (dialNow) {
    const bal = await checkTwilioBalance();
    if (bal.stop) {
      console.error(`demo-call: blocked by balance gate — ${bal.reason}`);
      return json({ error: "Demo calling is temporarily unavailable" }, 503);
    }
  }

  const live = isLive();

  // Status reflects the decision: dial-now (live) → 'calling'; overflow → 'queued';
  // dry-run → 'pending'. Only a dialed lead gets last_called_at, so queued leads
  // don't count toward the daily cap until they're actually dialed.
  const willDialNow = live && dialNow;
  const status = !live ? "pending" : dialNow ? "calling" : "queued";
  const leadPatch = {
    workspace_id: workspaceId,
    name,
    business_name: company,
    phone,
    email,
    timezone: timezoneForAreaCode(areaCode(phone)),
    consent_source: "demo_form",
    status,
    ...(willDialNow ? { last_called_at: now.toISOString() } : {}),
  };

  // We need created_at back for the queue position message (FIFO ordering key).
  let leadId = existingLead?.id as string | undefined;
  let createdAt: string | undefined;
  if (leadId) {
    const { data: upd } = await supabase
      .from("leads").update(leadPatch).eq("id", leadId).eq("workspace_id", workspaceId)
      .select("created_at").maybeSingle();
    createdAt = upd?.created_at as string | undefined;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("leads").insert({ ...leadPatch, attempts: 0 }).select("id, created_at").single();
    if (insErr || !inserted) {
      console.error("demo-call: lead insert failed:", insErr?.message);
      return json({ error: "Could not start the demo" }, 500);
    }
    leadId = inserted.id as string;
    createdAt = inserted.created_at as string | undefined;
  }

  // Warm inbound nurture: auto-enroll this signup into whichever campaign is
  // flagged "auto-enroll inbound" in the UI (no env config). Best-effort +
  // idempotent — a nurture hiccup must never break the demo flow, and a repeat
  // submit won't double-enroll.
  if (email && leadId) {
    try {
      await autoEnrollInboundLead(workspaceId, leadId);
    } catch (err) {
      console.error(
        "demo-call: nurture enroll failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!live) {
    console.log(
      `demo-call[DRY-RUN]: would ${dialNow ? "call" : "QUEUE"} ${phone} (${name}${company ? ", " + company : ""}) ` +
        `via agent ${agentId} / ${numberIds[0]}. Set DEMO_LIVE=1 to dial.`,
    );
    return json({ ok: true, dryRun: true, wouldQueue: !dialNow }, 200);
  }

  // Overflow → queued. Tell them to sit tight; a freed line (webhook drain or the
  // next submit) picks them up automatically. No call is placed here.
  if (!dialNow) {
    const position = createdAt
      ? await queuePosition(supabase, workspaceId, createdAt)
      : null;
    return json({ ok: true, queued: true, position }, 202);
  }

  // A free line — dial immediately, on the caller number for this slot.
  const callerNumberId = pickCallerNumber(numberIds, inFlight);
  try {
    await placeOutboundCall(
      { id: leadId, name, business_name: company || "your business", industry: "", email, phone },
      callerNumberId,
      agentId,
      "financing", // keep the current default (industry_hook stays empty for demos)
      workspaceId, // record the demo dial in `calls` too
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("demo-call: placeOutboundCall failed:", message);
    // Billing-safe: a failed hand-off may STILL have created (and been billed for)
    // an ElevenLabs conversation, so we DO NOT free the slot. Mark it 'failed' but
    // KEEP last_called_at — the attempt then counts toward the daily cap and the
    // number won't be re-dialed until DEMO_RECALL_HOURS elapses (0 = never). This
    // stops an unreachable/failing number from being retried repeatedly on our dime.
    await supabase.from("leads").update({ status: "failed" }).eq("id", leadId).eq("workspace_id", workspaceId);
    return json({ error: "Could not connect the call — please try again later" }, 502);
  }

  return json({ ok: true, called: true }, 201);
}
