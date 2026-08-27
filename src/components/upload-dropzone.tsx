"use client";

import { useEffect, useRef, useState } from "react";
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

interface Parsed {
  fileName: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  sample: { name: string; phone: string; ok: boolean }[];
  rows: LeadRow[];
}

interface ImportResult {
  imported: number;
  rejected: { invalid: number; duplicate: number; suppressed: number };
}

// Case-insensitive header lookup — handles "Name", "name", " Phone ", etc.
// Values are coerced to string because Excel gives numbers for phone columns.
function field(row: Record<string, unknown>, ...names: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const target of names) {
    for (const key of Object.keys(row)) {
      if (norm(key) === target) return String(row[key] ?? "").trim();
    }
  }
  return "";
}

function mapRow(row: Record<string, unknown>): LeadRow {
  // Full name may be one column, or split first/last (e.g. "Person - Name" +
  // "Last Name" in the new list format) — combine them if so.
  const first = field(row, "name", "full name", "contact", "contact name", "person - name", "first name", "first", "owner details", "owner", "owner name", "contact person");
  const last = field(row, "last name", "last", "surname");
  const name = [first, last].filter(Boolean).join(" ").trim();
  return {
    name,
    business_name: field(row, "business_name", "business name", "business", "company", "company name"),
    phone: field(row, "phone", "phone number", "number", "mobile", "cell", "tel", "person - phone"),
    email: field(row, "email", "email address", "e-mail", "person - email"),
    industry: field(row, "industry", "business type", "type", "niche", "niche / industry", "niche/industry", "industry / niche"),
    state: field(row, "state", "st"),
    website: field(row, "company website", "website", "web", "url", "site"),
  };
}

interface ListLite {
  id: number;
  name: string;
  total: number;
}

export function UploadDropzone() {
  const [drag, setDrag] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Shared: turn raw rows (from CSV or Excel) into validated leads + preview.
  function processRows(raw: Record<string, unknown>[], fileName: string) {
    const seen = new Set<string>();
    let valid = 0,
      invalid = 0,
      duplicates = 0;
    const sample: Parsed["sample"] = [];
    const rows: LeadRow[] = [];

    for (const r of raw) {
      const row = mapRow(r);
      rows.push(row);
      const e164 = toE164US(row.phone);
      if (!e164) {
        invalid++;
        if (sample.length < 6)
          sample.push({ name: row.name || "—", phone: row.phone || "(blank)", ok: false });
        continue;
      }
      if (seen.has(e164)) {
        duplicates++;
        continue;
      }
      seen.add(e164);
      valid++;
      if (sample.length < 6) sample.push({ name: row.name || "—", phone: e164, ok: true });
    }

    setParsed({ fileName, total: raw.length, valid, invalid, duplicates, sample, rows });
    setBusy(false);
  }

  function handleFile(file: File) {
    setBusy(true);
    setImported(null);
    setParsed(null);

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
          processRows(rows, file.name);
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
      complete: (res) => processRows(res.data, file.name),
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
          body: JSON.stringify({
            rows: chunk,
            listId: listId ? Number(listId) : null,
          }),
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
        description: "They'll be dialed during business hours.",
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
            <span className="font-medium">phone</span> column; also reads name, email,
            business, industry, state
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
            <Button variant="ghost" size="sm" onClick={() => { setParsed(null); setImported(null); }}>
              Upload another
            </Button>
          </div>
        </Card>
      )}

      {/* Parsed preview (before import) */}
      {parsed && !imported && (
        <Card className="gap-0 p-5">
          <div className="flex items-center gap-2 border-b pb-4">
            <FileCheck2 className="size-4 text-success" />
            <span className="text-sm font-medium">{parsed.fileName}</span>
            <span className="text-sm text-muted-foreground">· {parsed.total} rows parsed</span>
          </div>

          <div className="grid grid-cols-3 gap-4 py-5">
            <Stat icon={<CircleCheck className="size-4 text-success" />} value={parsed.valid} label="Valid & ready" />
            <Stat icon={<CircleX className="size-4 text-danger" />} value={parsed.invalid} label="Invalid numbers" />
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
              Invalid numbers, in-file duplicates, and suppressed numbers are dropped on the server.
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
