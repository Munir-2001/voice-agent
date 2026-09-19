"use client";
// Campaigns surface: a table of existing campaigns with launch/pause actions,
// plus a 4-step builder (Audience → Sequence → Emails → Launch). Admin-only
// (the page is gated). All mutations POST/PATCH /api/outreach/campaigns.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Play, Pause, ArrowRight, ArrowLeft, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CampaignSummary } from "@/lib/outreach/data";

export interface ListOption {
  id: number;
  name: string;
  total: number;
}
export interface SequenceOption {
  id: number;
  name: string;
  stepCount: number;
}

interface CampaignsViewProps {
  campaigns: CampaignSummary[];
  lists: ListOption[];
  sequences: SequenceOption[];
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "outline",
  paused: "secondary",
};

export function CampaignsView({ campaigns, lists, sequences }: CampaignsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CampaignBuilder lists={lists} sequences={sequences} />
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">No campaigns yet</p>
          <p>Click New campaign to pick a list, attach a sequence, and launch.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>List</TableHead>
                <TableHead>Sequence</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "launch" | "pause" | "resume") {
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      if (action === "launch") {
        toast.success(`Launched — ${body.enrolled ?? 0} lead(s) enrolled.`);
      } else {
        toast.success(action === "pause" ? "Campaign paused." : "Campaign resumed.");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {campaign.name}
          {campaign.autoEnroll && (
            <Badge variant="secondary" className="font-normal">
              Auto-enroll
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[campaign.status] ?? "outline"}>
          {campaign.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {campaign.listName ?? "All leads"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {campaign.sequenceName ?? <span className="text-destructive">none</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{campaign.enrolled}</TableCell>
      <TableCell className="text-right tabular-nums">{campaign.sent}</TableCell>
      <TableCell className="text-right">
        {campaign.status === "active" ? (
          <Button variant="ghost" size="sm" onClick={() => act("pause")} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
            Pause
          </Button>
        ) : campaign.status === "paused" ? (
          <Button variant="ghost" size="sm" onClick={() => act("resume")} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Resume
          </Button>
        ) : (
          <Button size="sm" onClick={() => act("launch")} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Launch
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

const STEPS = ["Audience", "Sequence", "Emails", "Launch"] as const;

function CampaignBuilder({
  lists,
  sequences,
}: {
  lists: ListOption[];
  sequences: SequenceOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [listId, setListId] = useState<string>("");
  const [sequenceId, setSequenceId] = useState<string>("");
  const [fromIdentity, setFromIdentity] = useState("");
  const [dailyCap, setDailyCap] = useState("50");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [autoEnroll, setAutoEnroll] = useState(false);

  const chosenList = lists.find((l) => String(l.id) === listId);
  const chosenSequence = sequences.find((s) => String(s.id) === sequenceId);

  function reset() {
    setStep(0);
    setName("");
    setListId("");
    setSequenceId("");
    setFromIdentity("");
    setDailyCap("50");
    setWindowStart("09:00");
    setWindowEnd("17:00");
    setAutoEnroll(false);
  }

  const canNext =
    step === 0 ? name.trim().length > 0 : step === 1 ? sequenceId !== "" : true;

  async function submit(launch: boolean) {
    setSubmitting(true);
    try {
      const createRes = await fetch("/api/outreach/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          listId: listId ? Number(listId) : null,
          sequenceId: sequenceId ? Number(sequenceId) : null,
          fromIdentity: fromIdentity.trim() || undefined,
          dailyCap: Number(dailyCap) || 50,
          windowStart,
          windowEnd,
          autoEnroll,
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(created.error ?? "Could not create the campaign");
      const id = created.campaign?.id as number | undefined;

      if (launch && id) {
        const res = await fetch("/api/outreach/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action: "launch" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Created, but launch failed");
        toast.success(`Launched — ${body.enrolled ?? 0} lead(s) enrolled.`);
      } else {
        toast.success("Campaign saved as draft.");
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={
                i === step
                  ? "font-semibold text-foreground"
                  : i < step
                    ? "text-foreground"
                    : "text-muted-foreground"
              }
            >
              {i + 1}. {label}
              {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">›</span>}
            </li>
          ))}
        </ol>

        <div className="min-h-[12rem] space-y-4 py-2">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="camp-name">Campaign name</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. RE Brokers — March"
                />
              </div>
              <div className="space-y-2">
                <Label>Audience (lead list)</Label>
                <Select value={listId} onValueChange={(v) => setListId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="All leads in this workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name} ({l.total})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leads without an email address are skipped automatically.
                </p>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <Label>Sequence</Label>
              {sequences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sequences yet — seed or create one in Sequences first.
                </p>
              ) : (
                <Select value={sequenceId} onValueChange={(v) => setSequenceId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a sequence" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.stepCount} emails)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Review before launch:</p>
              <ul className="space-y-1">
                <li>
                  <span className="text-muted-foreground">Audience:</span>{" "}
                  <span className="font-medium">
                    {chosenList ? `${chosenList.name} (${chosenList.total} leads)` : "All leads"}
                  </span>
                </li>
                <li>
                  <span className="text-muted-foreground">Sequence:</span>{" "}
                  <span className="font-medium">
                    {chosenSequence
                      ? `${chosenSequence.name} — ${chosenSequence.stepCount} emails`
                      : "none"}
                  </span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Edit the email copy any time in Sequences. Sending respects the
                daily cap and send window set on the next step.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from-id">From identity (optional)</Label>
                <Input
                  id="from-id"
                  value={fromIdentity}
                  onChange={(e) => setFromIdentity(e.target.value)}
                  placeholder="Defaults to the OUTREACH_FROM_* env identity"
                />
              </div>
              <div className="flex gap-4">
                <div className="w-24 space-y-2">
                  <Label htmlFor="cap">Daily cap</Label>
                  <Input
                    id="cap"
                    type="number"
                    min={1}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                  />
                </div>
                <div className="w-28 space-y-2">
                  <Label htmlFor="wstart">Window start</Label>
                  <Input
                    id="wstart"
                    type="time"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div className="w-28 space-y-2">
                  <Label htmlFor="wend">Window end</Label>
                  <Input
                    id="wend"
                    type="time"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sends run weekdays only, in America/New_York, within this window.
              </p>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Switch
                  id="auto-enroll"
                  checked={autoEnroll}
                  onCheckedChange={setAutoEnroll}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="auto-enroll">Auto-enroll new demo signups</Label>
                  <p className="text-xs text-muted-foreground">
                    New instant-demo form submissions with an email join this
                    campaign automatically. Only one campaign can hold this —
                    turning it on here turns it off elsewhere.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => submit(false)} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Save draft
              </Button>
              <Button size="sm" onClick={() => submit(true)} disabled={submitting || !sequenceId}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                Launch
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
