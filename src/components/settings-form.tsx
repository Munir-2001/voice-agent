"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignSettings } from "@/lib/types";
import type { EleInventory } from "@/lib/agent/elevenlabs-inventory";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SettingsForm({
  settings,
  inventory,
}: {
  settings: CampaignSettings;
  inventory: EleInventory;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: settings.name,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    dailyCap: settings.dailyCap,
    callsPerTick: settings.callsPerTick,
    maxAttempts: settings.maxAttempts,
    goalType: settings.goalType,
    agentId: settings.agentId ?? "",
    callerNumberIds: settings.callerNumberIds ?? "",
    bookingLink: settings.bookingLink ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not save settings");
        return;
      }
      setDirty(false);
      toast.success("Settings saved");
      router.refresh(); // propagate the campaign name to the top bar + sidebar
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  // Currently-selected caller-number ids, parsed from the stored comma string.
  const selectedNumbers = new Set(
    form.callerNumberIds.split(",").map((s) => s.trim()).filter(Boolean),
  );
  function toggleNumber(id: string) {
    const next = new Set(selectedNumbers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set("callerNumberIds", Array.from(next).join(","));
  }
  const agentName = (id: string) =>
    inventory.agents.find((a) => a.id === id)?.name ?? id;

  const hasAgents = inventory.available && inventory.agents.length > 0;
  const hasNumbers = inventory.available && inventory.phoneNumbers.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Campaign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="name">Campaign name</Label>
          <Input
            id="name"
            value={form.name}
            maxLength={120}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Business Financing — Q3 Outbound"
          />
          <p className="text-xs text-muted-foreground">
            Shown in the top bar and sidebar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Which AI agent answers on this campaign, and the numbers it calls from.
            Leave the IDs blank to use the account defaults.
          </p>

          <div className="space-y-2">
            <Label>Campaign type</Label>
            <div className="grid grid-cols-2 gap-2">
              <GoalButton
                active={form.goalType === "financing"}
                onClick={() => set("goalType", "financing")}
                title="Financing"
                desc="Business capital outreach"
              />
              <GoalButton
                active={form.goalType === "ai_meeting"}
                onClick={() => set("goalType", "ai_meeting")}
                title="AI meeting"
                desc="Book an AI exploratory call"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agentId">Agent</Label>
            {hasAgents ? (
              <Select
                value={form.agentId}
                onValueChange={(v) => set("agentId", (v as string) ?? "")}
              >
                <SelectTrigger id="agentId" className="w-full">
                  <SelectValue placeholder="Account default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Account default</SelectItem>
                  {inventory.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // Fallback when ElevenLabs is unreachable: manual id entry.
              <Input
                id="agentId"
                value={form.agentId}
                onChange={(e) => set("agentId", e.target.value)}
                placeholder="agent_… (blank = account default)"
                className="font-mono text-sm"
              />
            )}
            {form.goalType === "ai_meeting" && !form.agentId.trim() && (
              <p className="text-xs text-warning-ink">
                An AI-meeting campaign needs its own agent, or it will answer as the
                financing agent.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Caller numbers</Label>
            {hasNumbers ? (
              <>
                <div className="space-y-1.5">
                  {inventory.phoneNumbers.map((p) => {
                    const checked = selectedNumbers.has(p.id);
                    const otherAgent =
                      p.assignedAgentId && p.assignedAgentId !== form.agentId;
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                          checked
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNumber(p.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="font-mono">{formatPhone(p.number)}</span>
                        {p.label && (
                          <span className="text-muted-foreground">· {p.label}</span>
                        )}
                        {checked && otherAgent && (
                          <span className="ml-auto text-xs text-warning-ink">
                            bound to {agentName(p.assignedAgentId!)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected numbers are rotated per call. None selected = account
                  default.
                </p>
              </>
            ) : (
              <Input
                value={form.callerNumberIds}
                onChange={(e) => set("callerNumberIds", e.target.value)}
                placeholder="phnum_aaa, phnum_bbb (blank = account default)"
                className="font-mono text-sm"
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Booking link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="bookingLink">Cal.com booking URL</Label>
          <Input
            id="bookingLink"
            type="url"
            value={form.bookingLink}
            onChange={(e) => set("bookingLink", e.target.value)}
            placeholder="https://cal.com/you/intro (blank = account default)"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            The link Mia sends after a qualifying call so the prospect can book.
            Each workspace has its own — connect it to your Google Calendar inside
            Cal.com. Leave blank to use the account default.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Calling hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Calls only place inside this window, in each lead&apos;s local timezone,
            Monday–Friday. This is enforced automatically.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Window opens</Label>
              <Input id="start" type="time" value={form.windowStart} onChange={(e) => set("windowStart", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">Window closes</Label>
              <Input id="end" type="time" value={form.windowEnd} onChange={(e) => set("windowEnd", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Pacing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The scheduler runs once a minute. &ldquo;Calls per tick&rdquo; is how
            many dials it places each time — set it to <strong>1</strong> for a
            steady one-call-per-minute pace. &ldquo;Daily cap&rdquo; is the hard
            stop for the day. Kept low so carriers don&apos;t flag your caller ID.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <NumField id="cap" label="Daily cap" value={form.dailyCap} onChange={(v) => set("dailyCap", v)} />
            <NumField id="tick" label="Calls per tick" value={form.callsPerTick} onChange={(v) => set("callsPerTick", v)} />
            <NumField id="attempts" label="Max attempts" value={form.maxAttempts} onChange={(v) => set("maxAttempts", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Caller numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="mb-3 text-sm text-muted-foreground">
            Outbound numbers, rotated per call. Registered on the Free Caller Registry.
          </p>
          {settings.numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No numbers configured yet — set them after importing your Twilio numbers.
            </p>
          ) : (
            settings.numbers.map((n, i) => (
              <div key={n}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{formatPhone(n)}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Healthy
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={!dirty || saving} onClick={save} className="gap-1.5">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function GoalButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}
