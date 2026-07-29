"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PhoneOutgoing, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Quick manual tests for go-live. Both endpoints place a REAL call / send a REAL
// email, gated to the signed-in session — so this panel only works logged in.
export function TestingPanel() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [callBusy, setCallBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const phoneValid = /^\+[1-9]\d{6,14}$/.test(phone.trim());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function placeTestCall() {
    setCallBusy(true);
    try {
      const res = await fetch("/api/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toNumber: phone.trim(),
          name: "Rosemarie",
          businessName: "Lending Success Pot",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Call could not be placed");
        return;
      }
      toast.success(`Calling ${phone.trim()}…`, {
        description: "Pick up — the agent will start talking.",
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
      </CardContent>
    </Card>
  );
}
