"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { InterestedCard } from "@/components/interested-card";
import type { Lead, Call } from "@/lib/types";

type Item = { lead: Lead; call: Call | null };

const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

// Searchable grid of warm-lead cards, shared by the Interested and Callbacks
// pages. Search matches name, business, email, phone (ignoring formatting), and
// the conversation link.
export function QueueList({ items }: { items: Item[] }) {
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
    <div className="space-y-4">
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

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No leads match “{query}”.
        </p>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {filtered.map(({ lead, call }) => (
            <StaggerItem key={lead.id}>
              <InterestedCard lead={lead} call={call} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
