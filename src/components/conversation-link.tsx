"use client";

import { useState } from "react";
import { Link2, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Copyable deep link to the exact conversation. Clicking copies the URL to the
// clipboard AND opens it in a new tab; the copy icon confirms the copy.
export function ConversationLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handle() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Conversation link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — still open the link.
      toast.message("Opening conversation…");
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handle}
      title={url}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Link2 className="size-3.5 shrink-0" />
      <span>Conversation</span>
      {copied ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Copy className="size-3.5 opacity-60" />
      )}
    </button>
  );
}
