// Simulated live-call data that drives the LiveCallMonitor and LiveActivityFeed.
// It's demo material (the real thing streams from ElevenLabs webhooks), but it
// makes the console feel alive — which is the point of a calling console.

export interface LiveTurn {
  role: "agent" | "prospect";
  text: string;
  /** seconds from call start when this line lands */
  at: number;
}

export interface LiveCall {
  name: string;
  business: string;
  industry: string;
  number: string;
  turns: LiveTurn[];
  /** total call length in seconds */
  length: number;
}

export const LIVE_CALLS: LiveCall[] = [
  {
    name: "Omar Haddad",
    business: "Cedar Manufacturing",
    industry: "Manufacturing",
    number: "+13135550152",
    length: 30,
    turns: [
      { role: "agent", text: "Hi, is this Omar over at Cedar Manufacturing?", at: 1 },
      { role: "prospect", text: "Yeah, speaking. What's this about?", at: 4 },
      { role: "agent", text: "I'll be quick — we help manufacturers cover materials and payroll while they wait on receivables. Is that ever a squeeze for you?", at: 7 },
      { role: "prospect", text: "Honestly, yeah. We turn down orders because we're waiting 60 days to get paid.", at: 13 },
      { role: "agent", text: "That's exactly what a line's for — you fulfill the big order now instead of passing on it. Worth a quick chat with a specialist?", at: 19 },
      { role: "prospect", text: "Yeah, set that up. Mornings are best.", at: 26 },
    ],
  },
  {
    name: "Lena Ortiz",
    business: "Ortiz Family Dental",
    industry: "Dental",
    number: "+13055550129",
    length: 26,
    turns: [
      { role: "agent", text: "Hi, am I speaking with Dr. Ortiz?", at: 1 },
      { role: "prospect", text: "This is she.", at: 4 },
      { role: "agent", text: "Doctor, we help dental practices finance equipment and expansion. Anything like that on your radar this year?", at: 6 },
      { role: "prospect", text: "We've been pricing a new scanner, actually.", at: 12 },
      { role: "agent", text: "Perfect timing — that's one of the most common things we help finance. Let me have a specialist walk you through options, no obligation.", at: 17 },
      { role: "prospect", text: "Sure, send me some times.", at: 24 },
    ],
  },
];

export interface ActivityEvent {
  id: string;
  name: string;
  business: string;
  kind: "interested" | "callback" | "not_interested" | "voicemail" | "opted_out" | "dialing";
  text: string;
}

// A pool the feed cycles through, newest prepended on a timer.
export const ACTIVITY_POOL: ActivityEvent[] = [
  { id: "a1", name: "Grace Liu", business: "Evergreen Medical", kind: "interested", text: "Wants a payroll bridge — callback booked" },
  { id: "a2", name: "Raymond Ellis", business: "Ellis & Sons Roofing", kind: "dialing", text: "Dialing now…" },
  { id: "a3", name: "Tony Marchetti", business: "Marchetti's Trattoria", kind: "callback", text: "Asked for a callback after 3pm CT" },
  { id: "a4", name: "Frank Boone", business: "Boone Electrical", kind: "voicemail", text: "Voicemail — will retry tomorrow" },
  { id: "a5", name: "Sandra Okafor", business: "Okafor Plumbing", kind: "interested", text: "Needs capital for a second crew" },
  { id: "a6", name: "Kevin Zhang", business: "Summit IT", kind: "not_interested", text: "Already has a bank line" },
  { id: "a7", name: "Nina Petrova", business: "Petrova Wellness Spa", kind: "dialing", text: "Dialing now…" },
  { id: "a8", name: "Denise Park", business: "Park Ave Liquors", kind: "opted_out", text: "Requested removal — suppressed" },
  { id: "a9", name: "Dr. Priya Nadella", business: "Bright Smile Dental", kind: "interested", text: "Financing a new imaging machine" },
  { id: "a10", name: "Marcus Reyes", business: "Reyes Family HVAC", kind: "interested", text: "Expanding to a second truck" },
];
