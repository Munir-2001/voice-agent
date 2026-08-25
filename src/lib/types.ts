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
  | "opted_out"
  // AI-meeting campaign states
  | "meeting_booked"
  | "not_decision_maker"
  | "needs_review";

export type CallOutcome =
  | "interested"
  | "not_interested"
  | "callback"
  | "voicemail"
  | "no_answer"
  | "opted_out"
  | "failed"
  // AI-meeting campaign states
  | "meeting_booked"
  | "not_decision_maker"
  | "needs_review"
  | "bad_number";

export interface Lead {
  id: string;
  name: string;
  businessName: string;
  phone: string; // E.164
  email?: string | null;
  industry: string;
  state: string;
  timezone: string; // IANA, e.g. America/New_York
  status: LeadStatus;
  attempts: number;
  lastCalledAt: string | null; // ISO
  callbackAt?: string | null; // ISO
  contactedAt?: string | null; // ISO — set when the human calls them back
  consentSource: string | null;
  uploadedAt: string; // ISO
  // AI-meeting campaign fields
  website?: string | null;
  meetingEmail?: string | null; // email confirmed on the call (may differ from email)
  meetingCity?: string | null; // city stated on the call
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
  numberUsed: string; // which Twilio number (our caller ID)
  // The OTHER party's number — the lead we dialed, or the caller on an inbound
  // call. Used for the call-log phone search and to identify callbacks.
  contactNumber?: string;
  callbackAt?: string | null;
  localTimezone?: string | null; // lead's IANA tz at call time (for local call time)
}

export interface TranscriptTurn {
  role: "agent" | "prospect";
  text: string;
  at: number; // seconds from call start
}

export interface CampaignSettings {
  name: string;
  active: boolean;
  windowStart: string; // "09:00"
  windowEnd: string; // "18:00"
  callsPerTick: number;
  dailyCap: number;
  maxAttempts: number;
  numbers: string[];
  activeListId: number | null; // which lead list the dialer calls (null = all)
}

// A named lead list within a workspace. The dialer calls the workspace's active
// list; uploads can target a specific list.
export interface LeadList {
  id: number;
  name: string;
  createdAt: string;
  total: number; // leads in this list
  pending: number; // leads still to be called (status 'pending')
  active: boolean; // is this the workspace's active list?
}

export interface Suppression {
  phone: string;
  reason: "opt_out" | "dnc" | "bad_number";
  addedAt: string;
}
