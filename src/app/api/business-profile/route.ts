import { NextResponse } from "next/server";
import { z } from "zod";
import { sendBusinessProfileEmail, isEmailConfigured } from "@/lib/email";
import { isSameOrigin, clientIp, apiError } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// Public endpoint (no login): the client fills the business-verification form and
// it's emailed to the team to enter into Twilio Trust Hub. Same-origin + rate
// limited to deter abuse.

export const dynamic = "force-dynamic";

const s = (max = 200) => z.string().trim().max(max);
const Body = z.object({
  legalName: s(200).min(1),
  businessType: s(80).min(1),
  industry: s(80).min(1),
  regIdType: s(40).min(1),
  regNumber: s(80).min(1),
  businessIdentity: s(80).min(1),
  websiteUrl: s(200).min(1),
  regions: s(120).min(1),
  street: s(200).min(1),
  street2: s(200).optional().default(""),
  city: s(120).min(1),
  region: s(80).min(1),
  postalCode: s(40).min(1),
  country: s(80).min(1),
  repFirstName: s(80).min(1),
  repLastName: s(80).min(1),
  repTitle: s(120).min(1),
  repJobPosition: s(80).min(1),
  repEmail: z.string().trim().email(),
  repPhone: s(40).min(1),
  notes: s(1000).optional().default(""),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "Forbidden");
  const rl = rateLimit(`bizprofile:${clientIp(request)}`, 5, 60_000);
  if (!rl.ok) return apiError(429, "Too many requests");
  if (!isEmailConfigured()) return apiError(503, "Submissions aren't set up yet.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Please fill in all required fields.");
  const d = parsed.data;

  const fields = [
    { label: "Legal business name", value: d.legalName },
    { label: "Business type", value: d.businessType },
    { label: "Industry", value: d.industry },
    { label: "Registration ID type", value: d.regIdType },
    { label: "Registration number", value: d.regNumber },
    { label: "Business identity", value: d.businessIdentity },
    { label: "Website", value: d.websiteUrl },
    { label: "Regions of operation", value: d.regions },
    { label: "Street", value: d.street },
    { label: "Street (line 2)", value: d.street2 },
    { label: "City", value: d.city },
    { label: "State / region", value: d.region },
    { label: "Postal code", value: d.postalCode },
    { label: "Country", value: d.country },
    { label: "Representative — first name", value: d.repFirstName },
    { label: "Representative — last name", value: d.repLastName },
    { label: "Representative — business title", value: d.repTitle },
    { label: "Representative — job position", value: d.repJobPosition },
    { label: "Representative — email", value: d.repEmail },
    { label: "Representative — phone", value: d.repPhone },
    { label: "Notes", value: d.notes },
  ];

  const result = await sendBusinessProfileEmail(fields, d.legalName);
  if (!result.sent) return apiError(502, result.reason ?? "Could not submit");
  return NextResponse.json({ ok: true });
}
