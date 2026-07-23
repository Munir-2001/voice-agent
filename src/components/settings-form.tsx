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
import type { CampaignSettings } from "@/lib/types";
import { formatPhone } from "@/lib/format";

export function SettingsForm({ settings }: { settings: CampaignSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: settings.name,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    dailyCap: settings.dailyCap,
    callsPerTick: settings.callsPerTick,
    maxAttempts: settings.maxAttempts,
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
            Spread dials across the day to protect number reputation. Kept low so
            carriers don&apos;t flag your caller ID.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <NumField id="cap" label="Daily cap" value={form.dailyCap} onChange={(v) => set("dailyCap", v)} />
            <NumField id="tick" label="Calls / 15 min" value={form.callsPerTick} onChange={(v) => set("callsPerTick", v)} />
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
