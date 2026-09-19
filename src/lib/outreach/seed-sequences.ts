// Starter outreach content — Russell Brunson Soap Opera (5-day arc for new
// leads) + Seinfeld (ongoing standalone) sequences, ported from
// docs/emailsequences/5_Day_Soap_Opera_Email_Sequence*.md.
//
// This is DATA only (no DB, no imports). The seed route
// (src/app/api/outreach/seed/route.ts) inserts these into email_sequences +
// email_steps for a workspace on demand. Bodies use only merge vars that
// src/lib/outreach/mailer.ts#buildVars supplies: {{firstName}}, {{name}},
// {{company}}/{{business_name}}, {{industry}}, {{demoLink}}. The original
// {{their city}} var is rephrased to "your market" so no step ever renders a
// blank. Links point at {{demoLink}} so the click tracker (wrapLinks) rewrites
// them automatically.

export type SeedStep = {
  step_no: number;
  day_offset: number; // days after enrollment this email fires
  subject: string;
  body_html: string;
};

export type SeedSequence = {
  name: string;
  kind: "soap_opera" | "seinfeld";
  steps: SeedStep[];
};

const soapOpera: SeedStep[] = [
  {
    step_no: 1,
    day_offset: 0,
    subject: "the $4,800 mistake most brokerages make every month",
    body_html: `
<p>Hey {{firstName}},</p>
<p>I'm Munir — I build AI phone systems for real estate teams.</p>
<p>I'm reaching out because I spent the last 3 months studying something that blew my mind: how many inbound calls brokerages actually miss.</p>
<p>The numbers are ugly.</p>
<p>The average team with 10+ agents misses 30–40% of incoming calls during business hours. After hours? Almost 100%. And 85% of those callers never call back — they just call the next brokerage on Google.</p>
<p>Here's a quick formula so you can see the damage for yourself:</p>
<blockquote><strong>Your Missed Call Revenue Formula:</strong><br>(Monthly inbound calls) × (your miss rate — probably 30%) × (average commission ÷ 10) = monthly revenue leak</blockquote>
<p>Most brokerages your size are sitting at $3,000–$8,000/month. Pull your call log right now and do the math. I'll wait.</p>
<p>But here's what's wild — I found something that fixes this almost overnight. And it doesn't involve hiring anyone.</p>
<p>I'll tell you exactly what it is tomorrow.</p>
<p>— Munir</p>
<p><em>P.S. If you're curious right now and don't want to wait, you can <a href="{{demoLink}}">see it in action here</a>. Fill out the form and you'll get a call back in 10 seconds. Yes, from the AI. Try it.</em></p>
`.trim(),
  },
  {
    step_no: 2,
    day_offset: 1,
    subject: "I almost gave up on this idea — then a broker changed my mind",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Yesterday I told you I found something that stops the revenue leak from missed calls. Let me tell you how I got here.</p>
<p>A few months ago, I was building AI voice technology and honestly wasn't sure who needed it most. I tried a bunch of industries.</p>
<p>Then I had a conversation with a broker in Florida. He told me something I couldn't stop thinking about:</p>
<blockquote>"Munir, I spend $3,000 a month on Zillow leads. Those leads call my office. My agents are in showings. The call goes to voicemail. The lead calls the next agent on Zillow — the one I'm PAYING to compete against. I'm literally funding my own competition."</blockquote>
<p>That hit me hard.</p>
<p>Before I continue — here's something you can share at your next team meeting:</p>
<blockquote><strong>The 60-Second Rule:</strong> 85% of callers who reach voicemail never call back. But here's the part nobody talks about — 67% of them call a competitor within 60 seconds. Your missed calls aren't just lost leads. They're leads you're handing to the brokerage down the street for free.</blockquote>
<p>Screenshot that. Send it to your agents. It'll change how they think about the phone.</p>
<p>Back to the story — that broker wasn't losing deals because of bad agents or a bad market. He was losing them because of a 30-second gap — the time between the phone ringing and nobody answering.</p>
<p>So I built something specifically for this. An AI receptionist that:</p>
<ul>
<li>Answers every call instantly — day, night, weekends</li>
<li>Qualifies the caller (buyer or seller? timeline? pre-approved? budget?)</li>
<li>Books them on the right agent's calendar automatically</li>
</ul>
<p>No hold music. No voicemail. No "someone will call you back."</p>
<p>But here's the part I didn't expect — and I'll share it tomorrow. It's what turned this from a "nice idea" into something that changes how teams operate.</p>
<p>— Munir</p>
<p><em>P.S. Want to hear it right now instead of reading about it? <a href="{{demoLink}}">Fill out the form here</a> and the AI will call you back in 10 seconds. Judge it yourself.</em></p>
`.trim(),
  },
  {
    step_no: 3,
    day_offset: 2,
    subject: "the part I didn't expect (this changes everything)",
    body_html: `
<p>Hey {{firstName}},</p>
<p>So yesterday I told you about the AI receptionist I built for real estate teams. Answers calls, qualifies leads, books appointments. That alone is powerful.</p>
<p>But here's the part that surprised even me.</p>
<p>The broker I was working with had 400+ leads sitting in his CRM. Old Zillow inquiries, open house sign-ins, website form fills from the last 6 months. His agents had cherry-picked the hot ones months ago and completely ignored the rest.</p>
<p>Dead leads, right? That's what everyone assumes.</p>
<p>So we pointed the AI outbound caller at those "dead" leads. It called them one by one. Natural voice. Conversational. Asked if they were still looking, what their timeline was, whether they'd been pre-approved.</p>
<p>In the first 48 hours, it booked 6 appointments from leads the team had written off.</p>
<p>Six.</p>
<p>That's when I realized this isn't just about answering the phone. It's about two things:</p>
<ol>
<li><strong>Inbound</strong> — Never miss another call. Every lead that calls gets answered, qualified, and booked.</li>
<li><strong>Outbound</strong> — Every lead in your CRM that's been ignored gets a second chance. The AI calls them, re-engages them, and books the ones who are ready.</li>
</ol>
<p>Together, it's like having a full-time ISA that works 24/7 — for a fraction of what you'd pay a human.</p>
<p>Now here's something free you can use whether you ever talk to me or not:</p>
<blockquote><strong>The 4-Question Lead Qualifying Script</strong><br><br>
Every inbound call should be qualified with these 4 questions before it hits an agent's calendar:<br><br>
1. "Are you looking to buy, sell, or both?"<br>
2. "What's your ideal timeline — this month, this quarter, or just exploring?"<br>
3. "Have you been pre-approved for financing yet?"<br>
4. "Is there a specific area or price range you're focused on?"<br><br>
If your front desk isn't asking these four questions on every call, your agents are wasting hours on unqualified leads. Print this out and tape it next to the phone.</blockquote>
<p>This is exactly what our AI asks on every call — automatically, every time, without forgetting or skipping steps. But even if you do it manually, these 4 questions will immediately improve your lead quality.</p>
<p>Tomorrow, I'll break down exactly what this costs and how it compares to what most teams are spending right now.</p>
<p>— Munir</p>
<p><em>P.S. Try it yourself — <a href="{{demoLink}}">fill out the form here</a>. The AI calls you back in 10 seconds. Pretend you're a buyer looking for a 3-bed in your market. You'll hear these qualifying questions in action.</em></p>
`.trim(),
  },
  {
    step_no: 4,
    day_offset: 3,
    subject: "$2K/month vs. the $4,800 you're losing (+ a free comparison chart)",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Let me lay out the math — because this is where it gets obvious.</p>
<p>First, here's a comparison chart. Save it. Share it. Use it even if you never buy from me:</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<thead><tr><th></th><th>ISA</th><th>Answering Service</th><th>AI Agent</th></tr></thead>
<tbody>
<tr><td>Monthly cost</td><td>$4,000–$5,000 + commission</td><td>$300–$1,500</td><td>~$2,000</td></tr>
<tr><td>Hours covered</td><td>9–5 weekdays</td><td>24/7</td><td>24/7</td></tr>
<tr><td>Books appointments?</td><td>Yes (when they feel like it)</td><td>No — takes messages only</td><td>Yes — instantly</td></tr>
<tr><td>Qualifies leads?</td><td>Sometimes</td><td>Never</td><td>Every single call</td></tr>
<tr><td>Ramp-up time</td><td>2–3 months</td><td>1 week</td><td>48 hours</td></tr>
<tr><td>Handles outbound follow-up?</td><td>If you're lucky</td><td>No</td><td>Yes — calls old leads automatically</td></tr>
<tr><td>Quits after 6 months?</td><td>Probably</td><td>N/A</td><td>Never</td></tr>
</tbody>
</table>
<p>Now the math:</p>
<p><strong>What most teams spend:</strong></p>
<ul>
<li>Full-time ISA salary: $3,500–$5,000/month + commission</li>
<li>Answering service: $300–$1,500/month (and they just take messages — they don't book)</li>
<li>Zillow/Realtor.com leads: $1,000–$3,000/month (but who's answering when they call?)</li>
</ul>
<p><strong>What you're losing:</strong></p>
<ul>
<li>If your team misses 30% of inbound calls (industry average)</li>
<li>And each missed call is worth $200–500 in potential commission</li>
<li>That's $3,000–$8,000/month walking out the door</li>
</ul>
<p><strong>What this costs:</strong></p>
<ul>
<li>AI receptionist + outbound caller: ~$2,000/month</li>
<li>Works 24/7. Never sick. Never quits. Never cherry-picks leads.</li>
<li>Answers in under 2 seconds. Books directly on your agents' calendars.</li>
</ul>
<p>Even if it only captures HALF the calls you're currently missing, it pays for itself 2-3x over. Every single month.</p>
<p>And unlike an ISA, it doesn't need training, doesn't take 3 months to ramp up, and doesn't leave after 6 months to go sell cars.</p>
<p>Here's what I'm NOT going to do: pressure you into a sales call. Instead, I want you to experience it.</p>
<p><a href="{{demoLink}}"><strong>Go here, fill out the form, and get a call back in 10 seconds.</strong></a> Judge it yourself.</p>
<p>If it's not impressive, ignore tomorrow's email. But if it is... I have something for you.</p>
<p>— Munir</p>
`.trim(),
  },
  {
    step_no: 5,
    day_offset: 4,
    subject: "one more thing before the weekend",
    body_html: `
<p>Hey {{firstName}},</p>
<p>This is my last email for the week. No cliffhanger this time — just an honest offer.</p>
<p>I've spent the last 4 days showing you the math behind missed calls, how the AI works for inbound and outbound, and why the ROI is hard to argue with.</p>
<p>But I know you're busy running a brokerage, not reading emails from some guy named Munir. So let me make this simple:</p>
<p><strong>Option A — Try it yourself right now (60 seconds)</strong></p>
<p><a href="{{demoLink}}">Go here, fill out the form</a>, and get a call back in 10 seconds. Pretend you're a buyer looking for a 3-bed in your market. Judge the AI yourself. No signup, no credit card, no follow-up unless you want it.</p>
<p><strong>Option B — Free 30-Minute Missed Call Audit (with me, personally)</strong></p>
<p>Reply "audit" and I'll book a call with you. On the call, I'll walk you through:</p>
<ul>
<li>How to pull your actual missed call data (most brokerages have never looked)</li>
<li>What those missed calls are costing you in real dollars</li>
<li>A live demo of the AI handling a buyer call customized for your market</li>
<li>Whether this makes sense for your team — or if there's a cheaper fix</li>
</ul>
<p>No contract. No pressure. Worst case, you spend 30 minutes and walk away knowing your numbers better than 95% of brokerages.</p>
<p>Either way, I appreciate you reading this far, {{firstName}}. Most people don't make it past email 1, so you're clearly someone who cares about running a tight operation.</p>
<p>Have a great weekend.</p>
<p>— Munir</p>
<p><em>P.S. This week I shared a few things you can use whether you ever buy from me or not:</em></p>
<ul>
<li><strong>Monday:</strong> The Missed Call Revenue Formula — calculate your exact monthly leak</li>
<li><strong>Wednesday:</strong> The 4-Question Qualifying Script — print it, tape it by the phone</li>
<li><strong>Thursday:</strong> The ISA vs. Answering Service vs. AI comparison chart</li>
</ul>
<p>Keep them. They'll help your team regardless.</p>
`.trim(),
  },
];

