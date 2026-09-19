"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  FileCheck2,
  CircleCheck,
  CircleX,
  ShieldBan,
  Loader2,
  ArrowRight,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toE164US } from "@/lib/phone";
import { cn } from "@/lib/utils";

// One lead row, mapped to our canonical fields from whatever the CSV headers are.
interface LeadRow {
  name: string;
  business_name: string;
  phone: string; // raw; server normalizes + validates authoritatively
  email: string;
  industry: string;
  state: string;
  website: string;
}

type FieldKey = keyof LeadRow;

// Special mapping sentinels (a field maps to a column name, or one of these).
const AUTO = "__auto__";
const NONE = "__none__";

// The canonical target fields, in display order. `aiUsed` = the AI reads this
// during the call (see src/lib/agent/outbound.ts dynamic_variables); surfaced in
// the coverage check so you know the call quality before importing.
const FIELDS: { key: FieldKey; label: string; aiUsed?: boolean; required?: boolean }[] = [
  { key: "phone", label: "Phone", required: true, aiUsed: true },
  { key: "business_name", label: "Business name", aiUsed: true },
  { key: "name", label: "Contact name", aiUsed: true },
  { key: "industry", label: "Industry", aiUsed: true },
  { key: "email", label: "Email" },
  { key: "state", label: "State" },
  { key: "website", label: "Website" },
];

const NAME_ALIASES = [
  "name", "full name", "contact", "contact name", "person - name", "first name",
  "first", "owner details", "owner", "owner name", "contact person",
];
const LAST_ALIASES = ["last name", "last", "surname"];
const ALIASES: Record<FieldKey, string[]> = {
  name: NAME_ALIASES,
  business_name: ["business_name", "business name", "business", "company", "company name"],
  phone: [
    "phone", "phone number", "number", "mobile", "cell", "tel", "person - phone",
    "company phone", "office phone", "business phone", "work phone", "phone 1",
    "primary phone", "direct phone",
  ],
  email: ["email", "email address", "e-mail", "person - email"],
  industry: [
    "industry", "business type", "type", "niche", "niche / industry",
    "niche/industry", "industry / niche", "source_query", "source query",
    "search query", "category",
  ],
  state: ["state", "st"],
  website: ["company website", "website", "web", "url", "site"],
};

const norm = (s: string) => s.trim().toLowerCase();
const isValidEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// First column whose normalized header matches one of the aliases.
function matchColumn(columns: string[], aliases: string[]): string {
  for (const a of aliases) {
    const hit = columns.find((c) => norm(c) === a);
    if (hit) return hit;
  }
  return "";
}

// The column Auto-detect would pick for a field (for the dropdown hint).
function detectedFor(field: FieldKey, columns: string[]): string {
  return matchColumn(columns, ALIASES[field]);
}

// Resolve one field's value for a row under the current mapping.
function cellValue(
  field: FieldKey,
  row: Record<string, unknown>,
  mapping: Record<FieldKey, string>,
  columns: string[],
): string {
  const m = mapping[field];
  if (m === NONE) return "";
  if (m !== AUTO) return String(row[m] ?? "").trim();

  // Auto: name combines first + last if the source splits them.
  if (field === "name") {
    const fc = matchColumn(columns, NAME_ALIASES);
    const lc = matchColumn(columns, LAST_ALIASES);
    const first = fc ? String(row[fc] ?? "").trim() : "";
    const last = lc ? String(row[lc] ?? "").trim() : "";
    return [first, last].filter(Boolean).join(" ").trim();
  }
  const col = matchColumn(columns, ALIASES[field]);
  return col ? String(row[col] ?? "").trim() : "";
}

function buildLeadRow(
  row: Record<string, unknown>,
  mapping: Record<FieldKey, string>,
  columns: string[],
): LeadRow {
  return {
    name: cellValue("name", row, mapping, columns),
    business_name: cellValue("business_name", row, mapping, columns),
    phone: cellValue("phone", row, mapping, columns),
    email: cellValue("email", row, mapping, columns),
    industry: cellValue("industry", row, mapping, columns),
    state: cellValue("state", row, mapping, columns),
    website: cellValue("website", row, mapping, columns),
  };
}

function defaultMapping(): Record<FieldKey, string> {
  return {
    name: AUTO, business_name: AUTO, phone: AUTO, email: AUTO,
    industry: AUTO, state: AUTO, website: AUTO,
  };
}

interface Parsed {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  sample: { name: string; phone: string; ok: boolean }[];
  coverage: Record<FieldKey, number>; // non-empty count per field
  rows: LeadRow[];
}

