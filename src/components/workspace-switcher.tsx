"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface WorkspaceOption {
  id: number;
  name: string;
  slug: string;
}

// Compact segmented control for switching the active workspace, plus a "New
// workspace" action for owners. Renders nothing for a partner with a single
// workspace and no create rights (Private stays invisible to them).
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  canCreate = false,
}: {
  workspaces: WorkspaceOption[];
  activeId: number;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const showSwitch = workspaces.length > 1;
  if (!showSwitch && !canCreate) return null;

  async function switchTo(id: number) {
    if (id === activeId || pending !== null) return;
    setPending(id);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!res.ok) {
        toast.error("Could not switch workspace");
        return;
      }
      router.refresh(); // re-fetch all server data for the new workspace
    } catch {
      toast.error("Network error — could not switch workspace");
    } finally {
      setPending(null);
    }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not create workspace");
        return;
      }
      toast.success(`Workspace “${trimmed}” created`, {
        description: "It starts paused — set its agent and leads, then activate.",
      });
      setCreateOpen(false);
      setName("");
      router.refresh(); // the API already switched us into the new workspace
    } catch {
      toast.error("Network error — could not create workspace");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-1">
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </span>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-0.5 rounded text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3" />
              New
            </button>
          )}
        </div>
        {showSwitch && (
          <div className="flex flex-wrap gap-1">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => switchTo(w.id)}
                disabled={pending !== null}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-70",
                  w.id === activeId
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {pending === w.id && <Loader2 className="size-3 animate-spin" />}
                <span className="truncate">{w.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A separate campaign with its own agent, leads, numbers, and settings.
              It starts <strong>paused</strong> so nothing dials until you set it up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              maxLength={120}
              autoFocus
              placeholder="e.g. NextGen AI — Outreach"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  create();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={create} disabled={creating || !name.trim()} className="gap-1.5">
              {creating && <Loader2 className="size-4 animate-spin" />}
              {creating ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
