"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CallOutcomeBadge } from "@/components/status-badge";
import { Stagger, StaggerItem } from "@/components/motion";
import type { Call } from "@/lib/types";
import { formatPhone, formatDuration, relativeTime, initials, formatShortTimeInTz } from "@/lib/format";

const COLS =
  "grid grid-cols-[minmax(0,2.4fr)_minmax(0,3fr)_7rem_8rem_6rem] items-center gap-3 px-4";

// Digits only, dropping a leading US "1" so "+1 (206) 973-3020", "12069733020"
// and "2069733020" all compare equal.
function digitsOf(s?: string): string {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

// Chronological call list, shared by the real Call log and the Preview page.
// `preview` renders rows as static (sample calls have no real detail page).
export function CallLogTable({
  calls,
  preview = false,
}: {
  calls: Call[];
  preview?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return calls;
    const qDigits = digitsOf(q);
    const qText = q.toLowerCase();
    return calls.filter((c) => {
      // Number search (ignores formatting): match the other party's number or
      // the number we called from.
      if (qDigits) {
        const nums = `${digitsOf(c.contactNumber)} ${digitsOf(c.numberUsed)}`;
        if (nums.includes(qDigits)) return true;
      }
      // Also match by name/business so the box is generally useful.
      return (
        c.leadName?.toLowerCase().includes(qText) ||
        c.businessName?.toLowerCase().includes(qText)
      );
    });
  }, [calls, query]);

  return (
    <div className="space-y-3">
      {!preview && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="tel"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by phone number or name — e.g. (206) 973-3020"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className={`${COLS} border-b bg-muted/30 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground`}
            >
              <span>Lead</span>
              <span>Summary</span>
              <span>Outcome</span>
              <span>Contact · Dur.</span>
              <span className="text-right">When</span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No calls match “{query}”.
              </div>
            ) : (
              <Stagger>
                {filtered.map((c) => {
                  const inner = (
                    <>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {initials(c.leadName) || "?"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {c.leadName?.trim() || "Unknown"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.businessName || "—"}
                          </span>
                        </span>
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {c.summary || "—"}
                      </span>
                      <span>
                        <CallOutcomeBadge outcome={c.outcome} />
                      </span>
                      <span className="min-w-0 text-xs text-muted-foreground">
                        <span className="block truncate font-mono">
                          {c.contactNumber ? formatPhone(c.contactNumber) : "—"}
                        </span>
                        <span className="block tnum">{formatDuration(c.durationSecs)}</span>
                      </span>
                      <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        <span className="block">{relativeTime(c.startedAt)}</span>
                        {c.localTimezone && (
                          <span className="block opacity-70">
                            {formatShortTimeInTz(c.startedAt, c.localTimezone)} local
                          </span>
                        )}
                      </span>
                    </>
                  );
                  return (
                    <StaggerItem key={c.id}>
                      {preview ? (
                        <div className={`${COLS} border-b py-3 last:border-0`}>{inner}</div>
                      ) : (
                        <Link
                          href={`/calls/${c.id}`}
                          className={`${COLS} border-b py-3 transition-colors last:border-0 hover:bg-muted/50`}
                        >
                          {inner}
                        </Link>
                      )}
                    </StaggerItem>
                  );
                })}
              </Stagger>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
