// Per-lead research — builds a short "pre-call brief" the agent sees before it
// dials, so it opens with context instead of a cold blank.
//
// Tier 1 (here, free, instant): infer from the email domain — a business domain
// strongly implies the person owns/works at a business; a free provider tells us
// nothing, so the agent must discover it live.
// Tier 2 (future, paid/keyed): enrich from a web/company-data lookup — see
// researchLeadDeep() stub at the bottom.

const FREE_EMAIL = new Set([
  "gmail.com", "yahoo.com", "icloud.com", "aol.com", "hotmail.com", "outlook.com",
  "live.com", "msn.com", "mail.com", "ymail.com", "gmx.com", "proton.me",
  "protonmail.com", "me.com", "comcast.net", "sbcglobal.net", "att.net", "verizon.net",
]);

const ROLE_LOCALPARTS = new Set([
  "info", "sales", "support", "contact", "admin", "office", "hello", "team",
  "accounts", "billing", "service", "help", "marketing",
]);

export interface LeadResearch {
  emailType: "business" | "personal" | "education" | "unknown";
  domain: string | null;
  isRoleAccount: boolean;
  /** One or two sentences the agent can act on. Injected as {{lead_brief}}. */
  brief: string;
}

interface LeadInput {
  name?: string | null;
  email?: string | null;
  businessName?: string | null;
  industry?: string | null;
}

export function researchLead(lead: LeadInput): LeadResearch {
  const email = (lead.email ?? "").trim().toLowerCase();
  const at = email.indexOf("@");
  const local = at > 0 ? email.slice(0, at) : "";
  const domain = at > 0 ? email.slice(at + 1) : null;
  const isRoleAccount = ROLE_LOCALPARTS.has(local);

  const business = (lead.businessName ?? "").trim();
  const industry = (lead.industry ?? "").trim();

  let emailType: LeadResearch["emailType"] = "unknown";
  if (domain) {
    if (domain.endsWith(".edu")) emailType = "education";
    else if (FREE_EMAIL.has(domain)) emailType = "personal";
    else emailType = "business";
  }

  const parts: string[] = [];

  // What we already know from the list.
  if (business) {
    parts.push(
      `They run ${business}${industry ? ` (${industry})` : ""} — reference it naturally.`,
    );
  } else if (industry) {
    parts.push(`They're in ${industry}.`);
  }

  // What the email tells us.
  if (emailType === "business" && domain) {
    parts.push(
      `Their email is on a business domain (${domain})${
        isRoleAccount ? " and it's a company role address (e.g. info@)" : ""
      }, so they very likely own or work at a business tied to that domain — read the domain name for a strong hint about the company, and confirm it early rather than assuming.`,
    );
  } else if (emailType === "personal") {
    parts.push(
      "We only have a personal email, so we don't yet know their business — find out early whether they own one and what kind before pitching anything.",
    );
  } else if (emailType === "education") {
    parts.push(
      "Their email is a university (.edu) address, so they may be a student or staff rather than a business owner — qualify gently before assuming they run a business.",
    );
  } else {
    parts.push(
      "We have very little on this lead — treat the opening as pure discovery: confirm who they are and whether they own a business.",
    );
  }

  return { emailType, domain, isRoleAccount, brief: parts.join(" ") };
}

// ── Tier 2 (future): deeper research via a web/company-data lookup ───────────
// Wire a search/enrichment API here (Serper/Tavily/Apollo/PDL) + optionally an
// LLM summary, then persist onto the lead so the agent and the human callback
// both get a richer brief. Kept as a no-op fallback for now.
export async function researchLeadDeep(lead: LeadInput): Promise<LeadResearch> {
  return researchLead(lead);
}
