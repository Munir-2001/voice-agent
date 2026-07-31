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

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

// Reused across warm invocations (module scope persists on a warm serverless
// instance), so we don't reconnect SMTP on every call.
let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT ?? 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
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

// Internal team who get a heads-up when a lead goes interested (comma-separated
// in EMAIL_NOTIFY, e.g. "naveed@gmail.com,rose@icloud.com").
export function notifyRecipients(): string[] {
  return (process.env.EMAIL_NOTIFY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface LeadNotification {
  name: string;
  businessName: string;
  phone: string;
  email: string | null;
  outcome: string;
  summary: string;
  callbackAt?: string | null;
}

/**
 * Internal alert to the team (Naveed / Rosemarie) that a lead is interested.
 * Sent regardless of whether the lead has an email, so the team always sees new
 * warm leads. Never throws.
 */
export async function sendLeadNotification(
  n: LeadNotification,
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured()) return { sent: false, reason: "email not configured" };
  const to = notifyRecipients();
  if (to.length === 0) return { sent: false, reason: "no EMAIL_NOTIFY recipients" };

  const fromName = process.env.EMAIL_FROM_NAME || COMPANY_NAME;
  const fromAddr = process.env.SMTP_USER!;
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
  if (n.callbackAt) rows.push(["Requested callback", n.callbackAt]);

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
    await getTransport().sendMail({
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
 * Emails a submitted business-verification form (for Twilio Trust Hub) to the
 * team so it can be entered into Twilio. Sent to EMAIL_NOTIFY, or
 * BUSINESS_PROFILE_EMAIL if set.
 */
export async function sendBusinessProfileEmail(
  fields: { label: string; value: string }[],
  legalName: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured()) return { sent: false, reason: "email not configured" };
  const to = (process.env.BUSINESS_PROFILE_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const recipients = to.length ? to : notifyRecipients();
  if (recipients.length === 0) return { sent: false, reason: "no recipients configured" };

  const fromName = process.env.EMAIL_FROM_NAME || COMPANY_NAME;
  const fromAddr = process.env.SMTP_USER!;
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
    await getTransport().sendMail({ from: `"${fromName}" <${fromAddr}>`, to: recipients, subject, html, text });
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
): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured()) return { sent: false, reason: "email not configured" };
  if (!lead.email || !looksLikeEmail(lead.email)) {
    return { sent: false, reason: "no valid lead email" };
  }

  const { subject, html, text } = buildEmail(lead);

  // Gmail rewrites the From to the authenticated user, so the address IS
  // SMTP_USER; only the display name is customizable. Replies go to Rose.
  const fromName = process.env.EMAIL_FROM_NAME || COMPANY_NAME;
  const fromAddr = process.env.SMTP_USER!;
  const replyTo = process.env.EMAIL_REPLY_TO || fromAddr;

  try {
    await getTransport().sendMail({
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
