"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download } from "lucide-react";
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

export function LeadsTable({
  leads,
  callIdByLead = {},
}: {
  leads: Lead[];
  callIdByLead?: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");

  // Build filter pills with live counts, only for statuses present in the data.
  const pills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
    const ordered: LeadStatus[] = [
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
    return [
      { value: "all", label: "All", count: leads.length },
      ...ordered
        .filter((s) => counts.has(s))
        .map((s) => ({ value: s, label: LEAD_STATUS_META[s].label, count: counts.get(s)! })),
    ];
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesQ =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.businessName.toLowerCase().includes(q) ||
        l.phone.includes(q);
      const matchesS = status === "all" || l.status === status;
      return matchesQ && matchesS;
    });
  }, [leads, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, business, or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="lg" className="gap-1.5">
          <Download className="size-4" />
          Export
        </Button>
      </div>

      {/* one-click status pills */}
      <div className="flex flex-wrap gap-1.5">
        {pills.map((p) => {
          const on = status === p.value;
          return (
            <button
              key={p.value}
              onClick={() => setStatus(p.value)}
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
                {p.count}
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
              {filtered.map((lead) => {
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
                    <TableCell className="font-mono text-sm">{formatPhone(lead.phone)}</TableCell>
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
              {filtered.length === 0 && (
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
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {leads.length} leads · rows with a call open the transcript.
      </p>
    </div>
  );
}
