import { parsePhoneNumberFromString } from "libphonenumber-js";

// E.164 normalization for US numbers. Returns null if it can't be trusted.
// Kept US-only on purpose: the financing campaign + CSV upload target US leads.
export function toE164US(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// E.164 normalization restricted to an allowlist of countries (used by the instant
// demo). The caller passes a number that already carries its country code (e.g. the
// demo form prefixes the selected dial code: "+39 3331234567"). libphonenumber-js
// validates per-country and strips trunk prefixes ("+44 07911…" → "+447911…"). A
// number whose country isn't in `allowedCountries` (ISO-3166 alpha-2) is rejected,
// which keeps Twilio geo-permission + fraud exposure limited. Falls back to US when
// no "+" is present, and only if US is allowed.
export function toE164International(raw: string, allowedCountries?: readonly string[]): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (!parsed || !parsed.isValid()) return null;
    if (allowedCountries && (!parsed.country || !allowedCountries.includes(parsed.country))) return null;
    return parsed.number;
  }
  if (allowedCountries && !allowedCountries.includes("US")) return null;
  return toE164US(trimmed);
}

export function isValidUSPhone(raw: string): boolean {
  return toE164US(raw) !== null;
}

export function areaCode(e164: string): string | null {
  const m = e164.match(/^\+1(\d{3})/);
  return m ? m[1] : null;
}
