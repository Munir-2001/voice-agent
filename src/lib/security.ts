import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

// ── Constant-time string comparison ─────────────────────────────────────────
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Shared-secret gate (dial-tick and other internal endpoints) ─────────────
// Fail closed in EVERY environment: no secret configured => reject.
export function hasValidCronSecret(request: Request): boolean {
  const provided = request.headers.get("x-cron-secret");
  return safeEqual(provided, process.env.CRON_SECRET);
}

// ── ElevenLabs post-call webhook signature (Svix-style: "t=…,v0=…") ─────────
// HMAC-SHA256 over `${timestamp}.${rawBody}`, plus a freshness window to stop
// replays. Fails closed if the secret isn't set. Confirm the exact header
// format against ElevenLabs' current docs before go-live.
const WEBHOOK_TOLERANCE_SECONDS = 30 * 60;

export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = parts["t"];
  const v0 = parts["v0"] ?? parts["v1"];
  if (!t || !v0) return false;

  // Reject stale/future timestamps (replay protection).
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return safeEqual(expected, v0.replace(/^v0=/, ""));
}

// ── Same-origin check for browser-initiated state-changing POSTs ────────────
// Do NOT use on webhook/cron endpoints (external callers have no same origin).
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ── Client IP (behind Vercel/proxies) ───────────────────────────────────────
// Used only as a rate-limit key, so it must be hard to spoof. The LEFTMOST
// X-Forwarded-For entry is client-supplied and trivially forged (letting an
// attacker rotate keys to dodge the limiter), so prefer the platform-set
// `x-real-ip`, then fall back to the RIGHTMOST XFF hop (appended by the trusted
// proxy), never the leftmost.
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
}

// ── Generic error response (never leak internals to the client) ─────────────
export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
