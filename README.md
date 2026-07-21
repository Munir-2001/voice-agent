# Rose — AI Calling Console

Front-end + backend scaffold for the outbound AI voice-agent system described in
`../Dev-Plan.md`. Built on the minimal-cost stack: **Next.js (App Router, SSR) +
shadcn/ui + Supabase + ElevenLabs Agents + Twilio + Groq**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000  (redirects to /overview)
npm run build      # production build
```

No environment variables are needed to view the UI — it runs on sample data.
Copy `.env.example` → `.env.local` and fill it in to wire the live services.

## What's real vs. mocked

**Real (works now):**
- Full UI: login, overview, interested leads, all-leads table with filters,
  call detail with transcript + recording player, CSV upload with live
  client-side validation, settings — light & dark themes.
- CSV parsing + E.164 validation + dedupe (`src/lib/phone.ts`, upload dropzone).
- Timezone-from-area-code + calling-window logic (`src/lib/timezone.ts`).
- Transcript classification with an opt-out keyword guardrail (`src/lib/classify.ts`).
- API route structure: `/api/webhook`, `/api/campaign`, `/api/leads/upload`,
  `/api/dial-tick` — with HMAC verification, service-role writes, and the
  ElevenLabs outbound-call trigger.

**Mocked (needs wiring):**
- Data comes from `src/lib/sample-data.ts`. Replace the page reads with Supabase
  queries (`src/lib/supabase/server.ts` is ready).
- Auth is a demo form that routes to `/overview`. Wire Supabase Auth + middleware.
- The campaign toggle, "mark contacted", upload import, and settings save show
  toasts; connect them to the API routes.

## Where things are

| Area | Path |
|---|---|
| Design tokens / theme | `src/app/globals.css` |
| Pages | `src/app/(dashboard)/*`, `src/app/login` |
| API routes | `src/app/api/*` |
| Domain types | `src/lib/types.ts` |
| Sample data | `src/lib/sample-data.ts` |
| Helpers | `src/lib/{phone,timezone,classify,format,status}.ts` |
| Supabase clients | `src/lib/supabase/{client,server}.ts` |

## Build order

Follow `../Dev-Manual.md`. This repo covers Phase 2 (app shell, login, upload)
and the structure for Phases 4–6 (scheduler, webhook, dashboard). Next steps:
create the Supabase schema (Phase 1), then swap sample data for live queries.
