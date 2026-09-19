"use client";
// Header actions for the Sequences library: seed the starter Soap Opera +
// Seinfeld sequences, or create a new empty one. Admin-only surface (the page
// is gated); these buttons POST to /api/outreach/*.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SequenceActionsProps {
  hasSequences: boolean;
}

export function SequenceActions({ hasSequences }: SequenceActionsProps) {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function seed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/outreach/seed", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Seeding failed");
      const created = body.created ?? 0;
      toast.success(
        created > 0
          ? `Added ${created} starter sequence${created === 1 ? "" : "s"}.`
          : "Starter sequences already exist.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/outreach/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not create the sequence");
      toast.success("Sequence created.");
      setName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the sequence");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={seed} disabled={seeding}>
        {seeding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {hasSequences ? "Re-seed starters" : "Seed starter sequences"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button size="sm">
              <Plus className="size-4" /> New sequence
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sequence</DialogTitle>
            <DialogDescription>
              An empty sequence. Add steps (emails) to it after creating.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="seq-name">Name</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Winback — RE Brokers"
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
