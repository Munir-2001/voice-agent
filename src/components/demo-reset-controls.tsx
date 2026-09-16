"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Self-service demo cleanup. "Reset" deletes a lead + its call rows by phone so
// that number can be demo-called again (for re-tests / recordings) — no more
// asking someone to clear the DB by hand. Hits the session-gated /api/demo-reset,
// which scopes the delete to the workspace you're currently viewing.
async function resetNumber(phone: string): Promise<{ deletedLeads: number; deletedCalls: number }> {
  const res = await fetch("/api/demo-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not reset that number");
  return data;
}

// Per-row delete on the demos table.
export function DeleteDemoButton({ phone, name }: { phone: string; name?: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!phone) {
      toast.error("This row has no number to reset");
      return;
    }
    const who = name ? `${name} (${phone})` : phone;
    if (!window.confirm(`Delete the demo record for ${who}?\n\nThis clears the lead + call so that number can get a fresh demo call.`)) {
      return;
    }
    setPending(true);
    try {
      await resetNumber(phone);
      toast.success(`Cleared ${phone} — it can be demo-called again.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset that number");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="xs" variant="destructive" disabled={pending} onClick={remove} className="gap-1">
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
      <span className="hidden sm:inline">{pending ? "Deleting…" : "Delete"}</span>
    </Button>
  );
}

// Manual reset box — for a number that's blocked but never produced a completed
// call (e.g. a failed/queued attempt), so it won't appear in the table below.
export function ResetNumberBox() {
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit() {
    const value = phone.trim();
    if (!value) {
      toast.error("Enter a number to reset");
      return;
    }
    setPending(true);
    try {
      const { deletedLeads, deletedCalls } = await resetNumber(value);
      if (deletedLeads === 0 && deletedCalls === 0) {
        toast.message("Nothing to clear", { description: `No demo record found for ${value} in this workspace.` });
      } else {
        toast.success(`Cleared ${value}`, { description: `Removed ${deletedLeads} lead + ${deletedCalls} call record(s).` });
      }
      setPhone("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset that number");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="tel"
        inputMode="tel"
        placeholder="+1… reset a number to re-test"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="h-8 w-56"
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={submit} className="gap-1.5">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {pending ? "Resetting…" : "Reset"}
      </Button>
    </div>
  );
}
