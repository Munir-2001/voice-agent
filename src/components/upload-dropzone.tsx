"use client";

import { useRef, useState } from "react";
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
  return {
    name: field(row, "name", "full name", "contact", "contact name"),
    business_name: field(row, "business_name", "business name", "business", "company", "company name"),
    phone: field(row, "phone", "phone number", "number", "mobile", "cell", "tel"),
    email: field(row, "email", "email address", "e-mail"),
    industry: field(row, "industry", "business type", "type"),
    state: field(row, "state", "st"),
  };
}

export function UploadDropzone() {
  const [drag, setDrag] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function doImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch("/api/leads/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Import failed", {
          description:
            res.status === 503
              ? "Connect Supabase (set the env vars) to save leads."
              : undefined,
        });
        return;
      }
      setImported(data as ImportResult);
      toast.success(`${data.imported} leads imported`, {
        description: "They'll be dialed during business hours.",
      });
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setImporting(false);
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
              {importing ? "Importing…" : `Import ${parsed.valid} leads`}
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
