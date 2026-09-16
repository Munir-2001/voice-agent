import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { placeOutboundCall, callerNumberIds } from "@/lib/agent/outbound";
import { checkTwilioBalance } from "@/lib/agent/billing-guard";

// Smart queue for the public "Mia" instant-demo. The product promise is "your
// phone rings in seconds", so we do NOT make everyone wait in a FIFO line — we
// dial immediately whenever a line is free and only queue the overflow. When a
// call ends (webhook) or a new person submits, we drain the queue: pull the
// oldest waiting lead and dial it into the freed slot.
//
// Concurrency is bounded so a burst (or abuse) can't fan out into dozens of
// simultaneous billed calls. The default ceiling = number of caller numbers
// (one live call per number), overridable via DEMO_MAX_CONCURRENT.

const DEFAULT_MAX_QUEUE = 25;
const DEFAULT_DAILY_CAP = 50;
// A demo call is hard-capped at 90s, so a lead stuck in 'calling' for >5 min can
// only be a missed/failed webhook. Reclaim its slot rather than blocking forever.
const STALE_CALLING_MS = 5 * 60_000;

// Max simultaneous live demo calls. Defaults to one per caller number so adding a
// second number automatically doubles capacity; DEMO_MAX_CONCURRENT overrides.
export function demoMaxConcurrent(numberCount: number): number {
  const v = Number(process.env.DEMO_MAX_CONCURRENT);
  if (Number.isInteger(v) && v > 0) return v;
  return Math.max(1, numberCount);
}

export function demoMaxQueue(): number {
  const v = Number(process.env.DEMO_MAX_QUEUE);
  return Number.isInteger(v) && v > 0 ? v : DEFAULT_MAX_QUEUE;
}

// Global cost ceiling for demo calls placed per day (dialed, not queued).
export function demoDailyCap(): number {
  const v = Number(process.env.DEMO_DAILY_CAP);
  return Number.isInteger(v) && v > 0 ? v : DEFAULT_DAILY_CAP;
}

// Assign a caller number to a slot. Rotating by slot index keeps concurrent calls
// on distinct numbers (default cap = numberCount, so each in-flight call gets its
// own line and pickup rates stay clean).
export function pickCallerNumber(numberIds: string[], slotIndex: number): string {
  return numberIds[slotIndex % numberIds.length];
}

// Live demo calls currently in progress for this workspace.
export async function countInFlight(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<number> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "calling");
  return count ?? 0;
}

// Leads waiting in the queue for this workspace.
export async function countQueued(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<number> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "queued");
  return count ?? 0;
}

// Demo calls actually placed today (counts toward the daily cost cap). A dialed
// lead has last_called_at set; queued leads do not, so they're excluded until
// they're drained and dialed.
export async function countPlacedToday(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("last_called_at", startOfDay.toISOString());
  return count ?? 0;
}

// 1-based position of a queued lead (how many queued ahead of + including it),
// ordered by submit time. Used only for the "you're #N in line" message.
export async function queuePosition(
  supabase: SupabaseClient,
  workspaceId: number,
  createdAt: string,
): Promise<number> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .lte("created_at", createdAt);
  return count ?? 0;
}

// Self-heal: free slots held by leads stuck in 'calling' past the max call life
// (a missed webhook). Marked 'failed' but last_called_at is KEPT so the attempt
// still counts toward the daily cap and the number isn't instantly re-dialed.
export async function reclaimStaleCalling(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_CALLING_MS).toISOString();
  const { data } = await supabase
    .from("leads")
    .update({ status: "failed" })
    .eq("workspace_id", workspaceId)
    .eq("status", "calling")
    .lt("last_called_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}

interface QueuedLead {
  id: string;
  name: string;
  business_name: string | null;
  industry: string | null;
  email: string | null;
  phone: string;
}

// Atomically claim the oldest queued lead: fetch it, then flip queued→calling
// ONLY if it's still queued. If a concurrent drain already claimed it, the
// conditional update touches 0 rows and we return null (lost the race).
async function claimOldestQueued(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<QueuedLead | null> {
  const { data: rows } = await supabase
    .from("leads")
    .select("id, name, business_name, industry, email, phone")
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  const lead = rows?.[0] as QueuedLead | undefined;
  if (!lead) return null;

  const { data: claimed } = await supabase
    .from("leads")
    .update({ status: "calling", last_called_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .select("id");
  if (!claimed || claimed.length === 0) return null;
  return lead;
}

export interface DrainResult {
  dialed: number;
  reclaimed: number;
}

// Fill every free slot from the queue. Runs on call-completion (webhook) and on
// new submissions. Bounded by both the concurrency cap and the daily cost cap;
// stops (leaving leads queued) when either is hit or the queue empties.
export async function drainDemoQueue(
  supabase: SupabaseClient,
  workspaceId: number,
): Promise<DrainResult> {
  const reclaimed = await reclaimStaleCalling(supabase, workspaceId);

  const { data: settings } = await supabase
    .from("campaign_settings")
    .select("elevenlabs_agent_id, caller_number_ids")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const agentId = settings?.elevenlabs_agent_id as string | undefined;
  const numberIds = settings?.caller_number_ids
    ? String(settings.caller_number_ids).split(",").map((s: string) => s.trim()).filter(Boolean)
    : callerNumberIds();
  if (!agentId || numberIds.length === 0) return { dialed: 0, reclaimed };

  // Never dial a drained/suspended Twilio account. A temporary dip just holds
  // queued leads in line until it's topped up (they're already told to sit tight).
  const bal = await checkTwilioBalance();
  if (bal.stop) {
    console.error(`demo-queue: drain skipped — balance gate: ${bal.reason}`);
    return { dialed: 0, reclaimed };
  }

  const cap = demoMaxConcurrent(numberIds.length);
  const dailyCap = demoDailyCap();
  let inFlight = await countInFlight(supabase, workspaceId);
  let placedToday = await countPlacedToday(supabase, workspaceId);
  let dialed = 0;

  while (inFlight < cap && placedToday < dailyCap) {
    const lead = await claimOldestQueued(supabase, workspaceId);
    if (!lead) break; // queue empty (or all claimed by a concurrent drain)

    const callerNumberId = pickCallerNumber(numberIds, inFlight);
    try {
      await placeOutboundCall(
        {
          id: lead.id,
          name: lead.name,
          business_name: lead.business_name || "your business",
          industry: lead.industry || "",
          email: lead.email,
          phone: lead.phone,
        },
        callerNumberId,
        agentId,
      );
      inFlight++;
      placedToday++;
      dialed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`demo-queue: dial failed for lead ${lead.id}:`, message);
      // Billing-safe: the hand-off may have already created (and billed) an
      // ElevenLabs conversation, so keep last_called_at. Mark failed and move on
      // to the next queued lead — the slot stays open for it.
      await supabase
        .from("leads")
        .update({ status: "failed" })
        .eq("id", lead.id)
        .eq("workspace_id", workspaceId);
    }
  }

  return { dialed, reclaimed };
}
