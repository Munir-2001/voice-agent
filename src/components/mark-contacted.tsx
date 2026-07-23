"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MarkContactedButton({ leadId, name }: { leadId: string; name: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      const res = await fetch("/api/leads/contacted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not mark contacted");
        return;
      }
      setDone(true);
      toast.success(`Marked ${name} as contacted`, {
        description: "Moved out of the interested queue.",
      });
      router.refresh(); // re-fetch the server components so the queue updates
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={done ? "secondary" : "default"} size="sm" disabled={done || busy} onClick={mark}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      {done ? "Contacted" : "Mark contacted"}
    </Button>
  );
}
