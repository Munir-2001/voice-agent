import { formatDistanceToNow } from "date-fns";

/** +14155550142 -> (415) 555-0142 */
export function formatPhone(e164: string): string {
  const m = e164.replace(/[^\d]/g, "").match(/^1?(\d{3})(\d{3})(\d{4})$/);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export function formatDuration(secs: number): string {
  if (secs <= 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "Jul 20, 6:10 PM" — date + time in the business timezone. */
export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Date + time in the LEAD's own US timezone, with the zone abbreviation so the
 * caller knows which clock it's on — e.g. "Mon, Aug 17, 2:00 PM EDT". Used for
 * callback times so you know exactly when to call back in the prospect's hours.
 */
export function formatDateTimeInTz(
  iso: string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: timezone || "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "—";
  }
}

/** Just the time + zone abbreviation in a given IANA tz — e.g. "10:32 AM PDT". */
export function formatShortTimeInTz(
  iso: string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: timezone || "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "—";
  }
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
