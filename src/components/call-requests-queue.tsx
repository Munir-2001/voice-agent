"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  PhoneIncoming,
  Building2,
  Mail,
  Check,
  X,
  Loader2,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CallRequest } from "@/lib/types";

export function CallRequestsQueue({ initial }: { initial: CallRequest[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/call-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not update the request");
        return;
      }
      const newStatus = action === "approve" ? "approved" : "rejected";
      setRequests((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, status: newStatus, reviewedAt: new Date().toISOString() }
            : r,
        ),
      );
      toast[action === "approve" ? "success" : "message"](
        action === "approve" ? "Approved — added as a lead" : "Request rejected",
        {
          description:
            action === "approve"
              ? "Your active campaign will call them during business hours."
              : undefined,
        },
      );
      router.refresh();
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No call requests yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            When someone submits the &ldquo;request a demo AI call&rdquo; form on
            your site, it lands here for your approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <span className="flex h-1.5 w-1.5 rounded-full bg-warning" />
            Awaiting review · {pending.length}
          </h2>
          {pending.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <PhoneIncoming className="size-4 shrink-0 text-primary" />
                    <span className="font-medium">{r.name || "Someone"}</span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {formatPhone(r.phone)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {r.businessName && (
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="size-3.5" />
                        {r.businessName}
                        {r.industry ? ` · ${r.industry}` : ""}
                      </span>
                    )}
                    {r.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="size-3.5" />
                        {r.email}
                      </span>
                    )}
                  </div>
                  {r.message && (
                    <p className="text-sm text-foreground/90">
                      &ldquo;{r.message}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(r.createdAt)} · via {r.source}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "reject")}
                    className="gap-1.5"
                  >
                    {busy === r.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "approve")}
                    className="gap-1.5"
                  >
                    {busy === r.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Approve &amp; add lead
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {reviewed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Reviewed
          </h2>
          {reviewed.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                {r.status === "approved" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{r.name || "Someone"}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {formatPhone(r.phone)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  r.status === "approved"
                    ? "text-success"
                    : "text-muted-foreground",
                )}
              >
                {r.status}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
