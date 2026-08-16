"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PhoneOutgoing, Mail, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Quick manual tests for go-live. Both endpoints place a REAL call / send a REAL
// email, gated to the signed-in session — so this panel only works logged in.
export function TestingPanel() {
  const [phone, setPhone] = useState("");
  const [callName, setCallName] = useState("Rosemarie");
  const [callBusiness, setCallBusiness] = useState("Lending Success Spot");
  const [callIndustry, setCallIndustry] = useState("HVAC");
  const [email, setEmail] = useState("");
  const [callBusy, setCallBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  // Forgive missing "+"/country code: a plain 10-digit number → US (+1),
  // 11 digits starting with 1 → +1…. Anything with a "+" is left as typed.
  function normalizePhone(raw: string): string {
    const t = raw.trim();
    if (t.startsWith("+")) return t;
    const digits = t.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return t;
  }

  const normalizedPhone = normalizePhone(phone);
  const phoneValid = /^\+[1-9]\d{6,14}$/.test(normalizedPhone);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function placeTestCall() {
    setCallBusy(true);
    try {
      const res = await fetch("/api/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toNumber: normalizedPhone,
          name: callName.trim() || "there",
          businessName: callBusiness.trim(),
          industry: callIndustry.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Call could not be placed");
        return;
      }
      toast.success(`Calling ${normalizedPhone}…`, {
        description:
          "Pick up — the agent should greet you by this name and reference the business/industry. Afterward it appears in the Call log.",
      });
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setCallBusy(false);
    }
  }

  async function sendTestEmail() {
    setEmailBusy(true);
    try {
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: email.trim(), name: "Alex", businessName: "Cedar Comfort HVAC" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Email could not be sent");
        return;
      }
      toast.success(`Test email sent to ${email.trim()}`, {
        description: "Check the inbox (and spam) — it's the real welcome email.",
      });
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setEmailBusy(false);
    }
  }

  async function sendTestNotification() {
    setNotifyBusy(true);
    try {
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "notify" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Notification could not be sent");
        return;
      }
      const to: string[] = Array.isArray(data.sentTo) ? data.sentTo : [];
      toast.success("Test notification sent", {
        description: to.length
          ? `Sent to: ${to.join(", ")}. Check the inbox(es) and spam.`
          : "Check the EMAIL_NOTIFY inboxes (and spam).",
      });
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setNotifyBusy(false);
    }
  }

  return (
    <Card className="border-warning/30 bg-warning/[0.03]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Testing tools</CardTitle>
        <p className="text-sm text-muted-foreground">
          Place a real live call or send the real welcome email to yourself. Use
          these to verify the agent and email before going live.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test call */}
        <div className="space-y-2">
          <Label htmlFor="test-phone">Test call — phone number</Label>
          <div className="flex gap-2">
            <Input
              id="test-phone"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
            <Button onClick={placeTestCall} disabled={!phoneValid || callBusy} className="shrink-0 gap-1.5">
              {callBusy ? <Loader2 className="size-4 animate-spin" /> : <PhoneOutgoing className="size-4" />}
              Call me
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            E.164 format (with country code). The agent will call and talk live.
          </p>
          {/* Lead data sent to the agent — proves it reads dynamic variables. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="test-name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="test-name"
                placeholder="Rosemarie"
                value={callName}
                onChange={(e) => setCallName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-business" className="text-xs text-muted-foreground">
                Business
              </Label>
              <Input
                id="test-business"
                placeholder="Lending Success Spot"
                value={callBusiness}
                onChange={(e) => setCallBusiness(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-industry" className="text-xs text-muted-foreground">
                Industry
              </Label>
              <Input
                id="test-industry"
                placeholder="HVAC"
                value={callIndustry}
                onChange={(e) => setCallIndustry(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the lead data sent to the agent. If it greets you by this name
            and mentions the business/industry, it&apos;s reading the data correctly.
          </p>
        </div>

        {/* Test email */}
        <div className="space-y-2">
          <Label htmlFor="test-email">Test email — send welcome email to</Label>
          <div className="flex gap-2">
            <Input
              id="test-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button onClick={sendTestEmail} disabled={!emailValid || emailBusy} className="shrink-0 gap-1.5">
              {emailBusy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Send
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sends the exact email an interested lead receives.
          </p>
        </div>

        {/* Test team notification */}
        <div className="space-y-2">
          <Label>Test notification — alert the team (EMAIL_NOTIFY)</Label>
          <Button
            variant="outline"
            onClick={sendTestNotification}
            disabled={notifyBusy}
            className="gap-1.5"
          >
            {notifyBusy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            Send test notification
          </Button>
          <p className="text-xs text-muted-foreground">
            Sends a sample &ldquo;new interested lead&rdquo; alert to everyone on
            the EMAIL_NOTIFY list — the same email you&apos;ll get when a real
            lead qualifies. No call placed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
