import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164US, areaCode } from "@/lib/phone";
import { timezoneForAreaCode } from "@/lib/timezone";
import { cleanName, cleanEmail } from "@/lib/clean";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";
import { checkTwilioBalance } from "@/lib/agent/billing-guard";

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

const DEFAULTS = { perIpHour: 3, dailyCap: 50 };

function isLive(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.DEMO_LIVE ?? "");
}
function miaWorkspaceId(): number | null {
  const v = Number(process.env.MIA_WORKSPACE_ID);
  return Number.isInteger(v) && v > 0 ? v : null;
}
function dailyCap(): number {
  const v = Number(process.env.DEMO_DAILY_CAP);
  return Number.isInteger(v) && v > 0 ? v : DEFAULTS.dailyCap;
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

  const phone = toE164US(b.phone ?? "");
  if (!phone) return json({ error: "Please enter a valid US phone number" }, 422);
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
  const callerNumberId = numberIds[0];
  if (!callerNumberId) {
    console.error("demo-call: no caller number configured for Mia");
    return json({ error: "Demo calling isn't configured yet" }, 503);
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

  // Rate limit: 1 call per phone per 24h. Reuse an existing lead row if present.
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id, last_called_at, status")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .maybeSingle();
  if (existingLead) {
    const last = existingLead.last_called_at ? new Date(existingLead.last_called_at as string) : null;
    if ((last && last > dayAgo) || existingLead.status === "calling") {
      return json({ error: "This number was already called recently — try again tomorrow" }, 429);
    }
  }

  // Global daily cap: how many demo calls placed today in this workspace.
  const { count: placedToday } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("last_called_at", startOfDay.toISOString());
  if ((placedToday ?? 0) >= dailyCap()) {
    return json({ error: "Daily demo limit reached — please try again tomorrow" }, 429);
  }

  // Billing safeguard: never dial a drained/suspended Twilio account.
  const bal = await checkTwilioBalance();
  if (bal.stop) {
    console.error(`demo-call: blocked by balance gate — ${bal.reason}`);
    return json({ error: "Demo calling is temporarily unavailable" }, 503);
  }

  const live = isLive();

  // Upsert the lead. In DRY-RUN we still record the intent (as 'pending') but never
  // set 'calling' or dial. In LIVE we mark 'calling' (the "initiated" record) and
  // the post-call webhook fills in the calls row + analysis.
  const leadPatch = {
    workspace_id: workspaceId,
    name,
    business_name: company,
    phone,
    email,
    timezone: timezoneForAreaCode(areaCode(phone)),
    consent_source: "demo_form",
    ...(live ? { status: "calling", last_called_at: now.toISOString() } : { status: "pending" }),
  };

  let leadId = existingLead?.id as string | undefined;
  if (leadId) {
    await supabase.from("leads").update(leadPatch).eq("id", leadId).eq("workspace_id", workspaceId);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("leads").insert({ ...leadPatch, attempts: 0 }).select("id").single();
    if (insErr || !inserted) {
      console.error("demo-call: lead insert failed:", insErr?.message);
      return json({ error: "Could not start the demo" }, 500);
    }
    leadId = inserted.id as string;
  }

  if (!live) {
    console.log(
      `demo-call[DRY-RUN]: would call ${phone} (${name}${company ? ", " + company : ""}) ` +
        `via agent ${agentId} / ${callerNumberId}. Set DEMO_LIVE=1 to dial.`,
    );
    return json({ ok: true, dryRun: true }, 200);
  }

  try {
    await placeOutboundCall(
      { id: leadId, name, business_name: company || "your business", industry: "", email, phone },
      callerNumberId,
      agentId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("demo-call: placeOutboundCall failed:", message);
    // Don't leave the lead stuck 'calling' on a failure to hand off.
    await supabase.from("leads").update({ status: "pending" }).eq("id", leadId).eq("workspace_id", workspaceId);
    return json({ error: "Could not connect the call — please try again" }, 502);
  }

  return json({ ok: true, called: true }, 201);
}