// Turn raw rows + the chosen mapping into importable leads + preview stats.
function computeParsed(
  raw: Record<string, unknown>[],
  mapping: Record<FieldKey, string>,
  columns: string[],
): Parsed {
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  let valid = 0, invalid = 0, duplicates = 0;
  const sample: Parsed["sample"] = [];
  const rows: LeadRow[] = [];
  const coverage = {
    name: 0, business_name: 0, phone: 0, email: 0, industry: 0, state: 0, website: 0,
  } as Record<FieldKey, number>;

  for (const r of raw) {
    const row = buildLeadRow(r, mapping, columns);
    rows.push(row);
    for (const f of FIELDS) if (row[f.key]) coverage[f.key]++;

    const e164 = toE164US(row.phone);
    const email = row.email.trim().toLowerCase();

    if (e164) {
      if (seenPhones.has(e164)) { duplicates++; continue; }
      seenPhones.add(e164);
      valid++;
      if (sample.length < 6) sample.push({ name: row.name || row.business_name || "—", phone: e164, ok: true });
      continue;
    }
    if (isValidEmail(email)) {
      if (seenEmails.has(email)) { duplicates++; continue; }
      seenEmails.add(email);
      valid++;
      if (sample.length < 6) sample.push({ name: row.name || row.business_name || "—", phone: `✉ ${email}`, ok: true });
      continue;
    }
    invalid++;
    if (sample.length < 6) sample.push({ name: row.name || row.business_name || "—", phone: row.phone || "(no phone/email)", ok: false });
  }

  return { total: raw.length, valid, invalid, duplicates, sample, coverage, rows };
}

interface ImportResult {
  imported: number;
  rejected: { invalid: number; duplicate: number; suppressed: number };
}

interface ListLite {
  id: number;
  name: string;
  total: number;
}

