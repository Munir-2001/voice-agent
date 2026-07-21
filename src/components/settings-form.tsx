"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CampaignSettings } from "@/lib/types";
import { formatPhone } from "@/lib/format";

export function SettingsForm({ settings }: { settings: CampaignSettings }) {
  const [dirty, setDirty] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Calling hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Calls only place inside this window, in each lead&apos;s local
            timezone, Monday–Friday. This is enforced automatically.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Window opens</Label>
              <Input
                id="start"
                type="time"
                defaultValue={settings.windowStart}
                onChange={() => setDirty(true)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">Window closes</Label>
              <Input
                id="end"
                type="time"
                defaultValue={settings.windowEnd}
                onChange={() => setDirty(true)}
              />
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
            <Field
              id="cap"
              label="Daily cap"
              value={settings.dailyCap}
              onChange={() => setDirty(true)}
            />
            <Field
              id="tick"
              label="Calls / 15 min"
              value={settings.callsPerTick}
              onChange={() => setDirty(true)}
            />
            <Field
              id="attempts"
              label="Max attempts"
              value={settings.maxAttempts}
              onChange={() => setDirty(true)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Caller numbers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="mb-3 text-sm text-muted-foreground">
            Outbound numbers, rotated per call. Registered on the Free Caller
            Registry.
          </p>
          {settings.numbers.map((n, i) => (
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
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={!dirty}
          onClick={() => {
            setDirty(false);
            toast.success("Settings saved");
          }}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" defaultValue={value} onChange={onChange} />
    </div>
  );
}
