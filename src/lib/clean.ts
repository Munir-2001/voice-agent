// CSV cleaning helpers — normalize the messy real-world lead data before it
// lands in the database. Phone normalization/validation lives in phone.ts.

const CAPS_SUFFIX = new Set(["II", "III", "IV", "JR", "SR", "LLC", "DDS", "MD", "DVM", "CPA", "PHD"]);

function titleWord(w: string): string {
  const bare = w.replace(/[.,]/g, "").toUpperCase();
  if (CAPS_SUFFIX.has(bare)) return w.toUpperCase();
  // Leave already-mixed-case words alone (preserves McCrary, DeLisa, O'Brien).
  if (w !== w.toUpperCase() && w !== w.toLowerCase()) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Trim, collapse whitespace, and gently title-case a contact name. */
export function cleanName(raw?: string): string {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || s.includes("@")) return ""; // blank out emails/garbage in the name column
  return s.split(" ").map(titleWord).join(" ");
}

/** Lowercase + structurally validate an email; null if it isn't one. */
export function cleanEmail(raw?: string): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

const US_STATE = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

/** Normalize a US state to its 2-letter code when recognizable, else trimmed input. */
export function cleanState(raw?: string): string {
  const s = (raw ?? "").trim();
  if (US_STATE.has(s.toUpperCase())) return s.toUpperCase();
  return s;
}
