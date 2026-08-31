import Link from "next/link";
import { Phone, FileText, Building2, CalendarClock, Check, Mail, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkContactedButton } from "@/components/mark-contacted";
import { LeadStatusBadge } from "@/components/status-badge";
import type { Lead, Call } from "@/lib/types";
import { formatPhone, relativeTime, initials, formatDateTimeInTz } from "@/lib/format";

// A single warm-lead card, shared by the real Interested page and the Preview
// page. `preview` renders the action buttons inert (sample rows aren't backed by
// real DB records, so marking/transcript links would error).
export function InterestedCard({
  lead,
  call,
  preview = false,
}: {
  lead: Lead;
  call: Call | null;
  preview?: boolean;
}) {
  return (
    <Card className="hover-lift h-full gap-0 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {initials(lead.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{lead.name.trim() || "Unknown"}</h3>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" />
            {lead.businessName || lead.email || "—"}
          </p>
        </div>
        {(lead.status === "callback" || lead.status === "meeting_booked") && (
          <LeadStatusBadge status={lead.status} />
        )}
      </div>

      {(lead.meetingEmail || lead.meetingCity) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {lead.meetingEmail && (
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {lead.meetingEmail}
            </span>
          )}
          {lead.meetingCity && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {lead.meetingCity}
            </span>
          )}
        </div>
      )}

      {lead.callbackAt && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-muted px-3 py-2">
          <CalendarClock className="size-4 shrink-0 text-warning-ink" />
          <span className="text-sm text-warning-ink">
            Call back:{" "}
            <strong className="font-semibold">
              {formatDateTimeInTz(lead.callbackAt, lead.timezone)}
            </strong>{" "}
            <span className="opacity-70">(their local time)</span>
          </span>
        </div>
      )}

      {call?.summary && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          “{call.summary}”
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <div>
          <a
            href={`tel:${lead.phone}`}
            className="num-mask flex items-center gap-2 font-mono text-base font-medium tracking-tight hover:text-success"
          >
            <Phone className="size-4 text-success" />
            {formatPhone(lead.phone)}
          </a>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last spoke {relativeTime(lead.lastCalledAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {call &&
            (preview ? (
              <Button variant="ghost" size="sm" disabled className="gap-1.5 text-muted-foreground">
                <FileText className="size-4" />
                Transcript
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                className="gap-1.5 text-muted-foreground"
                render={<Link href={`/calls/${call.id}`} />}
              >
                <FileText className="size-4" />
                Transcript
              </Button>
            ))}
          {preview ? (
            <Button variant="default" size="sm" disabled className="gap-1.5">
              <Check className="size-4" />
              Mark contacted
            </Button>
          ) : (
            <MarkContactedButton leadId={lead.id} name={lead.name.trim() || "this lead"} />
          )}
        </div>
      </div>
    </Card>
  );
}
