import "server-only";
// Sends the "welcome / next steps" email to a lead the moment the agent
// qualifies them as interested. The lead replies to THIS email and their info
// lands in Rose's inbox (EMAIL_REPLY_TO) — nothing sensitive is stored here.
//
// Sends over SMTP with an app password (works with Gmail out of the box and can
// email real recipients immediately — no domain verification needed).
// Required env: SMTP_HOST, SMTP_USER, SMTP_PASS. Optional: SMTP_PORT (default
// 465), EMAIL_FROM_NAME (display name, defaults to the company), EMAIL_REPLY_TO
// (defaults to SMTP_USER). If SMTP isn't configured we skip silently (the
// dashboard still shows the interested lead), so a half-configured deploy never
// 500s.

import nodemailer, { type Transporter } from "nodemailer";
import { formatDateTimeInTz } from "@/lib/format";
import {
  COMPANY_NAME,
  SENDER_NAME,
  WEBSITE,
  SUBJECT,
  INTRO,
  REQUESTED_ITEMS,
  CLOSING,
  SIGN_OFF,
  MAILING_ADDRESS,
} from "@/lib/email-copy";

interface WelcomeLead {
  name: string;
  businessName: string;
  email: string;
}

export type CampaignGoal = "financing" | "ai_meeting";

// A fully self-contained email identity for one campaign: its own SMTP account,
// display name, reply-to, and internal-notify list. This is what keeps the admin
// (NextGen) campaign completely separate from Rose's financing email.
export interface EmailProfile {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  replyTo: string;
  notify: string[];
}

const list = (v?: string) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Resolve the email profile for a campaign goal.
 * - financing → the shared SMTP_* / EMAIL_* vars (Rose).
 * - ai_meeting → NEXTGEN_SMTP_* / NEXTGEN_* vars (admin). Each NextGen field
 *   falls back to the shared one if unset, so it works today from the shared
 *   inbox and becomes a fully separate sender the moment you add NextGen creds.
 */
export function emailProfile(goal: CampaignGoal = "financing"): EmailProfile {
  const host = process.env.SMTP_HOST ?? "";
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  if (goal === "ai_meeting") {
    const ngUser = process.env.NEXTGEN_SMTP_USER || user;
    const notify =
      list(process.env.NEXTGEN_NOTIFY).length > 0
        ? list(process.env.NEXTGEN_NOTIFY)
        : list(process.env.NEXTGEN_REPLY_TO).length > 0
          ? list(process.env.NEXTGEN_REPLY_TO)
          : list(process.env.EMAIL_NOTIFY);
    return {
      host: process.env.NEXTGEN_SMTP_HOST || host,
      port: Number(process.env.NEXTGEN_SMTP_PORT || port),
      user: ngUser,
      pass: process.env.NEXTGEN_SMTP_PASS || pass,
      fromName: process.env.NEXTGEN_FROM_NAME || "NextGen AI",
      replyTo: process.env.NEXTGEN_REPLY_TO || process.env.EMAIL_REPLY_TO || ngUser,
      notify,
    };
  }

  return {
    host,
    port,
    user,
    pass,
    fromName: process.env.EMAIL_FROM_NAME || COMPANY_NAME,
    replyTo: process.env.EMAIL_REPLY_TO || user,
    notify: list(process.env.EMAIL_NOTIFY),
  };
}

export function isEmailConfigured(p: EmailProfile = emailProfile()): boolean {
  return Boolean(p.host && p.user && p.pass);
}

// One transporter per (host,user) so financing and NextGen keep separate SMTP
// connections. Cached at module scope (persists on a warm serverless instance).
const transporters = new Map<string, Transporter>();
function transportFor(p: EmailProfile): Transporter {
  const key = `${p.host}|${p.user}`;
  const cached = transporters.get(key);
  if (cached) return cached;
  const t = nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: p.user, pass: p.pass },
  });
  transporters.set(key, t);
  return t;
}

