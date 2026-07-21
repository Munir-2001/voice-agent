import "server-only";

// Lightweight in-memory fixed-window rate limiter — a reasonable baseline that
// protects a single instance. NOTE: on serverless (Vercel) each instance has its
// own memory, so for strong, global limits back this with a shared store
// (e.g. @upstash/ratelimit + Upstash Redis). The call sites stay the same.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (store.size > 5000) {
    for (const [k, b] of store) if (now > b.resetAt) store.delete(k);
  }

  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}
