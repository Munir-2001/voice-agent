// Area-code -> IANA timezone. Abridged map covering common US area codes;
// unknown codes fall back to Eastern (the safest for a 9am-6pm window since it
// opens the window latest in absolute time). Extend as needed.

const AREA_CODE_TZ: Record<string, string> = {
  // Pacific
  "213": "America/Los_Angeles", "310": "America/Los_Angeles", "415": "America/Los_Angeles",
  "408": "America/Los_Angeles", "206": "America/Los_Angeles", "503": "America/Los_Angeles",
  "619": "America/Los_Angeles", "702": "America/Los_Angeles", "916": "America/Los_Angeles",
  // Mountain
  "303": "America/Denver", "720": "America/Denver", "801": "America/Denver",
  "505": "America/Denver", "406": "America/Denver",
  // Arizona (no DST)
  "602": "America/Phoenix", "480": "America/Phoenix", "520": "America/Phoenix",
  // Central
  "312": "America/Chicago", "773": "America/Chicago", "713": "America/Chicago",
  "214": "America/Chicago", "512": "America/Chicago", "615": "America/Chicago",
  "313": "America/Detroit", "504": "America/Chicago", "210": "America/Chicago",
  // Eastern
  "212": "America/New_York", "646": "America/New_York", "917": "America/New_York",
  "305": "America/New_York", "404": "America/New_York", "470": "America/New_York",
  "617": "America/New_York", "202": "America/New_York", "215": "America/New_York",
  // Hawaii / Alaska
  "808": "Pacific/Honolulu", "907": "America/Anchorage",
};

const DEFAULT_TZ = "America/New_York";

export function timezoneForAreaCode(code: string | null): string {
  if (!code) return DEFAULT_TZ;
  return AREA_CODE_TZ[code] ?? DEFAULT_TZ;
}

/**
 * True when `now` falls inside [startHour, endHour) in the lead's local
 * timezone, Monday–Friday. Hours are 24h local (e.g. 9 and 18).
 */
export function isWithinCallingWindow(
  timezone: string,
  startHour: number,
  endHour: number,
  now: Date,
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourStr, 10) % 24;

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && hour >= startHour && hour < endHour;
}