const seinfeld: SeedStep[] = [
  {
    step_no: 1,
    day_offset: 0,
    subject: "what pizza taught me about real estate",
    body_html: `
<p>Hey {{firstName}},</p>
<p>I ordered pizza last night. Called the first place — no answer. Called the second — no answer. Called the third — picked up on the first ring.</p>
<p>Guess who got my $35?</p>
<p>I didn't check reviews. I didn't compare menus. I didn't care that the first place had better ratings. I was hungry and someone picked up the phone.</p>
<p>Now multiply that $35 by a $5,000 commission.</p>
<p>That's the entire real estate inbound call problem — in one Friday night pizza order. The best brokerage doesn't always win the deal. The one that answers the phone does.</p>
<p>If you want to be the brokerage that always picks up: <a href="{{demoLink}}">try the 10-second demo</a>.</p>
<p>— Munir</p>
`.trim(),
  },
  {
    step_no: 2,
    day_offset: 3,
    subject: "my barber is beating your CRM",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Got a text from my barber yesterday: "Hey Munir, it's been 4 weeks — want me to book you in Thursday?"</p>
<p>I said yes. Took 3 seconds.</p>
<p>Meanwhile, most real estate CRMs have 500+ leads that haven't been touched in 6 months. Old Zillow inquiries. Open house sign-ins. Website form fills. Sitting there collecting dust.</p>
<p>My barber is using a $20 app. Your team has a $50,000 CRM. Something doesn't add up.</p>
<p>What if someone just... called those leads? Asked if they were still looking? Booked the ones who said yes?</p>
<p>That's literally what the AI outbound agent does. No human effort required.</p>
<p>Reply "audit" if you want me to show you how it works in 30 minutes.</p>
<p>— Munir</p>
`.trim(),
  },
  {
    step_no: 3,
    day_offset: 6,
    subject: "I mystery-shopped 10 brokerages — the results were painful",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Yesterday at 3pm on a Tuesday, I called 10 real estate brokerages in South Florida. Here's what happened:</p>
<ul>
<li>4 answered</li>
<li>6 went to voicemail</li>
<li>Of the 4 that answered, 2 put me on hold for over a minute</li>
<li>Only 2 actually asked me what I was looking for</li>
<li>Zero asked if I was pre-approved</li>
<li>Zero tried to book an appointment</li>
</ul>
<p>That means 80% of brokerages failed the most basic test: picking up the phone when a buyer calls during business hours.</p>
<p>3pm on a Tuesday. Not midnight. Not Sunday. The middle of a workday.</p>
<p>Your brokerage is probably better than that. But what about at 5:30pm? What about Saturday morning when your agents are in showings?</p>
<p>Try this: <a href="{{demoLink}}">fill out the form, get a call in 10 seconds</a>, and see what "never missing a call" actually feels like.</p>
<p>— Munir</p>
`.trim(),
  },
  {
    step_no: 4,
    day_offset: 9,
    subject: "he trained an ISA for 3 months — then she quit",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Talked to a broker last week. He told me he spent 3 months training an ISA — scripts, role-plays, CRM access, the whole thing. She was finally hitting her stride. Booking 8-10 appointments a week.</p>
<p>Then she left. Got a job at a tech company. Higher base salary, less rejection.</p>
<p>He was back to square one. Three months of training, gone. And the leads kept calling — straight to voicemail.</p>
<p>This is the hidden cost nobody talks about with ISAs. It's not just the $4,500/month salary. It's the 3 months of ramp-up you lose every time someone quits. In real estate, that's every 6-8 months on average.</p>
<p>The AI doesn't quit. Doesn't need training. Doesn't have bad days. And it costs less than half of what he was paying.</p>
<p>Not saying humans aren't valuable — they are. But maybe the phone answering and lead qualifying part doesn't need to be a human job anymore.</p>
<p>Reply "audit" if you want to see the math for your team.</p>
<p>— Munir</p>
`.trim(),
  },
  {
    step_no: 5,
    day_offset: 12,
    subject: "the calls you're sleeping through",
    body_html: `
<p>Hey {{firstName}},</p>
<p>Quick stat that might keep you up tonight:</p>
<p>35-45% of calls to real estate brokerages come in after 5pm. Evenings. Weekends. Holidays.</p>
<p>Think about who's calling at 7pm on a Tuesday. It's the person who just got off work, had dinner with their spouse, and decided "let's start looking for a house." They're motivated. They're ready. And they're calling NOW because they finally have a quiet moment.</p>
<p>What happens when they call your brokerage at 7pm?</p>
<p>For most teams: voicemail. And 85% of those callers never try again.</p>
<p>For teams using the AI: answered in 2 seconds. Qualified. Booked on an agent's calendar for the next morning. The buyer wakes up with a confirmation email. The agent wakes up with a qualified appointment.</p>
<p>Same lead. Completely different outcome. The only difference is whether someone (or something) picked up the phone.</p>
<p><a href="{{demoLink}}">Try it at 10pm tonight</a>. It'll still answer.</p>
<p>— Munir</p>
`.trim(),
  },
];

export const STARTER_SEQUENCES: SeedSequence[] = [
  { name: "Soap Opera — RE Brokers (5-day)", kind: "soap_opera", steps: soapOpera },
  { name: "Seinfeld — RE Brokers (ongoing)", kind: "seinfeld", steps: seinfeld },
];
