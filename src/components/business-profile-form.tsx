"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Company",
  "Corporation",
  "Co-operative",
  "Non-profit Corporation",
];

const INDUSTRIES = [
  "FINANCIAL", "FINTECH", "REAL_ESTATE", "PROFESSIONAL_SERVICES", "BANKING",
  "INSURANCE", "RETAIL", "HEALTHCARE", "HOSPITALITY", "CONSTRUCTION",
  "MANUFACTURING", "TECHNOLOGY", "AUTOMOTIVE", "EDUCATION", "LEGAL",
  "MEDIA", "TRANSPORTATION", "TRAVEL", "ENERGY", "AGRICULTURE", "OTHER",
];

const REG_ID_TYPES = ["EIN", "DUNS", "Business Registration Number", "Other"];
const BUSINESS_IDENTITY = ["Direct Customer", "ISV Reseller / Partner"];
const REGIONS = ["USA and Canada", "Latin America", "Europe", "Africa", "Asia"];
const JOB_POSITIONS = ["CEO", "CFO", "Director", "GM", "VP", "General Counsel", "Other"];

const initial = {
  legalName: "",
  businessType: "Limited Liability Company",
  industry: "FINANCIAL",
  regIdType: "EIN",
  regNumber: "",
  businessIdentity: "Direct Customer",
  websiteUrl: "https://lendingsuccesspot.com/",
  regions: "USA and Canada",
  street: "",
  street2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
  repFirstName: "",
  repLastName: "",
  repTitle: "",
  repJobPosition: "CEO",
  repEmail: "",
  repPhone: "",
  notes: "",
};

type Form = typeof initial;

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function BusinessProfileForm() {
  const [form, setForm] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const required: (keyof Form)[] = [
    "legalName", "businessType", "industry", "regIdType", "regNumber",
    "businessIdentity", "websiteUrl", "regions", "street", "city", "region",
    "postalCode", "country", "repFirstName", "repLastName", "repTitle",
    "repJobPosition", "repEmail", "repPhone",
  ];
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.repEmail.trim());
  const valid = required.every((k) => form[k].trim().length > 0) && emailOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast.error("Please fill in all fields with a valid email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not submit — please try again.");
        return;
      }
      setDone(true);
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <h2 className="text-xl font-semibold">Thank you — submitted!</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          We&apos;ve received your business details and will complete the phone
          verification with our provider. No further action is needed from you
          right now.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Business information">
        <Field label="Legal business name" hint="Exactly as registered with the government">
          <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Lending Success Pot LLC" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business type">
            <select className={selectClass} value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
              {BUSINESS_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Industry">
            <select className={selectClass} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
              {INDUSTRIES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration ID type" hint="EIN for US businesses">
            <select className={selectClass} value={form.regIdType} onChange={(e) => set("regIdType", e.target.value)}>
              {REG_ID_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Registration number" hint="e.g. EIN 12-3456789">
            <Input value={form.regNumber} onChange={(e) => set("regNumber", e.target.value)} placeholder="12-3456789" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business identity">
            <select className={selectClass} value={form.businessIdentity} onChange={(e) => set("businessIdentity", e.target.value)}>
              {BUSINESS_IDENTITY.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Regions of operation">
            <select className={selectClass} value={form.regions} onChange={(e) => set("regions", e.target.value)}>
              {REGIONS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Website">
          <Input value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://…" />
        </Field>
      </Section>

      <Section title="Business address">
        <Field label="Street address">
          <Input value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="123 Main Street" />
        </Field>
        <Field label="Suite / unit (optional)">
          <Input value={form.street2} onChange={(e) => set("street2", e.target.value)} placeholder="Suite 200" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State / region" hint="2-letter code, e.g. NC">
            <Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="NC" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ZIP / postal code">
            <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </Field>
          <Field label="Country" hint="2-letter code, e.g. US">
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="US" />
          </Field>
        </div>
      </Section>

      <Section title="Authorized representative" desc="A person Twilio can contact to confirm the business. They'll also complete a quick photo-ID + selfie check directly with the provider.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" hint="As on government ID">
            <Input value={form.repFirstName} onChange={(e) => set("repFirstName", e.target.value)} />
          </Field>
          <Field label="Last name" hint="As on government ID">
            <Input value={form.repLastName} onChange={(e) => set("repLastName", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business title" hint="e.g. Owner, President">
            <Input value={form.repTitle} onChange={(e) => set("repTitle", e.target.value)} />
          </Field>
          <Field label="Job position">
            <select className={selectClass} value={form.repJobPosition} onChange={(e) => set("repJobPosition", e.target.value)}>
              {JOB_POSITIONS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input type="email" value={form.repEmail} onChange={(e) => set("repEmail", e.target.value)} className={cn(form.repEmail && !emailOk && "border-danger")} />
          </Field>
          <Field label="Phone" hint="Include country code, e.g. +1…">
            <Input value={form.repPhone} onChange={(e) => set("repPhone", e.target.value)} placeholder="+1…" className="font-mono" />
          </Field>
        </div>
      </Section>

      <Section title="Anything else? (optional)">
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything we should know" />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" size="lg" disabled={!valid || busy} className="gap-2">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Submitting…" : "Submit details"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
