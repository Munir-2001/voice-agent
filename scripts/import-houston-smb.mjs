// Clean + import the scraped Houston SMB leads into Ava's workspace (ws1) under a
// new list. Replicates the /api/leads/upload transformations EXACTLY (phone
// normalization, status=pending, attempts=0, upsert on workspace_id+phone) so a
// script import is identical to a UI upload — plus a few deliberate improvements:
//
//   • timezone forced to America/Chicago. Every lead is Houston (Central), but
//     area codes 281/832/346/936 are absent from the app's abridged tz map and
//     would default to Eastern (calling an hour early). Central is correct.
//   • toll-free / uncallable numbers dropped (app's UNCALLABLE_AREA_CODES).
//   • HTML entities (&amp;) decoded in business names.
//   • industry mapped from the high-level category (col2 "business_domain") to a
//     value that matches an industry playbook, so Ava gets the right value hook.
//   • loan_need_signal stored in funding_use.
//   • contact name left EMPTY (no person in the data) so Ava greets "there",
//     not the first word of the business name.
//
// Usage:  node scripts/import-houston-smb.mjs --dry-run   (preview, no writes)
//         node scripts/import-houston-smb.mjs             (create list + insert)

import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const WORKSPACE_ID = 1; // Ava / financing
const LIST_NAME = "Houston SMB — Financing";
const CSV_PATH = "docs/rose outreach/houston_smb_raw.csv";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}
const SB = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// --- helpers replicated from the app (src/lib/*) ---
const toE164US = (raw) => {
  const d = (raw || "").replace(/[^\d]/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
};
const areaCode = (e164) => { const m = (e164 || "").match(/^\+1(\d{3})/); return m ? m[1] : null; };
const UNCALLABLE = new Set(["800","888","877","866","855","844","833","822","787","939","340","671","670","684"]);
const CAPS = new Set(["II","III","IV","JR","SR","LLC","DDS","MD","DVM","CPA","PHD"]);
const titleWord = (w) => {
  const bare = w.replace(/[.,]/g, "").toUpperCase();
  if (CAPS.has(bare)) return w.toUpperCase();
  if (w !== w.toUpperCase() && w !== w.toLowerCase()) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};
const cleanName = (raw) => {
  const s = (raw || "").replace(/\s+/g, " ").trim();
  if (!s || s.includes("@")) return "";
  return s.split(" ").map(titleWord).join(" ");
};
const decodeEntities = (s) =>
  (s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// High-level category (col2) → industry value that matches an industry playbook.
// Unmapped categories get their honest label (no playbook match → no hook, which
// is correct: better an empty hook than a wrong one).
const INDUSTRY_MAP = {
  "Restaurants / Food Service": "Restaurant",       // → restaurant playbook
  "Auto Repair": "Automotive",                       // → automotive playbook
  "Plumbing": "Plumbing",                            // → hvac/plumbing playbook
  "Construction / Contracting": "Construction",      // no playbook (honest, no hook)
  "Beauty Salon / Personal Care": "Beauty Salon",    // no playbook
  "Landscaping / Lawn Care": "Landscaping",          // no playbook
};

// --- minimal RFC4180-ish CSV parser (handles quoted fields w/ commas) ---
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const all = parseCsv(raw).filter((r) => r.length > 1 && r.some((c) => c.trim()));
  const header = all[0];
  const dataRows = all.slice(1);
  console.log(`Parsed ${dataRows.length} data rows (header: ${header.length} cols)\n`);

  const seen = new Set();
  const leads = [];
  const rejects = { invalid: 0, tollfree: 0, fictional: 0, duplicate: 0 };
  const dropped = [];
  // NANP reserved fictional range: exchange 555, line 0100–0199. Never connects.
  const isFictional = (e164) => /^\+1\d{3}55501\d{2}$/.test(e164);

  for (const r of dataRows) {
    const business_name = decodeEntities((r[0] || "").trim());
    const category = (r[1] || "").trim();
    const phoneRaw = (r[6] || "").trim();
    const state = (r[5] || "TX").trim().toUpperCase();
    const fundingUse = (r[8] || "").trim();

    const e164 = toE164US(phoneRaw);
    if (!e164) { rejects.invalid++; dropped.push(`INVALID phone: ${business_name} (${phoneRaw})`); continue; }
    if (UNCALLABLE.has(areaCode(e164))) { rejects.tollfree++; dropped.push(`TOLL-FREE: ${business_name} (${e164})`); continue; }
    if (isFictional(e164)) { rejects.fictional++; dropped.push(`FICTIONAL 555-01XX: ${business_name} (${e164})`); continue; }
    if (seen.has(e164)) { rejects.duplicate++; dropped.push(`DUP phone: ${business_name} (${e164})`); continue; }
    seen.add(e164);

    leads.push({
      workspace_id: WORKSPACE_ID,
      // list_id filled in after list creation
      name: "",                                   // no contact person in source
      business_name: cleanName(business_name),
      phone: e164,
      email: null,
      industry: INDUSTRY_MAP[category] || category,
      state,
      timezone: "America/Chicago",                // Houston = Central
      status: "pending",
      attempts: 0,
      consent_source: "",                          // cold scrape (matches prior cold-lead convention)
      funding_use: fundingUse || null,
      website: null,
    });
  }

  console.log(`CLEAN: ${leads.length} callable leads | rejects: ${JSON.stringify(rejects)}`);
  if (dropped.length) { console.log("\nDropped rows:"); dropped.forEach((d) => console.log("  -", d)); }
  console.log("\nSample (first 5):");
  leads.slice(0, 5).forEach((l) => console.log(`  ${l.phone} | ${l.industry.padEnd(12)} | ${l.business_name}`));

  // industry breakdown
  const byInd = {};
  for (const l of leads) byInd[l.industry] = (byInd[l.industry] || 0) + 1;
  console.log("\nIndustry breakdown:", JSON.stringify(byInd));

  if (DRY) { console.log("\n(dry-run — no list created, no leads written)"); return; }

  // 1) create (or reuse) the list in ws1
  const existing = await (await fetch(`${SB}/rest/v1/lead_lists?workspace_id=eq.${WORKSPACE_ID}&name=eq.${encodeURIComponent(LIST_NAME)}&select=id`, { headers: H })).json();
  let listId = existing[0]?.id;
  if (listId) {
    console.log(`\nReusing existing list "${LIST_NAME}" id=${listId}`);
  } else {
    const cr = await fetch(`${SB}/rest/v1/lead_lists`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ workspace_id: WORKSPACE_ID, name: LIST_NAME }) });
    if (!cr.ok) { console.error("list create failed:", cr.status, await cr.text()); process.exit(1); }
    listId = (await cr.json())[0].id;
    console.log(`\nCreated list "${LIST_NAME}" id=${listId}`);
  }

  // 2) upsert leads (on workspace_id,phone — ignore dupes, same as the app)
  const payload = leads.map((l) => ({ ...l, list_id: listId }));
  const ins = await fetch(`${SB}/rest/v1/leads?on_conflict=workspace_id,phone`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  if (!ins.ok) { console.error("insert failed:", ins.status, await ins.text()); process.exit(1); }
  const inserted = await ins.json();
  console.log(`Inserted/updated rows returned: ${inserted.length} (existing (ws1,phone) dupes ignored)`);

  // 3) verify count in the list
  const cnt = await fetch(`${SB}/rest/v1/leads?workspace_id=eq.${WORKSPACE_ID}&list_id=eq.${listId}&select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
  console.log(`Leads now in list ${listId}: ${cnt.headers.get("content-range")}`);
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });
