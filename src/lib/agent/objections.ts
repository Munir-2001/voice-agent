// Objection-handling playbook. Each entry powers both the agent's system prompt
// and the dashboard "Agent" page. The pattern is always the same:
//   ACKNOWLEDGE (never argue) -> REFRAME (shift to their upside) ->
//   LIGHT VALUE (one concrete benefit) -> SOFT NEXT STEP (low commitment).

export interface Objection {
  id: string;
  /** What the prospect says (the trigger). */
  trigger: string;
  /** What they usually really mean. */
  intent: string;
  /** How the agent should respond. */
  approach: string;
  /** A natural sample line (kept human and brief). */
  example: string;
}

export const OBJECTIONS: Objection[] = [
  {
    id: "not-interested",
    trigger: "I'm not interested",
    intent: "Reflex brush-off before they know what it is — not a real 'no' yet.",
    approach:
      "Agree lightly, don't push. Drop the pitch, offer one benefit tied to their world, and ask for permission to ask a single question. If still no, exit warmly.",
    example:
      "Totally fair — I know you didn't plan on this call. A lot of {{industry}} owners I speak with feel the same until they hear it's just about having capital ready for when they actually need it. Mind if I ask one quick question, and if it's not useful I'll let you go?",
  },
  {
    id: "already-have-financing",
    trigger: "I already have financing / a bank line",
    intent: "They're covered and don't want to switch. Often open to better terms or a backup.",
    approach:
      "Congratulate them — it means they qualify. Position us as a backup line or a second option to compare, not a replacement. No pressure to leave their bank.",
    example:
      "That's great — honestly it means you're in a strong spot. A lot of owners keep a second line open as backup so they're never dependent on one lender, and some just like comparing terms. Would it be worth a quick look, no obligation?",
  },
  {
    id: "rates-too-high",
    trigger: "Rates are too high",
    intent: "Anchored on cost, not on what the capital could earn them.",
    approach:
      "Never quote a rate. Reframe from cost to opportunity — capital that funds a paying job or busy season often earns more than it costs. A specialist tailors real numbers to their business.",
    example:
      "I hear that a lot, and I'd never throw a number at you over the phone — it really depends on your business. The way most owners look at it: if the capital helps you land work or stock up before your busy season, it usually pays for itself. A specialist can show you actual options — worth a look?",
  },
  {
    id: "dont-need-money",
    trigger: "I don't need money / business is good",
    intent: "Things are fine, so why bother — doesn't see a trigger.",
    approach:
      "Reframe: the best time to set up capital is when you DON'T need it — approvals are easier and it sits as a safety net you only tap if you want. Zero cost to have it ready.",
    example:
      "That's actually the best position to be in — and the best time to get a line in place. When things are strong you qualify for better terms, and then it just sits there as a cushion you only use if the right opportunity or a slow month shows up. Nothing to pay unless you draw on it.",
  },
  {
    id: "send-info",
    trigger: "Just send me some information",
    intent: "Polite deferral — wants off the phone, may or may not read it.",
    approach:
      "Agree to send it, but capture email and pair it with a short specialist call so it's tailored — generic info rarely fits their situation. Confirm the address.",
    example:
      "Happy to send that over. The only thing is, generic info doesn't really tell you what YOUR business would qualify for — so most owners find a quick two-minute call with a specialist far more useful. I can do both. What's the best email for you?",
  },
  {
    id: "busy",
    trigger: "I'm busy right now",
    intent: "Genuinely occupied — timing problem, not an interest problem.",
    approach:
      "Respect it immediately, don't stretch the call. Offer to book a specific better time and confirm it. Keep it under a few seconds.",
    example:
      "No problem at all — I won't hold you. When's a better time, later today or tomorrow morning? I'll make sure someone reaches out then.",
  },
  {
    id: "call-later",
    trigger: "Call me later / another time",
    intent: "Soft yes with a timing condition.",
    approach:
      "Pin a concrete time rather than a vague 'later.' Confirm the number. Treat as a callback, not a rejection.",
    example:
      "Absolutely. So I get it right — would tomorrow around this time work, or is a different day better for you?",
  },
  {
    id: "how-did-you-get-number",
    trigger: "How did you get my number?",
    intent: "Guarded / suspicious. Wants legitimacy and control.",
    approach:
      "Be fully transparent, calm, and brief. Explain we reach out to business owners who may benefit from financing, and offer removal on the spot. Transparency builds trust.",
    example:
      "Fair question — we reach out to business owners who might benefit from flexible financing, and your business came up as a possible fit. If you'd rather not get these calls, I can take you off the list right now, no problem.",
  },
  {
    id: "are-you-ai",
    trigger: "Are you a robot? / Is this AI?",
    intent: "Wants honesty; may disengage if they feel deceived.",
    approach:
      "Answer honestly and immediately — yes, an AI assistant whose job is to see if it's worth connecting them with a human specialist. Honesty here keeps trust and is required.",
    example:
      "Good ear — yes, I'm an AI assistant. My job is just to understand your situation and, if it makes sense, connect you with a human loan specialist. No pressure either way.",
  },
  {
    id: "how-much-what-rate",
    trigger: "How much can I get? / What's the rate?",
    intent: "Genuine interest — buying signal. Wants specifics.",
    approach:
      "Treat as a positive signal. Don't quote numbers (compliance) — explain it depends on their revenue and history, and that's exactly what the specialist call determines. Move toward booking.",
    example:
      "Great question — and the honest answer is it depends on things like your monthly revenue and how long you've been running. That's exactly what a specialist figures out with you, usually in a short call. Should I set that up so you get real numbers?",
  },
  {
    id: "is-this-a-scam",
    trigger: "Is this a scam? / I don't trust this",
    intent: "Fear of fraud. Needs reassurance and legitimacy.",
    approach:
      "Stay calm and understanding — validate the caution. Emphasize transparency: no upfront fees to explore, a real specialist, they stay in control and verify everything before anything happens.",
    example:
      "I completely understand being careful — you should be. There's no cost or commitment to explore this, and nothing happens without you reviewing everything with a real specialist first. You're always in control. Would a quick, no-obligation call be worth it?",
  },
  {
    id: "bad-credit",
    trigger: "My credit isn't great",
    intent: "Assumes they'll be rejected; bracing for disappointment.",
    approach:
      "Reassure without promising approval. Explain that financing for businesses looks at more than personal credit — revenue and cash flow matter a lot. Let the specialist assess.",
    example:
      "I appreciate you being upfront. The good news is business financing usually looks at more than just credit — things like your revenue and cash flow carry a lot of weight. I can't promise anything, but it's often worth letting a specialist take a real look. Want me to set that up?",
  },
];
