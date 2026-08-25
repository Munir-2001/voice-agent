"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Trash2, Plus, Loader2, Users, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LeadList } from "@/lib/types";

// Manage lead lists: create, set the active list (the one the dialer calls),
// and delete. "Call all leads" clears the active list (dials the whole workspace).
export function LeadListsManager({ lists }: { lists: LeadList[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<number | "all" | "create" | null>(null);

  const anyActive = lists.some((l) => l.active);

  async function send(
    url: string,
    method: "POST" | "DELETE",
    body: unknown,
    label: number | "all",
  ) {
    setBusyId(label);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
        return false;
      }
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function activate(listId: number | null) {
    if (await send("/api/lists/activate", "POST", { listId }, listId ?? "all")) {
      toast.success(listId ? "List activated — the dialer will call it" : "Now calling all leads");
      startTransition(() => router.refresh());
    }
  }

  async function remove(listId: number, name: string) {
    if (!confirm(`Delete list “${name}”? Its leads stay, but become unassigned.`)) return;
    if (await send("/api/lists", "DELETE", { id: listId }, listId)) {
      toast.success("List deleted");
      startTransition(() => router.refresh());
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusyId("create");
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
      setNewName("");
      toast.success(`List “${name}” created`);
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Create */}
      <Card className="gap-0 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
            placeholder="New list name — e.g. “California HVAC — Aug”"
            className="h-9 min-w-[12rem] flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" disabled={!newName.trim() || busyId === "create"} onClick={create} className="gap-1.5">
            {busyId === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create list
          </Button>
        </div>
      </Card>

      {/* Call-all-leads row */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">All leads (no list filter)</p>
          <p className="text-xs text-muted-foreground">Dial the whole workspace, ignoring lists.</p>
        </div>
        {!anyActive ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" /> Active
          </span>
        ) : (
          <Button size="sm" variant="outline" disabled={busyId === "all" || pending} onClick={() => activate(null)}>
            {busyId === "all" ? <Loader2 className="size-4 animate-spin" /> : "Call all leads"}
          </Button>
        )}
      </Card>

      {/* Lists */}
      {lists.length === 0 ? (
        <Card className="border-dashed py-12 text-center text-sm text-muted-foreground">
          No lists yet. Create one above, then upload leads into it.
        </Card>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => (
            <Card key={l.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  {l.active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success-ink">
                      <CheckCircle2 className="size-3" /> Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {l.total} leads</span>
                  <span className="inline-flex items-center gap-1"><PhoneOutgoing className="size-3.5" /> {l.pending} pending</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {l.active ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="size-4" /> Calling this
                  </span>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === l.id || pending} onClick={() => activate(l.id)}>
                    {busyId === l.id ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4" />}
                    Set active
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-danger" disabled={busyId === l.id || pending} onClick={() => remove(l.id, l.name)} aria-label="Delete list">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
