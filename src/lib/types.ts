// Domain types — mirror the Supabase schema described in Dev-Plan.md §5.

export type LeadStatus =
  | "pending"
  | "calling"
  | "interested"
  | "callback"
  | "not_interested"
  | "voicemail"
  | "no_answer"
  | "bad_number"
  | "opted_out";

export type CallOutcome =
  | "interested"
  | "not_interested"
  | "callback"
  | "voicemail"
  | "no_answer"
  | "opted_out"
  | "failed";

export interface Lead {
  id: string;
  name: string;
  businessName: string;
  phone: string; // E.164
  industry: string;
  state: string;
  timezone: string; // IANA, e.g. America/New_York
  status: LeadStatus;
  attempts: number;
  lastCalledAt: string | null; // ISO
  consentSource: string | null;
  uploadedAt: string; // ISO
}

export interface Call {
  id: string;
  leadId: string;
  leadName: string;
  businessName: string;
  startedAt: string; // ISO
  durationSecs: number;
  outcome: CallOutcome;
  summary: string;
  transcript: TranscriptTurn[];
  recordingUrl: string | null;
  numberUsed: string; // which Twilio number
  callbackAt?: string | null;
}

export interface TranscriptTurn {
  role: "agent" | "prospect";
  text: string;
  at: number; // seconds from call start
}

export interface CampaignSettings {
  active: boolean;
  windowStart: string; // "09:00"
  windowEnd: string; // "18:00"
  callsPerTick: number;
  dailyCap: number;
  maxAttempts: number;
  numbers: string[];
}

export interface Suppression {
  phone: string;
  reason: "opt_out" | "dnc" | "bad_number";
  addedAt: string;
}
