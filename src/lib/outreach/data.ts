import "server-only";
// Outreach read helpers. Server components import these (never the Supabase
// client directly), mirroring src/lib/data.ts. Every query is scoped to the
// active workspace via getActiveWorkspaceId(). Access is admin-gated at the page
// (requireAdminPage) and route (isCurrentUserAdmin) layers.

import { createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface SequenceSummary {
  id: number;
  name: string;
  kind: string;
  createdAt: string;
  stepCount: number;
}

export interface SequenceStep {
  id: number;
  step_no: number;
  day_offset: number;
  subject: string;
  body_html: string;
  active: boolean;
}

export interface SequenceDetail {
  id: number;
  name: string;
  kind: string;
  steps: SequenceStep[];
}

export interface CampaignSummary {
  id: number;
  name: string;
  status: string;
  sequenceId: number | null;
  sequenceName: string | null;
  listId: number | null;
  listName: string | null;
  fromIdentity: string | null;
  dailyCap: number;
  windowStart: string;
  windowEnd: string;
  autoEnroll: boolean;
  createdAt: string;
  enrolled: number;
  sent: number;
}

export interface CampaignReport {
  id: number;
  name: string;
  status: string;
  enrolled: number;
  sent: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  bounced: number;
}

export async function listSequences(): Promise<SequenceSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data } = await sb
    .from("email_sequences")
    .select("id, name, kind, created_at")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false });
  const sequences = data ?? [];

  const out: SequenceSummary[] = [];
  for (const s of sequences) {
    const { count } = await sb
      .from("email_steps")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", s.id as number);
    out.push({
      id: s.id as number,
      name: (s.name as string) ?? "Untitled sequence",
      kind: (s.kind as string) ?? "custom",
      createdAt: (s.created_at as string) ?? "",
      stepCount: count ?? 0,
    });
  }
  return out;
}

export async function getSequence(id: number): Promise<SequenceDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data: seq } = await sb
    .from("email_sequences")
    .select("id, name, kind")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!seq) return null;
  const { data: steps } = await sb
    .from("email_steps")
    .select("id, step_no, day_offset, subject, body_html, active")
    .eq("sequence_id", id)
    .order("step_no", { ascending: true });
  return {
    id: seq.id as number,
    name: (seq.name as string) ?? "",
    kind: (seq.kind as string) ?? "custom",
    steps: (steps ?? []) as SequenceStep[],
  };
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data } = await sb
    .from("email_campaigns")
    .select(
      "id, name, status, sequence_id, list_id, from_identity, daily_cap, window_start, window_end, auto_enroll_inbound, created_at, " +
        "email_sequences(name), lead_lists(name)",
    )
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false });
  const rows = data ?? [];

  const embedName = (v: unknown): string | null => {
    if (!v) return null;
    const one = Array.isArray(v) ? v[0] : v;
    return (one as { name?: string } | null)?.name ?? null;
  };

  const out: CampaignSummary[] = [];
  for (const c of rows) {
    const [enrolledRes, sentRes] = await Promise.all([
      sb
        .from("email_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id as number),
      sb
        .from("email_events")
        .select("id, email_enrollments!inner(campaign_id)", { count: "exact", head: true })
        .eq("email_enrollments.campaign_id", c.id as number)
        .eq("type", "sent"),
    ]);
    out.push({
      id: c.id as number,
      name: (c.name as string) ?? "Untitled campaign",
      status: (c.status as string) ?? "draft",
      sequenceId: (c.sequence_id as number) ?? null,
      sequenceName: embedName(c.email_sequences),
      listId: (c.list_id as number) ?? null,
      listName: embedName(c.lead_lists),
      fromIdentity: (c.from_identity as string) ?? null,
      dailyCap: (c.daily_cap as number) ?? 50,
      windowStart: (c.window_start as string) ?? "09:00",
      windowEnd: (c.window_end as string) ?? "17:00",
      autoEnroll: Boolean(c.auto_enroll_inbound),
      createdAt: (c.created_at as string) ?? "",
      enrolled: enrolledRes.count ?? 0,
      sent: sentRes.count ?? 0,
    });
  }
  return out;
}

const EVENT_TYPES = ["sent", "open", "click", "unsub", "bounce"] as const;

export async function campaignReports(): Promise<CampaignReport[]> {
  if (!isSupabaseConfigured()) return [];
  const ws = await getActiveWorkspaceId();
  const sb = createServiceClient();
  const { data } = await sb
    .from("email_campaigns")
    .select("id, name, status")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false });
  const campaigns = data ?? [];

  const out: CampaignReport[] = [];
  for (const c of campaigns) {
    const cid = c.id as number;
    const enrolledRes = await sb
      .from("email_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", cid);

    const counts: Record<string, number> = {};
    await Promise.all(
      EVENT_TYPES.map(async (t) => {
        const { count } = await sb
          .from("email_events")
          .select("id, email_enrollments!inner(campaign_id)", { count: "exact", head: true })
          .eq("email_enrollments.campaign_id", cid)
          .eq("type", t);
        counts[t] = count ?? 0;
      }),
    );

    out.push({
      id: cid,
      name: (c.name as string) ?? "Untitled campaign",
      status: (c.status as string) ?? "draft",
      enrolled: enrolledRes.count ?? 0,
      sent: counts.sent ?? 0,
      opened: counts.open ?? 0,
      clicked: counts.click ?? 0,
      unsubscribed: counts.unsub ?? 0,
      bounced: counts.bounce ?? 0,
    });
  }
  return out;
}
