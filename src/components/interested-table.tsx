"use client";

import { useMemo, useState } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LeadStatusBadge } from "@/components/status-badge";
import { MarkContactedButton } from "@/components/mark-contacted";
import type { Lead, Call } from "@/lib/types";
import { formatPhone, formatDateTimeInTz, relativeTime } from "@/lib/format";

type Item = { lead: Lead; call: Call | null };

const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

const COLS =
  "grid grid-cols-[minmax(0,1.6fr)_9rem_8rem_minmax(0,1.4fr)_minmax(0,1.6fr)_8.5rem] items-center gap-3 px-4";

// Data-table view of warm leads (Interested / Callbacks). One row per lead with
// the conversation link as a plain, copyable, clickable column value — no card
// buttons. Searchable by name/business/email/phone/link.
export function InterestedTable({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const qDigits = digits(q);
    return items.filter(({ lead }) => {
      if (qDigits && digits(lead.phone).includes(qDigits)) return true;
      return (
        lead.name?.toLowerCase().includes(q) ||
        lead.businessName?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.meetingEmail?.toLowerCase().includes(q) ||
        lead.conversationUrl?.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, business, email, or phone…"
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className={`${COLS} border-b bg-muted/30 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground`}>
              <span>Lead</span>
              <span>Phone</span>
              <span>Status</span>
              <span>Callback</span>
              <span>Conversation</span>
              <span className="text-right">Action</span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No leads match “{query}”.
              </div>
            ) : (
              filtered.map(({ lead }) => (
                <div key={lead.id} className={`${COLS} border-b py-3 last:border-0`}>
                  {/* Lead */}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {lead.name?.trim() || "Unknown"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.businessName || lead.meetingEmail || lead.email || "—"}
                    </span>
                  </span>

                  {/* Phone */}
                  <a href={`tel:${lead.phone}`} className="font-mono text-xs hover:text-success">
                    {formatPhone(lead.phone)}
                  </a>

                  {/* Status */}
                  <span><LeadStatusBadge status={lead.status} /></span>

                  {/* Callback time (their local) */}
                  <span className="text-xs text-muted-foreground">
                    {lead.callbackAt
                      ? formatDateTimeInTz(lead.callbackAt, lead.timezone)
                      : <span className="opacity-60">Last spoke {relativeTime(lead.lastCalledAt)}</span>}
                  </span>

                  {/* Conversation link — plain, copyable, clickable */}
                  <span className="min-w-0">
                    {lead.conversationUrl ? (
                      <a
                        href={lead.conversationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={lead.conversationUrl}
                        className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-primary underline underline-offset-2 hover:opacity-80"
                      >
                        <span className="truncate">{lead.conversationUrl.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-70" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>

                  {/* Action */}
                  <span className="flex justify-end">
                    <MarkContactedButton leadId={lead.id} name={lead.name.trim() || "this lead"} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
