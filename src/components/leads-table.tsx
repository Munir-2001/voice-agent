"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadStatusBadge } from "@/components/status-badge";
import { formatPhone, relativeTime } from "@/lib/format";
import { LEAD_STATUS_META } from "@/lib/status";
import type { Lead, LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 200];
const STATUS_ORDER: LeadStatus[] = [
  "interested",
  "callback",
  "pending",
  "calling",
  "voicemail",
  "no_answer",
  "not_interested",
  "opted_out",
  "bad_number",
];

export function LeadsTable({
  leads,
  total,
  page,
  pageSize,
  q,
  status,
  statusCounts,
  callIdByLead = {},
}: {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  status: string;
  statusCounts: Record<string, number>;
  callIdByLead?: Record<string, string>;
}) {
  const router = useRouter();
  const [input, setInput] = useState(q);
  const [isPending, startTransition] = useTransition();
  const firstRender = useRef(true);

  // Build a /leads URL from the current params + a patch, and navigate.
  function go(patch: {
    page?: number;
    size?: number;
    q?: string;
    status?: string;
  }) {
    const next = { page, size: pageSize, q, status, ...patch };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.status && next.status !== "all") params.set("status", next.status);
    if (Number(next.page) > 1) params.set("page", String(next.page));
    if (Number(next.size) !== 50) params.set("size", String(next.size));
    startTransition(() => {
      router.replace(`/leads${params.toString() ? `?${params}` : ""}`);
    });
  }

  // Debounce the search box → re-query the DB (page reset to 1).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (input !== q) go({ q: input, page: 1 });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(page * pageSize, total);
  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const pills = [
    { value: "all", label: "All", count: allCount },
    ...STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => ({
      value: s,
      label: LEAD_STATUS_META[s].label,
      count: statusCounts[s],
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search name, business, or phone…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="pl-9"
        />
        {isPending && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* status filter pills (counts across the whole workspace) */}
      <div className="flex flex-wrap gap-1.5">
        {pills.map((p) => {
          const on = status === p.value;
          return (
            <button
              key={p.value}
              onClick={() => go({ status: p.value, page: 1 })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  on ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {p.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contact</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead className="text-right">Last called</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const callId = callIdByLead[lead.id];
                return (
                  <TableRow
                    key={lead.id}
                    className={callId ? "cursor-pointer" : ""}
                    onClick={callId ? () => router.push(`/calls/${callId}`) : undefined}
                  >
                    <TableCell>
                      <div className="font-medium">{lead.name.trim()}</div>
                      <div className="text-xs text-muted-foreground">{lead.businessName}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.industry}</TableCell>
                    <TableCell className="num-mask font-mono text-sm">{formatPhone(lead.phone)}</TableCell>
                    <TableCell>
                      <LeadStatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {lead.attempts}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {relativeTime(lead.lastCalledAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {leads.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No leads match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* pagination controls */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {fromN.toLocaleString()}–{toN.toLocaleString()} of {total.toLocaleString()}
          </span>
          <label className="flex items-center gap-1.5">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => go({ size: Number(e.target.value), page: 1 })}
              className="rounded-md border bg-card px-2 py-1 text-xs"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => go({ page: page - 1 })}
            className="gap-1"
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => go({ page: page + 1 })}
            className="gap-1"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
