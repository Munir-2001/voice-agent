import "server-only";
// Outreach mailer. Sends ONE sequence email over a dedicated cold-outreach SMTP
// inbox (OUTREACH_SMTP_*), kept separate from the transactional mail so cold
// sends never hurt billing/demo deliverability. Every send is rendered with the
// lead's merge variables, wrapped with click + open tracking, and given a
// CAN-SPAM footer (physical address + working unsubscribe).

import nodemailer, { type Transporter } from "nodemailer";
import { signToken } from "@/lib/outreach/tokens";

export interface OutreachProfile {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  postalAddress: string;
}

export function outreachProfile(): OutreachProfile {
  const user = process.env.OUTREACH_SMTP_USER || "";
  return {
    host: process.env.OUTREACH_SMTP_HOST || "",
    port: Number(process.env.OUTREACH_SMTP_PORT || 587),
    user,
    pass: process.env.OUTREACH_SMTP_PASS || "",
    fromName: process.env.OUTREACH_FROM_NAME || "Munir Abbasi",
    fromEmail: process.env.OUTREACH_FROM_EMAIL || user,
    replyTo: process.env.OUTREACH_REPLY_TO || process.env.OUTREACH_FROM_EMAIL || user,
    postalAddress: process.env.OUTREACH_POSTAL_ADDRESS || "",
  };
}

export function isOutreachConfigured(p: OutreachProfile = outreachProfile()): boolean {
  return Boolean(p.host && p.user && p.pass && p.fromEmail);
}

const transporters = new Map<string, Transporter>();
function transportFor(p: OutreachProfile): Transporter {
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

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Replace {{key}} (any spacing/case) with escaped values. Unknown vars are left
// blank rather than printed literally, so a stray {{foo}} never ships to a lead.
export function renderMerge(template: string, vars: Record<string, string>): string {
  const lookup = new Map(Object.entries(vars).map(([k, v]) => [k.toLowerCase(), v]));
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) =>
    esc(lookup.get(String(key).toLowerCase()) ?? ""),
  );
}

// Standard merge variables derived from a lead.
export function buildVars(lead: {
  name?: string | null;
  business_name?: string | null;
  industry?: string | null;
  email?: string | null;
}): Record<string, string> {
  const name = (lead.name ?? "").trim();
  const first = name.split(/\s+/)[0] || "there";
  const company = (lead.business_name ?? "").trim();
  return {
    name,
    firstName: first,
    first_name: first,
    company,
    business_name: company,
    industry: (lead.industry ?? "").trim(),
    email: (lead.email ?? "").trim(),
  };
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

// Rewrite every real http(s) link to route through the tracked click redirect,
// skipping links that are already ours (avoids double-wrapping the footer/pixel).
function wrapLinks(html: string, enrollmentId: string, stepNo: number, base: string): string {
  if (!base) return html;
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url: string) => {
    if (url.startsWith(`${base}/api/e/`)) return m;
    const token = signToken({ e: enrollmentId, s: stepNo, u: url, t: "c" });
    return `href="${base}/api/e/c/${token}"`;
  });
}

function footer(
  enrollmentId: string,
  stepNo: number,
  base: string,
  postalAddress: string,
): string {
  const unsub = base
    ? `${base}/api/e/u/${signToken({ e: enrollmentId, t: "u" })}`
    : "#";
  const pixel = base
    ? `<img src="${base}/api/e/o/${signToken({ e: enrollmentId, s: stepNo, t: "o" })}" width="1" height="1" alt="" style="display:none" />`
    : "";
  return (
    `<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />` +
    `<p style="font-size:12px;color:#8a8a8a;line-height:1.5">` +
    (postalAddress ? `${esc(postalAddress)}<br/>` : "") +
    `You're receiving this because we thought it was relevant to your business. ` +
    `<a href="${unsub}" style="color:#8a8a8a">Unsubscribe</a>.` +
    `</p>${pixel}`
  );
}

export interface OutreachSendInput {
  enrollmentId: string;
  stepNo: number;
  to: string;
  subject: string; // raw, with merge vars
  bodyHtml: string; // raw, with merge vars
  vars: Record<string, string>;
}

// Renders + tracks + sends one email. Throws on SMTP failure (the caller logs it).
export async function sendOutreachEmail(input: OutreachSendInput): Promise<void> {
  const p = outreachProfile();
  if (!isOutreachConfigured(p)) throw new Error("Outreach SMTP not configured");
  const base = appUrl();

  const subject = renderMerge(input.subject, input.vars);
  let html = renderMerge(input.bodyHtml, input.vars);
  html = wrapLinks(html, input.enrollmentId, input.stepNo, base);
  html += footer(input.enrollmentId, input.stepNo, base, p.postalAddress);

  await transportFor(p).sendMail({
    from: `"${p.fromName}" <${p.fromEmail}>`,
    to: input.to,
    replyTo: p.replyTo,
    subject,
    html,
  });
}
