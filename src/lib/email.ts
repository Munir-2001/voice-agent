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
