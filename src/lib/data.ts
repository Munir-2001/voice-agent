import "server-only";
// Server-side data access. Every dashboard read goes through here.
// - When Supabase is configured, reads come from the DB via the service-role
//   client (bypasses RLS; safe because this is server-only and auth isn't wired
//   yet — switch to the user-session client once auth lands).
// - When it isn't configured, we fall back to sample data so the app still runs.

import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Lead, Call, CampaignSettings, LeadStatus, CallOutcome, TranscriptTurn } from "@/lib/types";
import {
  leads as sampleLeads,
  calls as sampleCalls,
  campaignSettings as sampleSettings,
} from "@/lib/sample-data";

// The business day/month boundaries are computed in this timezone (not the
// server's UTC), so evening US calls land on the right calendar day.
const BUSINESS_TZ = "America/New_York";

// Safe defaults for when Supabase IS configured but the row is missing/errors —
// never leak sample data (fake "active" + demo numbers) into production.
const SAFE_SETTINGS: CampaignSettings = {
  name: "Campaign",
  active: false,
  windowStart: "09:00",
  windowEnd: "18:00",
  callsPerTick: 3,
  dailyCap: 30,
  maxAttempts: 2,
  numbers: [],
};

type Row = Record<string, unknown>;

// ── mappers: DB (snake_case) → domain (camelCase) ───────────────────────────
function mapLead(r: Row): Lead {
  return {
    id: String(r.id),
    name: (r.name as string) ?? "",
    businessName: (r.business_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: (r.email as string) ?? null,
    industry: (r.industry as string) ?? "",
    state: (r.state as string) ?? "",
    timezone: (r.timezone as string) ?? "America/New_York",
    status: (r.status as LeadStatus) ?? "pending",
    attempts: (r.attempts as number) ?? 0,
    lastCalledAt: (r.last_called_at as string) ?? null,
    callbackAt: (r.callback_at as string) ?? null,
    contactedAt: (r.contacted_at as string) ?? null,
    consentSource: (r.consent_source as string) ?? null,
    uploadedAt: (r.uploaded_at as string) ?? new Date(0).toISOString(),
  };
}

function mapCall(r: Row): Call {
  const lead = (r.leads as Row | null) ?? null;
  return {
    id: String(r.id),
    leadId: (r.lead_id as string) ?? "",
    leadName: (lead?.name as string) ?? "",
    businessName: (lead?.business_name as string) ?? "",
    startedAt: (r.started_at as string) ?? new Date(0).toISOString(),
    durationSecs: (r.duration_secs as number) ?? 0,
    outcome: (r.outcome as CallOutcome) ?? "no_answer",
    summary: (r.summary as string) ?? "",
    transcript: ((r.transcript as TranscriptTurn[]) ?? []),
    recordingUrl: (r.recording_url as string) ?? null,
    numberUsed: (r.number_used as string) ?? "",
    callbackAt: (r.callback_at as string) ?? null,
  };
}

function mapSettings(r: Row): CampaignSettings {
  return {
    name: (r.name as string)?.trim() || "Campaign",
    active: Boolean(r.active),
    windowStart: (r.window_start as string)?.slice(0, 5) ?? "09:00",
    windowEnd: (r.window_end as string)?.slice(0, 5) ?? "18:00",
    callsPerTick: (r.calls_per_tick as number) ?? 3,
    dailyCap: (r.daily_cap as number) ?? 30,
    maxAttempts: (r.max_attempts as number) ?? 2,
    numbers: (r.numbers as string[]) ?? [],
  };
}

// ── reads ───────────────────────────────────────────────────────────────────
export async function getLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured()) return sampleLeads;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("getLeads:", error.message);
    return [];
  }
  return (data as Row[]).map(mapLead);
}

