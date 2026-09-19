"use client";
// Editor for a sequence's steps (emails). Each step is an independent card:
// edit subject / send-day / body HTML, toggle active, preview, save, delete.
// Body is raw HTML authored by the admin; the live preview renders inside a
// sandboxed <iframe srcDoc> so it never touches the app's DOM.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import type { SequenceStep } from "@/lib/outreach/data";

interface SequenceEditorProps {
  sequenceId: number;
  initialSteps: SequenceStep[];
}

export function SequenceEditor({ sequenceId, initialSteps }: SequenceEditorProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<SequenceStep[]>(initialSteps);
  const [adding, setAdding] = useState(false);

  async function addStep() {
    setAdding(true);
    try {
      const res = await fetch("/api/outreach/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not add the step");
      setSteps((prev) => [...prev, body.step as SequenceStep]);
      toast.success("Email added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the step");
    } finally {
      setAdding(false);
    }
  }

  function onDeleted(id: number) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No emails in this sequence yet. Add the first one below.
        </p>
      ) : (
        steps.map((step) => (
          <StepCard key={step.id} step={step} onDeleted={onDeleted} />
        ))
      )}
      <Button variant="outline" onClick={addStep} disabled={adding}>
        {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Add email
      </Button>
    </div>
  );
}

interface StepCardProps {
  step: SequenceStep;
  onDeleted: (id: number) => void;
}

function StepCard({ step, onDeleted }: StepCardProps) {
  const [subject, setSubject] = useState(step.subject);
  const [body, setBody] = useState(step.body_html);
  const [dayOffset, setDayOffset] = useState(String(step.day_offset));
  const [active, setActive] = useState(step.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/steps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: step.id,
          subject,
          body_html: body,
          day_offset: Number(dayOffset) || 0,
          active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success(`Email ${step.step_no} saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch("/api/outreach/steps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: step.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete");
      onDeleted(step.id);
      toast.success("Email removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <Card className={active ? undefined : "opacity-60"}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-16 shrink-0">
            <Label htmlFor={`day-${step.id}`}>Day</Label>
            <Input
              id={`day-${step.id}`}
              type="number"
              min={0}
              value={dayOffset}
              onChange={(e) => setDayOffset(e.target.value)}
            />
          </div>
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor={`subj-${step.id}`}>
              Subject <span className="text-muted-foreground">(#{step.step_no})</span>
            </Label>
            <Input
              id={`subj-${step.id}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id={`active-${step.id}`} checked={active} onCheckedChange={setActive} />
            <Label htmlFor={`active-${step.id}`}>Active</Label>
          </div>
        </div>

        {preview ? (
          <iframe
            title={`Preview of email ${step.step_no}`}
            srcDoc={body}
            className="h-96 w-full rounded-md border bg-white"
            sandbox=""
          />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="h-96 w-full rounded-md border bg-background p-3 font-mono text-xs leading-relaxed"
            placeholder="<p>Email body HTML — use {{firstName}}, {{company}}, {{demoLink}}</p>"
          />
        )}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {preview ? "Edit HTML" : "Preview"}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