export function UploadDropzone() {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Raw parsed file + detected columns + the current column→field mapping.
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(defaultMapping);

  // Lead lists: the upload is tagged with the chosen list so you can run a
  // campaign on just that list. "" = no list (uploads into the general pool).
  const [lists, setLists] = useState<ListLite[]>([]);
  const [listId, setListId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((d) => setLists(d.lists ?? []))
      .catch(() => {});
  }, []);

  // Preview recomputes automatically whenever the file or the mapping changes.
  const parsed = useMemo<Parsed | null>(() => {
    if (rawRows.length === 0) return null;
    return computeParsed(rawRows, mapping, columns);
  }, [rawRows, mapping, columns]);

  function reset() {
    setRawRows([]);
    setColumns([]);
    setFileName("");
    setMapping(defaultMapping());
    setImported(null);
  }

  async function createList() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not create list");
        return;
      }
      const created = { id: data.list.id as number, name: data.list.name as string, total: 0 };
      setLists((prev) => [created, ...prev]);
      setListId(String(created.id));
      setNewName("");
      toast.success(`List “${created.name}” created`);
    } finally {
      setCreating(false);
    }
  }

  function ingest(raw: Record<string, unknown>[], name: string) {
    const rows = raw.filter((r) => r && Object.keys(r).length > 0);
    if (rows.length === 0) {
      toast.error("No rows found", { description: "Make sure the file has a header row and data." });
      setBusy(false);
      return;
    }
    setColumns(Object.keys(rows[0]));
    setMapping(defaultMapping());
    setRawRows(rows);
    setFileName(name);
    setImported(null);
    setBusy(false);
  }

  function handleFile(file: File) {
    setBusy(true);
    setImported(null);
    setRawRows([]);

    const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);
    if (isExcel) {
      file
        .arrayBuffer()
        .then((buf) => {
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]]; // first sheet
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            defval: "",
            blankrows: false,
          });
          ingest(rows, file.name);
        })
        .catch(() => {
          toast.error("Could not read that Excel file", {
            description: "Make sure it's a valid .xlsx/.xls with a header row.",
          });
          setBusy(false);
        });
      return;
    }

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => ingest(res.data, file.name),
      error: () => {
        toast.error("Could not read that file", { description: "Make sure it's a valid CSV." });
        setBusy(false);
      },
    });
  }

  // Upload in batches so lists of any size stay under the request-body limit.
  const BATCH = 4000;
  async function doImport() {
    if (!parsed) return;
    setImporting(true);
    setProgress({ done: 0, total: parsed.rows.length });
    const totals: ImportResult = {
      imported: 0,
      rejected: { invalid: 0, duplicate: 0, suppressed: 0 },
    };
    try {
      const rows = parsed.rows;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await fetch("/api/leads/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, listId: listId ? Number(listId) : null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Import failed", {
            description:
              res.status === 503
                ? "Connect Supabase (set the env vars) to save leads."
                : `Stopped near row ${i + 1}. ${totals.imported} imported before the error.`,
          });
          if (totals.imported > 0) setImported(totals);
          return;
        }
        totals.imported += data.imported ?? 0;
        totals.rejected.invalid += data.rejected?.invalid ?? 0;
        totals.rejected.duplicate += data.rejected?.duplicate ?? 0;
        totals.rejected.suppressed += data.rejected?.suppressed ?? 0;
        setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
      }
      setImported(totals);
      toast.success(`${totals.imported} leads imported`, {
        description: "Saved. Nothing is called until you activate the campaign and its list.",
      });
    } catch {
      toast.error("Network error — could not reach the server");
      if (totals.imported > 0) setImported(totals);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-6">
      {/* Target list — tag this upload so you can run a campaign on just it */}
      <Card className="gap-0 p-4">
        <label className="text-sm font-medium">Upload into list</label>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Tag these leads with a list, then activate that list on the Lists page to
          call it. Leave as “No list” to add to the general pool.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No list (general pool)</option>
            {lists.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} ({l.total})
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">or</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createList();
              }
            }}
            placeholder="New list name…"
            className="h-9 min-w-[10rem] flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" variant="outline" disabled={!newName.trim() || creating} onClick={createList}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </Card>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
          drag ? "border-primary bg-primary/5" : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/30",
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UploadCloud className="size-6 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium">
            {busy ? "Reading file…" : "Drop your contacts here (CSV or Excel)"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse · .csv, .xlsx, .xls · needs a{" "}
            <span className="font-medium">phone or email</span> column; map the rest
            after dropping
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xlsm,.xlsb,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {/* Post-import result */}
      {imported && (
        <Card className="gap-0 border-success/30 bg-success/[0.04] p-5">
          <div className="flex items-center gap-2">
            <CircleCheck className="size-5 text-success" />
            <span className="font-semibold">{imported.imported} leads imported</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Skipped: {imported.rejected.invalid} invalid ·{" "}
            {imported.rejected.duplicate} duplicate · {imported.rejected.suppressed} on the
            suppression list.
          </p>
          <div className="mt-4 flex gap-2 border-t pt-4">
            <Button variant="outline" size="sm" nativeButton={false} className="gap-1.5" render={<Link href="/leads" />}>
              View leads
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Upload another
            </Button>
          </div>
        </Card>
      )}

      {/* Column mapper + coverage (before import) */}
      {parsed && !imported && (
        <Card className="gap-0 p-5">
          <div className="flex items-center gap-2 border-b pb-4">
            <FileCheck2 className="size-4 text-success" />
            <span className="text-sm font-medium">{fileName}</span>
            <span className="text-sm text-muted-foreground">· {parsed.total} rows parsed</span>
          </div>

          {/* Mapping */}
          <div className="border-b py-4">
            <div className="mb-3 flex items-center gap-1.5">
              <Wand2 className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Map your columns
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => {
                const detected = f.key === "name"
                  ? matchColumn(columns, NAME_ALIASES)
                  : detectedFor(f.key, columns);
                const count = parsed.coverage[f.key];
                return (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <label className="flex min-w-[8rem] items-center gap-1.5 text-sm">
                      {f.label}
                      {f.required && <span className="text-danger">*</span>}
                      {f.aiUsed && (
                        <span
                          title="Used by the AI on the call"
                          className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary"
                        >
                          AI
                        </span>
                      )}
                    </label>
                    <select
                      value={mapping[f.key]}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className={cn(
                        "h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        count === 0 && "border-danger/40",
                      )}
                    >
                      <option value={AUTO}>
                        Auto{detected ? ` — ${detected}` : " — none found"}
                      </option>
                      {columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value={NONE}>Ignore</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coverage check */}
          <div className="border-b py-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Coverage ({parsed.total} rows)
            </p>
            <div className="flex flex-wrap gap-2">
              {FIELDS.map((f) => {
                const count = parsed.coverage[f.key];
                const pct = parsed.total > 0 ? Math.round((count / parsed.total) * 100) : 0;
                const ok = count > 0;
                return (
                  <span
                    key={f.key}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      ok
                        ? "border-success/30 bg-success/[0.06] text-foreground"
                        : "border-danger/30 bg-danger/[0.06] text-muted-foreground",
                    )}
                  >
                    {ok ? "✓" : "—"} {f.label}: {count}/{parsed.total} ({pct}%)
                  </span>
                );
              })}
            </div>
            {parsed.coverage.name === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No contact name detected — the AI will greet generically. That&apos;s fine
                for business lists; map a name column above if your file has one.
              </p>
            )}
          </div>

          {/* Import stats */}
          <div className="grid grid-cols-3 gap-4 py-5">
            <Stat icon={<CircleCheck className="size-4 text-success" />} value={parsed.valid} label="Valid & ready" />
            <Stat icon={<CircleX className="size-4 text-danger" />} value={parsed.invalid} label="No phone/email" />
            <Stat icon={<ShieldBan className="size-4 text-muted-foreground" />} value={parsed.duplicates} label="Duplicates in file" />
          </div>

          {parsed.sample.length > 0 && (
            <div className="space-y-1.5 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</p>
              {parsed.sample.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className={cn("font-mono text-xs", s.ok ? "text-muted-foreground" : "text-danger line-through")}>
                    {s.phone}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Rows with no phone/email, in-file duplicates, and suppressed numbers are dropped on the server.
            </p>
            <Button disabled={parsed.valid === 0 || importing} onClick={doImport} className="gap-1.5">
              {importing && <Loader2 className="size-4 animate-spin" />}
              {importing
                ? progress
                  ? `Importing… ${progress.done.toLocaleString()}/${progress.total.toLocaleString()}`
                  : "Importing…"
                : `Import ${parsed.valid} leads`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 py-4">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xl font-semibold tnum">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
