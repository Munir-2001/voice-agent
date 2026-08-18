"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface WorkspaceOption {
  id: number;
  name: string;
  slug: string;
}

// Compact segmented control for switching the active workspace. Renders nothing
// for users with a single workspace (e.g. partners) so Private stays invisible.
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceOption[];
  activeId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);

  if (workspaces.length <= 1) return null;

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

  return (
    <div className="rounded-lg border bg-card p-1">
      <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Workspace
      </div>
      <div className="flex gap-1">
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
    </div>
  );
}
