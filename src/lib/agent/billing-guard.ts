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

// A single probe of the Twilio account:
//   • balance   — USD balance, or null if we couldn't read it.
//   • inactive  — Twilio EXPLICITLY says the account is suspended/closed/not
//                 active. This is a hard STOP: the same account is what places
//                 the calls (via ElevenLabs), so if it's dead, every call fails
//                 as a 0-second billed error. We halt on this rather than fail open.
//   • unreachable — we couldn't determine status (network/transient). Fail OPEN;
//                 the circuit breaker is the backstop.
interface TwilioProbe {
  balance: number | null;
  inactive: boolean;
  unreachable: boolean;
}
let cache: { at: number; probe: TwilioProbe } | null = null;

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

// Basic-auth credentials for the Twilio REST API. PREFER an API Key (SK… + secret)
// — it's revocable and scoped, so it can be rotated without touching the account's
// master Auth Token — and fall back to the Account SID + Auth Token. Either way the
// request URL still uses the Account SID (set separately). Returns null when no
// usable pair is configured.
function twilioBasicAuth(): string | null {
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_CLIENT_SECRET;
  if (keySid && keySecret) {
    return Buffer.from(`${keySid}:${keySecret}`).toString("base64");
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token) {
    return Buffer.from(`${sid}:${token}`).toString("base64");
  }
  return null;
}

// The balance gate only works when the app can reach the Twilio API. Twilio creds
// historically lived ONLY inside ElevenLabs; set these in the app env to enable
// the gate. Absent → gate self-disables (fails open; the breaker still protects).
// Needs the Account SID (for the URL) plus either an API key pair or the Auth Token.
export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && twilioBasicAuth());
}

// Probe the Twilio account. Distinguishes three outcomes (see TwilioProbe):
// an explicit "account not active" (halt), a readable balance (gate on the floor),
// or an unreadable/transient state (fail open). Cached 60s (including errors) so a
// per-minute cron across N workspaces makes at most one Twilio call per minute.
async function probeTwilio(force = false): Promise<TwilioProbe> {
  const off: TwilioProbe = { balance: null, inactive: false, unreachable: true };
  if (!twilioConfigured()) return off;
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) return cache.probe;

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = twilioBasicAuth()!; // twilioConfigured() guarantees this is non-null
  const save = (probe: TwilioProbe) => {
    cache = { at: now, probe };
    return probe;
  };
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Twilio balance ${res.status}: ${body.slice(0, 200)}`);
      // A suspended/closed/inactive account is a DEFINITIVE "calls will fail" — the
      // creds authenticated enough for Twilio to report the account is not active.
      // Treat it as a hard stop, not a transient blip. A plain auth failure with no
      // such wording is treated as unreachable (fail open) — the app's Twilio creds
      // are separate from the ones ElevenLabs dials with, so a mere app-side typo
      // shouldn't halt a campaign that's actually placing calls fine.
      const inactive = /is not active|suspend|account.*(closed|deactivat|disabled)/i.test(body);
      return save({ balance: null, inactive, unreachable: !inactive });
    }
    const data = (await res.json()) as { balance?: string; currency?: string };
    const bal = Number(data.balance);
    return save({
      balance: Number.isFinite(bal) ? bal : null,
      inactive: false,
      unreachable: !Number.isFinite(bal),
    });
  } catch (err) {
    console.error(
      "Twilio balance fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return save({ balance: null, inactive: false, unreachable: true });
  }
}

// Current Twilio account balance in USD, or null if it couldn't be read.
export async function getTwilioBalance(force = false): Promise<number | null> {
  return (await probeTwilio(force)).balance;
}

// Should dialing STOP right now for a Twilio/billing reason? True when the account
// is explicitly inactive OR the balance is known and below the floor. An
// unreadable/transient state does NOT stop dialing (fail open; the circuit breaker
// backstops). `reason` is human-readable for the halt log/alert.
export async function checkTwilioBalance(): Promise<{
  stop: boolean;
  reason: string | null;
  balance: number | null;
  floor: number;
}> {
  const probe = await probeTwilio();
  const floor = minBalanceUsd();
  if (probe.inactive) {
    return {
      stop: true,
      reason: "Twilio account is suspended / not active — reactivate it in the Twilio console",
      balance: probe.balance,
      floor,
    };
  }
  if (probe.balance != null && probe.balance < floor) {
    return {
      stop: true,
      reason: `Twilio balance $${probe.balance.toFixed(2)} is below the $${floor.toFixed(2)} floor`,
      balance: probe.balance,
      floor,
    };
  }
  return { stop: false, reason: null, balance: probe.balance, floor };
}
