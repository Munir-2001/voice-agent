import "server-only";
// Sends the "welcome / next steps" email to a lead the moment the agent
// qualifies them as interested. The lead replies to THIS email with their
// documents, which land in Rose's inbox (EMAIL_REPLY_TO) — nothing sensitive is
// stored in our system. Uses Resend (https://resend.com) over plain fetch.
//
// Required env: RESEND_API_KEY, EMAIL_FROM ("Name <sender@your-domain>"),
// EMAIL_REPLY_TO (Rose's inbox). If any is missing we skip silently (dashboard
// still shows the interested lead), so a half-configured deploy never 500s.

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
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_REPLY_TO,
  );
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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [lead.email],
        reply_to: process.env.EMAIL_REPLY_TO, // document replies go to Rose
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: `resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
