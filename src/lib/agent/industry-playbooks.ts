// Industry-specific value framing. When a lead's industry is known, the agent
// injects the matching hook so the conversation feels personalized and speaks to
// what that owner actually spends capital on. Always sells the OUTCOME, not the loan.

export interface IndustryPlaybook {
  key: string;
  label: string;
  /** What owners in this industry typically use capital for. */
  uses: string[];
  /** A one-line, outcome-focused hook the agent can open the value framing with. */
  valueHook: string;
  /** Pain points to empathize with. */
  painPoints: string[];
}

export const INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  {
    key: "restaurant",
    label: "Restaurant",
    uses: ["Inventory & bulk food buys", "Kitchen equipment", "Staffing", "Slow-season cushion"],
    valueHook:
      "Financing helps you stock up before a busy stretch, cover payroll through the slow months, or fix that walk-in cooler before it costs you a weekend of service.",
    painPoints: ["Seasonal swings", "Thin margins", "Equipment breakdowns", "Rising food costs"],
  },
  {
    key: "medical",
    label: "Medical practice",
    uses: ["Bridging insurance reimbursements", "Payroll", "Equipment", "Expansion"],
    valueHook:
      "Most practices use a line to bridge the gap while insurance reimbursements catch up — so payroll and supplies never wait on a slow payer.",
    painPoints: ["Reimbursement delays", "Expensive equipment", "Staffing costs"],
  },
  {
    key: "dental",
    label: "Dental clinic",
    uses: ["Imaging & chairs", "New operatories", "Payroll", "Marketing"],
    valueHook:
      "Financing a new CBCT or extra operatory can pay for itself fast — more capacity means more patients through the door without draining your cash reserves.",
    painPoints: ["Costly equipment upgrades", "Reimbursement timing", "Expansion costs"],
  },
  {
    key: "hvac",
    label: "HVAC / Plumbing / Electrical",
    uses: ["Trucks", "Equipment & tools", "Hiring technicians", "Seasonal demand"],
    valueHook:
      "Another truck and tech on the road means more jobs you can actually say yes to during peak season — the capital turns into billable work.",
    painPoints: ["Seasonal demand spikes", "Cost of adding crews", "Upfront material costs on big jobs"],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    uses: ["Raw inventory", "Covering receivables", "Production capacity", "Equipment"],
    valueHook:
      "A line lets you buy materials and fulfill a big order now, instead of turning it down while you wait 60 days to get paid on the last one.",
    painPoints: ["Long receivables cycles", "Large upfront material costs", "Capacity limits"],
  },
  {
    key: "retail",
    label: "Retail / Liquor / Hardware store",
    uses: ["Inventory & bulk discounts", "Seasonal stock-up", "Store improvements", "Marketing"],
    valueHook:
      "Buying inventory in bulk or stocking up before your busy season often unlocks supplier discounts that more than cover the cost of the capital.",
    painPoints: ["Seasonal inventory swings", "Tied-up cash in stock", "Supplier terms"],
  },
  {
    key: "automotive",
    label: "Automotive business",
    uses: ["Parts inventory", "Shop equipment & lifts", "Hiring", "Bay expansion"],
    valueHook:
      "More bays or a key piece of equipment means more cars serviced per day — the capital converts straight into throughput.",
    painPoints: ["Expensive equipment", "Parts inventory costs", "Space constraints"],
  },
  {
    key: "hospitality",
    label: "Hotel / Hospitality",
    uses: ["Renovations", "Off-season payroll", "Furnishings", "Marketing"],
    valueHook:
      "Renovations and off-season cushions keep occupancy and reviews strong year-round — capital that protects your busy season's revenue.",
    painPoints: ["Strong seasonality", "High fixed costs", "Renovation cycles"],
  },
  {
    key: "professional-services",
    label: "Professional / IT services",
    uses: ["Payroll during ramp-ups", "Software & hardware", "Hiring", "Covering receivables"],
    valueHook:
      "When you land a big client, a line covers the hiring and tools to deliver — before the first invoice even clears.",
    painPoints: ["Payroll before invoices clear", "Client concentration", "Growth-stage cash gaps"],
  },
];

export function playbookForIndustry(industry: string): IndustryPlaybook | undefined {
  const q = industry.trim().toLowerCase();
  // Guard: a blank/near-blank industry must NOT match. `"label".includes("")`
  // is always true, so without this an empty industry silently matched the FIRST
  // playbook (restaurant) — the "walk-in cooler" hook bug.
  if (q.length < 3) return undefined;
  return INDUSTRY_PLAYBOOKS.find(
    (p) => q.includes(p.key) || p.label.toLowerCase().includes(q) || q.includes(p.label.toLowerCase()),
  );
}

// Automation-campaign value hooks (NextGen AI / Emma). SAME industries as above,
// but framed around saving time and never missing a customer — NEVER financing.
// Keyed by the playbook `key`; falls back to a strong generic line.
const AUTOMATION_HOOKS: Record<string, string> = {
  restaurant:
    "Most restaurants lose orders and reservations to missed calls during the rush — we can have every call and message answered and booked automatically, even at peak.",
  medical:
    "Practices lose patients to phones nobody can answer and endless scheduling back-and-forth — we automate the booking, reminders, and intake so the front desk isn't drowning.",
  dental:
    "A lot of the front-desk grind — booking, reminders, no-show follow-ups — can run itself, so your team fills the schedule instead of chasing it.",
  hvac:
    "Every missed call in this trade is a job going to whoever picked up first — we make sure every call and after-hours request gets answered and booked automatically.",
  manufacturing:
    "Quotes, order updates, and follow-ups eat hours of admin — we automate the repetitive back-office work so your team ships instead of chasing paperwork.",
  retail:
    "We automate the customer questions, order updates, and follow-ups that pull staff off the floor — so they sell instead of sitting on the phone.",
  automotive:
    "Missed calls and no-shows cost shops real revenue — we get every call answered and every appointment confirmed automatically, so the bays stay full.",
  hospitality:
    "Guest calls, bookings, and follow-ups can run around the clock automatically — so you capture every reservation without tying up the front desk.",
  "professional-services":
    "The intake, scheduling, and follow-up that eat your billable hours can run automatically — so you spend time on clients, not admin.",
};

const DEFAULT_AUTOMATION_HOOK =
  "Most owners are quietly losing hours — and the odd customer — to calls, follow-ups, and admin that a system could handle around the clock; that's exactly the kind of thing we help set up.";

// The automation-campaign equivalent of valueHook. Used by the NextGen agent so
// Emma never gets handed a lending/financing line.
export function automationHookForIndustry(industry: string): string {
  const p = playbookForIndustry(industry);
  return (p && AUTOMATION_HOOKS[p.key]) || DEFAULT_AUTOMATION_HOOK;
}
