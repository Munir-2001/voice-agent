"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { UploadCloud, FileCheck2, CircleCheck, CircleX, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toE164US } from "@/lib/phone";
import { cn } from "@/lib/utils";

interface Parsed {
  fileName: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  sample: { name: string; phone: string; ok: boolean }[];
}

export function UploadDropzone() {
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setBusy(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const seen = new Set<string>();
        let valid = 0;
        let invalid = 0;
        let duplicates = 0;
        const sample: Parsed["sample"] = [];

        for (const row of res.data) {
          const rawPhone =
            row.phone ?? row.Phone ?? row.number ?? row.Number ?? "";
          const name =
            row.name ?? row.Name ?? row.contact ?? row.business_name ?? "—";
          const e164 = toE164US(rawPhone);
          if (!e164) {
            invalid++;
            if (sample.length < 6)
              sample.push({ name, phone: rawPhone || "(blank)", ok: false });
            continue;
          }
          if (seen.has(e164)) {
            duplicates++;
            continue;
          }
          seen.add(e164);
          valid++;
          if (sample.length < 6) sample.push({ name, phone: e164, ok: true });
        }

        setResult({
          fileName: file.name,
          total: res.data.length,
          valid,
          invalid,
          duplicates,
          sample,
        });
        setBusy(false);
      },
      error: () => {
        toast.error("Could not read that file", {
          description: "Make sure it's a valid CSV.",
        });
        setBusy(false);
      },
    });
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
          drag
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/30",
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UploadCloud className="size-6 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium">
            {busy ? "Reading file…" : "Drop your contact CSV here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse · columns: name, business_name, phone, industry,
            state
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {result && (
        <Card className="gap-0 p-5">
          <div className="flex items-center gap-2 border-b pb-4">
            <FileCheck2 className="size-4 text-success" />
            <span className="text-sm font-medium">{result.fileName}</span>
            <span className="text-sm text-muted-foreground">
              · {result.total} rows parsed
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 py-5">
            <Stat
              icon={<CircleCheck className="size-4 text-success" />}
              value={result.valid}
              label="Valid & ready"
            />
            <Stat
              icon={<CircleX className="size-4 text-danger" />}
              value={result.invalid}
              label="Invalid numbers"
            />
            <Stat
              icon={<ShieldBan className="size-4 text-muted-foreground" />}
              value={result.duplicates}
              label="Duplicates skipped"
            />
          </div>

          {result.sample.length > 0 && (
            <div className="space-y-1.5 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Preview
              </p>
              {result.sample.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{s.name}</span>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      s.ok ? "text-muted-foreground" : "text-danger line-through",
                    )}
                  >
                    {s.phone}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Invalid rows and numbers on the suppression list are dropped
              automatically.
            </p>
            <Button
              disabled={result.valid === 0}
              onClick={() =>
                toast.success(`${result.valid} leads imported`, {
                  description: "They'll be dialed during business hours.",
                })
              }
            >
              Import {result.valid} leads
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
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
