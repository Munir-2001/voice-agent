import "server-only";
// Server-side data access. Every dashboard read goes through here.
// - When Supabase is configured, reads come from the DB via the service-role
//   client (bypasses RLS; safe because this is server-only and auth isn't wired
//   yet — switch to the user-session client once auth lands).
// - When it isn't configured, we fall back to sample data so the app still runs.

import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveWorkspaceId } from "@/lib/workspace";
import type { Lead, Call, CampaignSettings, LeadList, LeadStatus, CallOutcome, TranscriptTurn } from "@/lib/types";
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
  activeListId: null,
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
    website: (r.website as string) ?? null,
    meetingEmail: (r.meeting_email as string) ?? null,
    meetingCity: (r.meeting_city as string) ?? null,
    conversationUrl: (r.conversation_url as string) ?? null,
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
    // Prefer the number stored on the call (works for inbound too); fall back to
    // the joined lead's phone for older rows saved before external_number existed.
    contactNumber:
      (r.external_number as string) || ((lead?.phone as string) ?? ""),
    callbackAt: (r.callback_at as string) ?? null,
    localTimezone: (r.local_timezone as string) ?? null,
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
    activeListId: (r.active_list_id as number) ?? null,
  };
}

// ── reads ───────────────────────────────────────────────────────────────────
export async function getLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured()) return sampleLeads;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("workspace_id", ws)
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
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  let q = sb
    .from("calls")
    .select("*, leads(name, business_name, phone)")
    .eq("workspace_id", ws)
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
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("calls")
    .select("*, leads(name, business_name, phone)")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (error || !data) return null;
  return mapCall(data as Row);
}

export async function getLeadById(id: string): Promise<Lead | null> {
  if (!isSupabaseConfigured()) return sampleLeads.find((l) => l.id === id) ?? null;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (error || !data) return null;
  return mapLead(data as Row);
}

export async function getCampaignSettings(): Promise<CampaignSettings> {
  if (!isSupabaseConfigured()) return sampleSettings;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("campaign_settings")
    .select("*")
    .eq("workspace_id", ws)
    .maybeSingle();
  if (error) {
    console.error("getCampaignSettings:", error.message);
    return SAFE_SETTINGS;
  }
  return data ? mapSettings(data as Row) : SAFE_SETTINGS;
}

// A lead is "interested/warm" only if it's interested or has a booked meeting
// AND the human hasn't already actioned it. Callbacks are deliberately EXCLUDED
// — they're their own category (isCallbackWaiting) so a "call me later" is never
// counted as a warm/success lead. Used by the page AND counts so they agree.
function isWaiting(l: Lead): boolean {
  return (
    (l.status === "interested" || l.status === "meeting_booked") &&
    !l.contactedAt
  );
}

// A lead waiting in the separate Callbacks queue: asked to be called at a later
// time and not yet actioned.
function isCallbackWaiting(l: Lead): boolean {
  return l.status === "callback" && !l.contactedAt;
}

// Lightweight count for the sidebar badge — one small query, no calls join.
// Matches the /interested page (excludes already-contacted) when the column
// exists, and degrades to a plain status count if contacted_at isn't there yet.
export async function getInterestedCount(): Promise<number> {
  if (!isSupabaseConfigured()) return sampleLeads.filter(isWaiting).length;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("status, contacted_at")
    .eq("workspace_id", ws)
    .in("status", ["interested", "meeting_booked"]);
  if (error) {
    const { count } = await sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .in("status", ["interested", "meeting_booked"]);
    return count ?? 0;
  }
  return (data as Row[]).filter((r) => !r.contacted_at).length;
}

// Callbacks-queue badge count — mirrors getInterestedCount but for the separate
// callback bucket (leads that asked to be called at a later time).
export async function getCallbackCount(): Promise<number> {
  if (!isSupabaseConfigured()) return sampleLeads.filter(isCallbackWaiting).length;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("status, contacted_at")
    .eq("workspace_id", ws)
    .eq("status", "callback");
  if (error) {
    const { count } = await sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .eq("status", "callback");
    return count ?? 0;
  }
  return (data as Row[]).filter((r) => !r.contacted_at).length;
}

// All lead lists in the active workspace, with per-list counts and which one is
// active (the list the dialer is currently calling).
export async function getLeadLists(): Promise<LeadList[]> {
  if (!isSupabaseConfigured()) return [];
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const [listsRes, settingsRes] = await Promise.all([
    sb.from("lead_lists").select("id, name, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }),
    sb.from("campaign_settings").select("active_list_id").eq("workspace_id", ws).maybeSingle(),
  ]);
  const activeId = (settingsRes.data?.active_list_id as number) ?? null;
  const lists = (listsRes.data ?? []) as Row[];

  // Per-list counts (few lists per workspace, so a couple of head counts each is
  // cheap and always accurate regardless of list size).
  const out: LeadList[] = [];
  for (const l of lists) {
    const id = l.id as number;
    const [totalRes, pendingRes] = await Promise.all([
      sb.from("leads").select("*", { count: "exact", head: true }).eq("workspace_id", ws).eq("list_id", id),
      sb.from("leads").select("*", { count: "exact", head: true }).eq("workspace_id", ws).eq("list_id", id).eq("status", "pending"),
    ]);
    out.push({
      id,
      name: (l.name as string) ?? "Untitled list",
      createdAt: (l.created_at as string) ?? "",
      total: totalRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      active: activeId === id,
    });
  }
  return out;
}

// Validate a list id belongs to the active workspace (used by mutations/upload).
export async function listBelongsToActiveWorkspace(listId: number): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data } = await sb
    .from("lead_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", ws)
    .maybeSingle();
  return Boolean(data);
}

export interface LeadsPage {
  leads: Lead[];
  total: number;
}