// `sinceISO` bounds the set by time (for month/series stats) instead of an
// arbitrary newest-N cap, so headline metrics don't silently truncate.
export async function getCalls(limit = 2000, sinceISO?: string): Promise<Call[]> {
  if (!isSupabaseConfigured()) return sampleCalls;
  const sb = createServiceClient();
  let q = sb
    .from("calls")
    .select("*, leads(name, business_name)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (sinceISO) q = q.gte("started_at", sinceISO);
  const { data, error } = await q;
  if (error) {
    console.error("getCalls:", error.message);
    return [];
  }
  return (data as Row[]).map(mapCall);
}

export async function getCallById(id: string): Promise<Call | null> {
  if (!isSupabaseConfigured()) {
    return sampleCalls.find((c) => c.id === id) ?? null;
  }
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("calls")
    .select("*, leads(name, business_name)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapCall(data as Row);
}

export async function getLeadById(id: string): Promise<Lead | null> {
  if (!isSupabaseConfigured()) return sampleLeads.find((l) => l.id === id) ?? null;
  const sb = createServiceClient();
  const { data, error } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapLead(data as Row);
}

export async function getCampaignSettings(): Promise<CampaignSettings> {
  if (!isSupabaseConfigured()) return sampleSettings;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("campaign_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("getCampaignSettings:", error.message);
    return SAFE_SETTINGS;
  }
  return data ? mapSettings(data as Row) : SAFE_SETTINGS;
}

// A lead is "waiting for callback" only if it's interested/callback AND the
// human hasn't already called it back. Used by the page AND the counts so they
// never disagree.
function isWaiting(l: Lead): boolean {
  return (l.status === "interested" || l.status === "callback") && !l.contactedAt;
}

// Lightweight count for the sidebar badge — one small query, no calls join.
// Matches the /interested page (excludes already-contacted) when the column
// exists, and degrades to a plain status count if contacted_at isn't there yet.
export async function getInterestedCount(): Promise<number> {
  if (!isSupabaseConfigured()) return sampleLeads.filter(isWaiting).length;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("status, contacted_at")
    .in("status", ["interested", "callback"]);
  if (error) {
    const { count } = await sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .in("status", ["interested", "callback"]);
    return count ?? 0;
  }
  return (data as Row[]).filter((r) => !r.contacted_at).length;
}

export async function getInterestedLeads(): Promise<{ lead: Lead; call: Call | null }[]> {
  const [leads, calls] = await Promise.all([getLeads(), getCalls(5000)]);
  const latestByLead = new Map<string, Call>();
  for (const c of calls) {
    if (!latestByLead.has(c.leadId)) latestByLead.set(c.leadId, c); // newest-first
  }
  return leads.filter(isWaiting).map((lead) => ({ lead, call: latestByLead.get(lead.id) ?? null }));
}

// ── derived overview stats (pure) ───────────────────────────────────────────
export interface OverviewStats {
  totalLeads: number;
  dialsThisMonth: number;
  callsToday: number;
  interested: number;
  interestedToday: number;
  callbacks: number;
  connectRate: number; // %
  outcomeCounts: { status: LeadStatus; count: number }[];
  dailySeries: { day: string; dials: number; interested: number }[];
}

const CONNECTED: CallOutcome[] = ["interested", "not_interested", "callback", "opted_out"];

// YYYY-MM-DD in the business timezone.
function bizDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
}

export function computeStats(leads: Lead[], calls: Call[]): OverviewStats {
  const today = bizDay(new Date());
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"

  const dayOf = (c: Call) => bizDay(c.startedAt);
  const dialsThisMonth = calls.filter((c) => dayOf(c).startsWith(monthPrefix)).length;
  const callsToday = calls.filter((c) => dayOf(c) === today).length;
  const connected = calls.filter((c) => CONNECTED.includes(c.outcome)).length;
  const connectRate = calls.length ? Math.round((connected / calls.length) * 100) : 0;
  const interestedToday = calls.filter(
    (c) => c.outcome === "interested" && dayOf(c) === today,
  ).length;

  // "Waiting" counts match the /interested page (exclude already-contacted).
  const waiting = leads.filter(isWaiting);
  const interested = waiting.filter((l) => l.status === "interested").length;
  const callbacks = waiting.filter((l) => l.status === "callback").length;

  // Full status distribution (raw — includes every LeadStatus).
  const order: LeadStatus[] = [
    "interested", "callback", "not_interested", "voicemail",
    "no_answer", "opted_out", "bad_number", "pending", "calling",
  ];
  const outcomeCounts = order
    .map((status) => ({ status, count: leads.filter((l) => l.status === status).length }))
    .filter((c) => c.count > 0);

  // Last 14 business days of dials + interested.
  const perDay = new Map<string, { dials: number; interested: number }>();
  for (const c of calls) {
    const d = dayOf(c);
    const cur = perDay.get(d) ?? { dials: 0, interested: 0 };
    cur.dials += 1;
    if (c.outcome === "interested") cur.interested += 1;
    perDay.set(d, cur);
  }
  const dailySeries: { day: string; dials: number; interested: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = bizDay(d);
    const bucket = perDay.get(key) ?? { dials: 0, interested: 0 };
    dailySeries.push({
      day: new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dials: bucket.dials,
      interested: bucket.interested,
    });
  }

  return {
    totalLeads: leads.length,
    dialsThisMonth,
    callsToday,
    interested,
    interestedToday,
    callbacks,
    connectRate,
    outcomeCounts,
    dailySeries,
  };
}
