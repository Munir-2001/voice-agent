import type { LeadStatus, CallOutcome } from "./types";

type Tone = "success" | "warning" | "info" | "danger" | "neutral" | "live";

interface StatusMeta {
  label: string;
  tone: Tone;
}

export const LEAD_STATUS_META: Record<LeadStatus, StatusMeta> = {
  interested: { label: "Interested", tone: "success" },
  callback: { label: "Callback", tone: "warning" },
  calling: { label: "Calling", tone: "live" },
  pending: { label: "Pending", tone: "neutral" },
  not_interested: { label: "Not interested", tone: "neutral" },
  voicemail: { label: "Voicemail", tone: "info" },
  no_answer: { label: "No answer", tone: "neutral" },
  bad_number: { label: "Bad number", tone: "danger" },
  opted_out: { label: "Opted out", tone: "danger" },
};

export const CALL_OUTCOME_META: Record<CallOutcome, StatusMeta> = {
  interested: { label: "Interested", tone: "success" },
  callback: { label: "Callback", tone: "warning" },
  not_interested: { label: "Not interested", tone: "neutral" },
  voicemail: { label: "Voicemail", tone: "info" },
  no_answer: { label: "No answer", tone: "neutral" },
  opted_out: { label: "Opted out", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

// Tailwind classes per tone — muted background + readable foreground.
export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-muted text-success-ink border-success/25",
  warning: "bg-warning-muted text-warning-ink border-warning/30",
  info: "bg-info-muted text-info-ink border-info/25",
  danger: "bg-danger-muted text-danger-ink border-danger/25",
  neutral: "bg-muted text-muted-foreground border-border",
  live: "bg-success/10 text-success-ink border-success/30",
};

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/50",
  live: "bg-success",
};