// Server-side paginated + searched leads for the /leads table, scoped to the
// active workspace. Search matches name / business / phone in the DB (so it
// covers the WHOLE list, not just a loaded page). `status` "all" = no filter.
export async function getLeadsPage(opts: {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
}): Promise<LeadsPage> {
  const { page, pageSize } = opts;
  const status = opts.status && opts.status !== "all" ? opts.status : undefined;
  // Strip characters that would break a PostgREST or()/ilike filter.
  const q = (opts.q ?? "").trim().replace(/[,()%*]/g, "");

  if (!isSupabaseConfigured()) {
    let rows = sampleLeads;
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.name.toLowerCase().includes(lq) ||
          l.businessName.toLowerCase().includes(lq) ||
          l.phone.includes(lq),
      );
    }
    if (status) rows = rows.filter((l) => l.status === status);
    const from = (page - 1) * pageSize;
    return { leads: rows.slice(from, from + pageSize), total: rows.length };
  }

  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const from = (page - 1) * pageSize;
  let query = sb
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", ws);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,business_name.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }
  const { data, error, count } = await query
    .order("uploaded_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error("getLeadsPage:", error.message);
    return { leads: [], total: 0 };
  }
  return { leads: (data as Row[]).map(mapLead), total: count ?? 0 };
}

// Per-status counts for the leads-page filter pills, scoped to the active
// workspace. One lightweight query (status column only).
export async function getLeadStatusCounts(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) {
    const m: Record<string, number> = {};
    for (const l of sampleLeads) m[l.status] = (m[l.status] ?? 0) + 1;
    return m;
  }
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("status")
    .eq("workspace_id", ws)
    .limit(100_000);
  if (error) {
    console.error("getLeadStatusCounts:", error.message);
    return {};
  }
  const m: Record<string, number> = {};
  for (const r of data as Row[]) {
    const s = r.status as string;
    m[s] = (m[s] ?? 0) + 1;
  }
  return m;
}

// Fetch leads BY STATUS directly from the DB (scoped to the active workspace).
// Critical: getLeads() only returns the newest 5000 by upload date, so in a
// large workspace an older qualified lead would be missed — querying by status
// returns the (small) set regardless of upload order or list size.
async function leadsByStatus(statuses: LeadStatus[]): Promise<Lead[]> {
  if (!isSupabaseConfigured()) {
    return sampleLeads.filter((l) => statuses.includes(l.status));
  }
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("workspace_id", ws)
    .in("status", statuses)
    .order("callback_at", { ascending: true });
  if (error) {
    console.error("leadsByStatus:", error.message);
    return [];
  }
  return (data as Row[]).map(mapLead);
}

// Attach each lead's latest call for context (best-effort; null if not found).
async function withLatestCall(
  leads: Lead[],
): Promise<{ lead: Lead; call: Call | null }[]> {
  if (leads.length === 0) return [];
  const calls = await getCalls(5000);
  const latestByLead = new Map<string, Call>();
  for (const c of calls) {
    if (!latestByLead.has(c.leadId)) latestByLead.set(c.leadId, c); // newest-first
  }
  return leads.map((lead) => ({ lead, call: latestByLead.get(lead.id) ?? null }));
}

export async function getInterestedLeads(): Promise<{ lead: Lead; call: Call | null }[]> {
  const leads = (await leadsByStatus(["interested", "meeting_booked"])).filter(isWaiting);
  return withLatestCall(leads);
}

// History of every lead that was ever interested/booked and has since been
// marked contacted — the inverse of getInterestedLeads(). Newest contact first.
export async function getInterestedHistory(): Promise<{ lead: Lead; call: Call | null }[]> {
  const leads = (await leadsByStatus(["interested", "meeting_booked", "callback"]))
    .filter((l) => l.contactedAt)
    .sort((a, b) => (b.contactedAt ?? "").localeCompare(a.contactedAt ?? ""));
  return withLatestCall(leads);
}

// The separate Callbacks queue: leads that asked to be called back at a later
// time, with their latest call for context.
export async function getCallbackLeads(): Promise<{ lead: Lead; call: Call | null }[]> {
  const leads = (await leadsByStatus(["callback"])).filter(isCallbackWaiting);
  return withLatestCall(leads);
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
  // Call-quality signals (help spot the "picked up then hung up in seconds"
  // pattern and measure whether opener/audio changes are actually working).
  answered: number; // calls where someone actually engaged (>= 3s)
  earlyHangups: number; // answered but dropped in under 20s
  hangupRate: number; // % of answered calls that dropped in under 20s
  avgTalkSecs: number; // average duration of answered calls
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
  // Callbacks are their own bucket (the /callbacks queue), not part of "waiting".
  const callbacks = leads.filter(
    (l) => l.status === "callback" && !l.contactedAt,
  ).length;

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

  // Call quality: an "answered" call is one where someone engaged (>= 3s of
  // audio), filtering out plain no-answers/rings. An "early hangup" is an
  // answered call that dropped in under 20s — the exact failure we're seeing
  // when the opener talks over people. Tracking this lets us prove the fix.
  const ANSWERED_MIN = 3;
  const HANGUP_MAX = 20;
  const answeredCalls = calls.filter((c) => c.durationSecs >= ANSWERED_MIN);
  const answered = answeredCalls.length;
  const earlyHangups = answeredCalls.filter((c) => c.durationSecs < HANGUP_MAX).length;
  const hangupRate = answered ? Math.round((earlyHangups / answered) * 100) : 0;
  const avgTalkSecs = answered
    ? Math.round(answeredCalls.reduce((s, c) => s + c.durationSecs, 0) / answered)
    : 0;

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
    answered,
    earlyHangups,
    hangupRate,
    avgTalkSecs,
  };
}
