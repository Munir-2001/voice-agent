import "server-only";
// Billing safeguards for the dialer. Two independent protections:
//
//   1. Twilio balance gate (this file) — before spending on calls we check the
//      Twilio account balance. A drained Twilio account still lets ElevenLabs
//      CREATE a conversation (which is billed) that then fails at Twilio as a
//      0-second error — draining BOTH balances. Stopping BEFORE we place the call
//      is the only way to protect both at once.
//
//   2. Consecutive-failure circuit breaker (thresholds here, enforced in dialer.ts)
//      — catches provider problems a balance check can't see (account suspended,
//      auth error, ElevenLabs outage) by auto-pausing after N failures in a row.
//
// The balance is account-wide, so it's cached at module scope and shared across
// every workspace in a single cron run (≈1 Twilio API call per minute total).

const CACHE_MS = 60_000;
let cache: { at: number; balance: number | null } | null = null;

// Minimum Twilio balance (USD) below which ALL dialing stops. Configurable via
// env so you can raise the buffer without a deploy. Defaults to $1 (per request);
// a larger buffer (e.g. $5) is safer because a burst of in-flight calls can still
// overshoot a tight floor before the next balance check.
export function minBalanceUsd(): number {
  const v = Number(process.env.TWILIO_MIN_BALANCE_USD);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

// How many back-to-back failed placements trip the circuit breaker (auto-pause).
export function failureBreakerThreshold(): number {
  const v = Number(process.env.DIAL_FAILURE_BREAKER);
  return Number.isInteger(v) && v > 0 ? v : 5;
}

// The balance gate only works when the app can reach the Twilio API. Twilio creds
// historically lived ONLY inside ElevenLabs; set these in the app env to enable
// the gate. Absent → gate self-disables (fails open; the breaker still protects).
export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

// Current Twilio account balance in USD. Returns null when creds are absent or
// the API errors — callers FAIL OPEN (proceed to dial) and rely on the circuit
// breaker as the backstop, so a transient Twilio-status blip can't halt a healthy
// campaign. Cached 60s (including the null/error result) to avoid hammering.
export async function getTwilioBalance(force = false): Promise<number | null> {
  if (!twilioConfigured()) return null;
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) return cache.balance;

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Twilio balance ${res.status}: ${body.slice(0, 200)}`);
      cache = { at: now, balance: null };
      return null;
    }
    const data = (await res.json()) as { balance?: string; currency?: string };
    const bal = Number(data.balance);
    const balance = Number.isFinite(bal) ? bal : null;
    cache = { at: now, balance };
    return balance;
  } catch (err) {
    console.error(
      "Twilio balance fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    cache = { at: now, balance: null };
    return null;
  }
}

// Is the Twilio balance KNOWN and below the floor? Unknown balance (null) →
// low:false (fail open). `balance` is echoed back so callers can log/alert the
// exact figure.
export async function checkTwilioBalance(): Promise<{
  low: boolean;
  balance: number | null;
  floor: number;
}> {
  const balance = await getTwilioBalance();
  const floor = minBalanceUsd();
  return { low: balance != null && balance < floor, balance, floor };
}