// Very light sanity check — Resend rejects malformed addresses anyway.
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEmail(lead: WelcomeLead): { subject: string; html: string; text: string } {
  const first = lead.name.trim().split(/\s+/)[0] || "there";

  const itemsText = REQUESTED_ITEMS.map((d) => `  •  ${d}`).join("\n");
  const itemsHtml = REQUESTED_ITEMS.map((d) => `<li>${esc(d)}</li>`).join("");

  const text = `Hello ${first},

Welcome to ${COMPANY_NAME}!

${INTRO}

To get started, please reply with the following:

${itemsText}

${CLOSING}

${SIGN_OFF}

${SENDER_NAME}
${COMPANY_NAME}
${WEBSITE}

—
${MAILING_ADDRESS}
If you'd prefer not to receive these emails, just reply and let us know.`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;">
  <p>Hello ${esc(first)},</p>
  <p><strong>Welcome to ${esc(COMPANY_NAME)}!</strong></p>
  <p>${esc(INTRO)}</p>
  <p>To get started, please <strong>reply to this email</strong> with the following:</p>
  <ul>${itemsHtml}</ul>
  <p>${esc(CLOSING)}</p>
  <p>${esc(SIGN_OFF)}<br/><br/>${esc(SENDER_NAME)}<br/>${esc(COMPANY_NAME)}<br/><a href="${esc(WEBSITE)}">${esc(WEBSITE)}</a></p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;"/>
  <p style="font-size:12px;color:#888;">${esc(MAILING_ADDRESS)}<br/>If you'd prefer not to receive these emails, just reply and let us know.</p>
</div>`;

  return { subject: SUBJECT, html, text };
}

interface LeadNotification {
  name: string;
  businessName: string;
  phone: string;
  email: string | null;
  outcome: string;
  summary: string;
  callbackAt?: string | null;
  timezone?: string | null; // lead's IANA tz, for a human-readable callback time
}

/**
 * Internal alert to the team that a lead is interested / a meeting is booked.
 * Sender + recipients come from the campaign's email profile, so financing and
 * NextGen alerts stay fully separate. Never throws.
 */
export async function sendLeadNotification(
  n: LeadNotification,
  profile: EmailProfile = emailProfile(),
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured(profile)) return { sent: false, reason: "email not configured" };
  const to = profile.notify;
  if (to.length === 0) return { sent: false, reason: "no notification recipients" };

  const fromName = profile.fromName;
  const fromAddr = profile.user;
  const biz = n.businessName.trim() || "—";
  const subject = `New interested lead: ${n.name.trim() || "Unknown"}${
    n.businessName.trim() ? ` (${n.businessName.trim()})` : ""
  }`;

  const rows: [string, string][] = [
    ["Name", n.name.trim() || "—"],
    ["Business", biz],
    ["Phone", n.phone || "—"],
    ["Email", n.email || "—"],
    ["Outcome", n.outcome],
  ];
  if (n.callbackAt)
    rows.push([
      "Preferred callback time",
      `${formatDateTimeInTz(n.callbackAt, n.timezone)} (their local time)`,
    ]);

  const text = `New interested lead\n\n${rows
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n\nSummary:\n${n.summary || "—"}\n\nThey've been sent the welcome email (if an address was on file). Please follow up.`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;">
  <p style="font-weight:600;">🎉 New interested lead</p>
  <table style="border-collapse:collapse;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#666;">${esc(k)}</td><td style="padding:2px 0;font-weight:500;">${esc(
          v,
        )}</td></tr>`,
    )
    .join("")}</table>
  <p style="margin-top:16px;"><strong>Summary</strong><br/>${esc(n.summary || "—")}</p>
  <p style="color:#666;font-size:13px;">They've been sent the welcome email (if an address was on file). Please follow up.</p>
</div>`;

  try {
    await transportFor(profile).sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Billing/safeguard alert to the team: a campaign was AUTO-PAUSED to protect
 * spend (low Twilio balance, or a run of consecutive call failures). Sent to the
 * campaign's own notify list so financing and NextGen alerts stay separate.
 * Best-effort — never throws (the dialer must halt whether or not the email sends).
 */
export async function sendBillingAlert(
  args: { subject: string; heading: string; rows: [string, string][]; action?: string },
  profile: EmailProfile = emailProfile(),
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured(profile)) return { sent: false, reason: "email not configured" };
  const to = profile.notify;
  if (to.length === 0) return { sent: false, reason: "no notification recipients" };

  const text =
    `${args.heading}\n\n` +
    args.rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (args.action ? `\n\n${args.action}` : "");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;">
  <p style="font-weight:600;">⛔ ${esc(args.heading)}</p>
  <table style="border-collapse:collapse;">${args.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#666;vertical-align:top;">${esc(k)}</td><td style="padding:2px 0;font-weight:500;">${esc(
          v,
        )}</td></tr>`,
    )
    .join("")}</table>
  ${args.action ? `<p style="margin-top:16px;color:#b00;font-weight:500;">${esc(args.action)}</p>` : ""}
</div>`;

  try {
    await transportFor(profile).sendMail({
      from: `"${profile.fromName}" <${profile.user}>`,
      to,
      subject: args.subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Emails a submitted business-verification form (for Twilio Trust Hub) to the
 * team so it can be entered into Twilio. Sent to EMAIL_NOTIFY, or
 * BUSINESS_PROFILE_EMAIL if set.
 */
export async function sendBusinessProfileEmail(
  fields: { label: string; value: string }[],
  legalName: string,
): Promise<{ sent: boolean; reason?: string }> {
  const profile = emailProfile("financing");
  if (!isEmailConfigured(profile)) return { sent: false, reason: "email not configured" };
  const to = list(process.env.BUSINESS_PROFILE_EMAIL);
  const recipients = to.length ? to : profile.notify;
  if (recipients.length === 0) return { sent: false, reason: "no recipients configured" };

  const fromName = profile.fromName;
  const fromAddr = profile.user;
  const subject = `Twilio business verification — ${legalName || "submission"}`;

  const text =
    `Business verification details (enter into Twilio Trust Hub):\n\n` +
    fields.map((f) => `${f.label}: ${f.value || "—"}`).join("\n");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:620px;">
  <p style="font-weight:600;">Twilio business verification submission</p>
  <p style="color:#666;">Enter these into Twilio Trust Hub → Primary compliance profile.</p>
  <table style="border-collapse:collapse;">${fields
    .map(
      (f) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#666;vertical-align:top;">${esc(
          f.label,
        )}</td><td style="padding:3px 0;font-weight:500;">${esc(f.value || "—")}</td></tr>`,
    )
    .join("")}</table>
</div>`;

  try {
    await transportFor(profile).sendMail({ from: `"${fromName}" <${fromAddr}>`, to: recipients, subject, html, text });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

interface MeetingLead {
  name: string;
  businessName: string;
  email: string;
}

/**
 * NextGen AI meeting invite — sent to a prospect who agreed to (or is warm on)
 * the exploratory call. Includes the Cal.com booking link (BOOKING_LINK) so they
 * pick a time (Google Meet auto-created) + a short intake so Munir comes prepared.
 * Sent from the shared inbox with a "NextGen AI" display name; replies go to
 * NEXTGEN_REPLY_TO (else EMAIL_REPLY_TO). Never throws.
 */
export async function sendMeetingEmail(
  lead: MeetingLead,
  profile: EmailProfile = emailProfile("ai_meeting"),
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured(profile)) return { sent: false, reason: "email not configured" };
  if (!lead.email || !looksLikeEmail(lead.email)) {
    return { sent: false, reason: "no valid lead email" };
  }

  const first = lead.name.trim().split(/\s+/)[0] || "there";
  const bookingLink = process.env.BOOKING_LINK || "";
  const fromAddr = profile.user;
  const replyTo = profile.replyTo;

  const intake = [
    "What does your business do (in a sentence)?",
    "Roughly how many people on the team?",
    "The most time-consuming or manual part of your operation right now?",
    "Any tools/software you already use for it?",
  ];
  const bookLine = bookingLink
    ? `Grab a time that suits you here: ${bookingLink}`
    : `Just reply with a couple of times that work and I'll send a Google Meet invite.`;
  const bookLineHtml = bookingLink
    ? `Grab a time that suits you here: <a href="${esc(bookingLink)}">${esc(bookingLink)}</a>`
    : `Just reply with a couple of times that work and I'll send a Google Meet invite.`;

  const text = `Hi ${first},

Thanks for the quick chat — great to connect. As mentioned, this is a free, no-obligation exploratory call: I'll look at ${lead.businessName || "your business"} and bring a couple of concrete ways AI could save you time or money.

${bookLine}

To make the 20 minutes count, it'd help to know:
${intake.map((q) => `  • ${q}`).join("\n")}

Talk soon,
Munir
NextGen AI`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;">
  <p>Hi ${esc(first)},</p>
  <p>Thanks for the quick chat — great to connect. As mentioned, this is a free, no-obligation exploratory call: I'll look at <strong>${esc(lead.businessName || "your business")}</strong> and bring a couple of concrete ways AI could save you time or money.</p>
  <p>${bookLineHtml}</p>
  <p>To make the 20 minutes count, it'd help to know:</p>
  <ul>${intake.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
  <p>Talk soon,<br/>Munir<br/><strong>NextGen AI</strong></p>
</div>`;

  try {
    await transportFor(profile).sendMail({
      from: `"${profile.fromName}" <${fromAddr}>`,
      to: lead.email,
      replyTo,
      subject: "Your NextGen AI call — a couple of quick things",
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends the welcome email. Never throws — returns a small result the caller can
 * log. A failure here must never break the post-call webhook.
 */
export async function sendWelcomeEmail(
  lead: WelcomeLead,
  profile: EmailProfile = emailProfile("financing"),
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured(profile)) return { sent: false, reason: "email not configured" };
  if (!lead.email || !looksLikeEmail(lead.email)) {
    return { sent: false, reason: "no valid lead email" };
  }

  const { subject, html, text } = buildEmail(lead);

  // Gmail rewrites the From to the authenticated user, so the address IS the
  // profile's SMTP user; only the display name is customizable.
  const fromName = profile.fromName;
  const fromAddr = profile.user;
  const replyTo = profile.replyTo;

  try {
    await transportFor(profile).sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: lead.email,
      replyTo,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
