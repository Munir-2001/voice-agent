import "server-only";
// Signed, tamper-proof tracking tokens for the open pixel / click redirect /
// unsubscribe links. A token is `base64url(payload).base64url(hmac)`; the routes
// verify the HMAC (constant-time) before trusting the payload, so nobody can
// forge an unsubscribe for someone else or point a click link anywhere they like.

import crypto from "crypto";

function secret(): string {
  return process.env.OUTREACH_TRACK_SECRET || process.env.CRON_SECRET || "";
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken<T = Record<string, unknown>>(token: string): T | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
