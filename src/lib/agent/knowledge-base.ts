// Knowledge base — the facts the agent may rely on when a prospect asks.
// Editable without touching conversation logic. Kept plain-language and honest;
// nothing here promises approval or quotes specific rates.

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const KNOWLEDGE_BASE: FaqEntry[] = [
  {
    id: "line-of-credit",
    question: "What is a business line of credit?",
    answer:
      "It's flexible funding you can draw from whenever you need it, up to a set limit. You only pay for what you actually use, and as you repay it frees back up — like a safety net for cash flow, inventory, or unexpected costs.",
  },
  {
    id: "working-capital",
    question: "How does working capital work?",
    answer:
      "Working capital is short-term funding to cover day-to-day operations — payroll, inventory, supplies — especially when money coming in lags behind money going out. It smooths the gaps so the business keeps running.",
  },
  {
    id: "funding-time",
    question: "How long does funding take?",
    answer:
      "It varies by business and the type of financing — some are quick, others take longer once documents are reviewed. A specialist can give a realistic timeline for the specific situation. (The agent should not promise a specific number.)",
  },
  {
    id: "documents",
    question: "What documents are required?",
    answer:
      "Commonly a few months of recent business bank statements and basic business details. The exact list depends on the amount and type of financing — the specialist confirms it.",
  },
  {
    id: "industries",
    question: "What industries qualify?",
    answer:
      "A wide range — restaurants, medical and dental practices, contractors (HVAC, plumbing, electrical), manufacturers, retail, auto, hospitality, professional services and more. The specialist confirms fit.",
  },
  {
    id: "process",
    question: "What is the funding process?",
    answer:
      "Usually: a short conversation to understand the business, a quick review of basic documents, options presented, and if it's a fit, funding is arranged. The owner reviews everything and decides — no obligation to proceed.",
  },
  {
    id: "startups",
    question: "Can startups qualify?",
    answer:
      "Sometimes — newer businesses have fewer options, and it often depends on revenue and time in operation. The best step is to let a specialist look at the specifics rather than assume yes or no.",
  },
  {
    id: "existing-loans",
    question: "Can businesses with existing loans qualify?",
    answer:
      "Often yes. Many owners have existing financing and still add a line for flexibility or better terms. It depends on the overall picture, which the specialist reviews.",
  },
  {
    id: "cost",
    question: "Is there a cost to explore this?",
    answer:
      "No — looking at options and talking to a specialist carries no cost or obligation. Nothing happens unless the owner chooses to move forward after reviewing the terms.",
  },

  // ── Client-specific (ARF Financial products + funding partners) ──
  // Source: ARF 2026 product flyers + Loan Stars lending criteria. Vetted:
  // no "guaranteed" claims; amounts/rates framed as qualification-dependent.
  {
    id: "no-upfront-soft-pull",
    question: "Are there upfront fees, and will this hurt my credit?",
    answer:
      "No upfront fees, and the pre-approval is a soft check with no impact on your credit score. You can see what you may qualify for at no cost and no risk, and you only move forward if you choose to.",
  },
  {
    id: "funding-marketplace",
    question: "What kind of funding is this, and who do you work with?",
    answer:
      "We work with established, licensed lending partners to match your business with the best fit — so you get more than one bank's yes-or-no. The main options are revolving business lines of credit and working capital.",
  },
  {
    id: "funding-amounts",
    question: "How much funding can I get, and for how long?",
    answer:
      "Business lines of credit generally range from about $5,000 up to $1.5 million, with repayment terms up to 36 months. The actual amount depends on your revenue, credit, and underwriting — a specialist gives you real numbers.",
  },
  {
    id: "who-qualifies",
    question: "What does it take to qualify?",
    answer:
      "Requirements vary by program. As a general guide: a US-based business, operating at least about a month, with monthly sales roughly in the $5,000 to $17,000+ range depending on the program, and credit around the high-500s or better. More time in business, higher revenue, and stronger credit unlock larger lines and better terms. A specialist confirms your exact fit — approval, amount, and rate always depend on creditworthiness and underwriting.",
  },
  {
    id: "interest-only-options",
    question: "Do you have flexible or interest-only payment options?",
    answer:
      "Yes — several revolving lines include interest-only payment periods (from a few weeks up to a full year, depending on the product), which eases cash flow while you invest in growth. A specialist confirms what you qualify for.",
  },
  {
    id: "zero-interest-programs",
    question: "Do you have 0% interest options?",
    answer:
      "For qualified applicants, some programs offer an introductory 0% interest period (commonly around 12 to 20 months) before a standard rate applies. Qualification and terms depend on your business and credit, and a specialist confirms them — it's never guaranteed.",
  },
  {
    id: "simple-application",
    question: "How complicated is the application?",
    answer:
      "It's fast and simple — typically a few months of business bank statements and a short application, with guidance from the team throughout. It starts with the no-credit-impact pre-approval, then a specialist walks you through your options.",
  },
  {
    id: "bank-turndown",
    question: "My bank or an SBA loan turned me down — can you still help?",
    answer:
      "Often, yes. Because we work with multiple lending partners and look at more than credit alone — like revenue and cash flow — there are frequently options a single bank wouldn't offer. No guarantees, but it's worth a look.",
  },
  {
    id: "flexible-revolving",
    question: "How flexible is the credit line?",
    answer:
      "It's a revolving line — you draw as you need it, make unlimited partial paydowns, and reuse it for up to a year. Repayment isn't tied to your credit-card sales, and there's no penalty for paying off early.",
  },
  {
    id: "funding-speed",
    question: "How fast can I get funded?",
    answer:
      "It moves quickly — same-day approvals are common and many businesses are funded in under a week, with only minimal documentation to start.",
  },
  {
    id: "consolidate-debt",
    question:
      "I already have a merchant cash advance or short-term loan — can you help?",
    answer:
      "Possibly — some programs can pay off up to two existing advances or short-term loans and consolidate them into a more manageable structure. A specialist reviews your current balances to see if it makes sense.",
  },
];
