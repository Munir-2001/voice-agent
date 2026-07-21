// E.164 normalization for US numbers. Returns null if it can't be trusted.
export function toE164US(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function isValidUSPhone(raw: string): boolean {
  return toE164US(raw) !== null;
}

export function areaCode(e164: string): string | null {
  const m = e164.match(/^\+1(\d{3})/);
  return m ? m[1] : null;
}
