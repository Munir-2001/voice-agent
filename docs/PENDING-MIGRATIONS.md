# Migrations to run on Supabase

Run these in the Supabase **SQL Editor**, in order. Mark them done as you go.
All are additive + safe — the existing (rose/financing) data and calls are untouched.

- [x] `20260818120000_workspaces.sql` — workspaces + isolation (done)
- [x] `20260819120000_ai_meeting_campaign.sql` — NextGen campaign fields (done)
- [ ] `20260819130000_ai_meeting_states.sql` — new outcome/status states ⬅️ **RUN THIS**
- [ ] `20260819140000_call_local_time.sql` — store each call's local timezone ⬅️ **RUN THIS**
  ```sql
  alter table calls add column if not exists local_timezone text;
  ```
- [ ] `20260824120000_sms_messages.sql` — inbound-SMS log (optional; the webhook works without it, this just persists the thread)
- [ ] `20260824130000_call_external_number.sql` — store the other party's number on each call (powers the call-log phone search) ⬅️ **RUN THIS**
  ```sql
  alter table calls add column if not exists external_number text;
  ```
- [ ] `20260825120000_lead_lists.sql` — named lead lists + per-list campaigns ⬅️ **RUN THIS**
  ```sql
  create table if not exists lead_lists (
    id serial primary key,
    workspace_id integer not null references workspaces(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now()
  );
  create index if not exists lead_lists_workspace_idx on lead_lists(workspace_id);
  alter table leads add column if not exists list_id integer references lead_lists(id) on delete set null;
  create index if not exists leads_list_idx on leads(list_id);
  alter table campaign_settings add column if not exists active_list_id integer references lead_lists(id) on delete set null;
  ```

- [ ] `20260825130000_lead_conversation_url.sql` — save each lead's conversation deep link ⬅️ **RUN THIS**
  ```sql
  alter table leads add column if not exists conversation_url text;
  ```
- [ ] `20260902120000_billing_safeguards.sql` — circuit-breaker + auto-halt state (powers the Twilio balance gate + consecutive-failure auto-pause) ⬅️ **RUN THIS**
  ```sql
  alter table campaign_settings add column if not exists consecutive_failures integer not null default 0;
  alter table campaign_settings add column if not exists halt_reason text;
  alter table campaign_settings add column if not exists halted_at   timestamptz;
  ```
- [ ] `20260908120000_call_requests.sql` — inbound "request a demo AI call" queue (portfolio form → pending requests you approve → lead) ⬅️ **RUN THIS**
  ```sql
  create table if not exists call_requests (
    id            uuid primary key default gen_random_uuid(),
    workspace_id  integer not null references workspaces(id) on delete cascade,
    name          text not null default '',
    business_name text not null default '',
    phone         text not null,
    email         text,
    industry      text not null default '',
    message       text,
    source        text not null default 'portfolio',
    status        text not null default 'pending',
    lead_id       uuid references leads(id) on delete set null,
    ip            text,
    user_agent    text,
    created_at    timestamptz not null default now(),
    reviewed_at   timestamptz,
    reviewed_by   text
  );
  create index if not exists call_requests_workspace_status_idx
    on call_requests(workspace_id, status, created_at desc);
  alter table call_requests enable row level security;
  ```
- [ ] `20260909120000_demo_call_fields.sql` — store the Mia demo-call analysis on each call (outcome / gets_inbound_leads / current_callback_speed). Additive, nullable — non-demo calls stay null. ⬅️ **RUN THIS**
  ```sql
  alter table calls add column if not exists demo_outcome           text;
  alter table calls add column if not exists gets_inbound_leads      text;
  alter table calls add column if not exists current_callback_speed  text;
  ```
- [ ] `20260919120000_booking_link.sql` — per-workspace Cal.com booking link (each account sets its own in Settings; null → env `BOOKING_LINK` default). Additive, nullable. ⬅️ **RUN THIS** (required for the per-account booking link + Settings field)
  ```sql
  alter table campaign_settings add column if not exists booking_link text;
  ```
- [ ] `20260920120000_outreach.sql` — admin-only cold-email drip tables (email_sequences, email_steps, email_campaigns, email_enrollments, email_events). Additive, RLS-enabled (service-role only). Powers the new **Outreach** section. ⬅️ **RUN THIS** (required for the Outreach campaigns/sequences/send engine)
- [ ] `docs/backfill-conversation-urls.sql` — (optional, after the column above) fill conversation links for leads called BEFORE this shipped. Paste Rose's agent id where noted, then run.

### Make the admin able to TOGGLE into Rose's workspace (UI switcher)
The workspace switcher only appears when you belong to 2+ workspaces. Add the admin
to Rose's Default workspace (id 1) as a member — Private stays your home:
```sql
insert into workspace_members (user_id, workspace_id, role)
select id, 1, 'member' from auth.users where email = 'admin@admin.com'
on conflict (user_id, workspace_id) do nothing;
```

### 20260819130000_ai_meeting_states.sql (paste & run — each line is its own statement)
```sql
alter type lead_status  add value if not exists 'meeting_booked';
alter type lead_status  add value if not exists 'not_decision_maker';
alter type lead_status  add value if not exists 'needs_review';
alter type call_outcome add value if not exists 'meeting_booked';
alter type call_outcome add value if not exists 'not_decision_maker';
alter type call_outcome add value if not exists 'needs_review';
alter type call_outcome add value if not exists 'bad_number';
```


---

## 20260819120000_ai_meeting_campaign.sql  (paste & run)

```sql
-- leads: website (new list format) + meeting-capture fields
alter table leads add column if not exists website       text;
alter table leads add column if not exists meeting_email  text;
alter table leads add column if not exists meeting_city   text;

-- campaign_settings: per-workspace agent + goal + caller numbers
alter table campaign_settings add column if not exists goal_type          text not null default 'financing';
alter table campaign_settings add column if not exists elevenlabs_agent_id text;
alter table campaign_settings add column if not exists caller_number_ids   text;
```

---

## LATER — after you create the NextGen AI ElevenLabs agent

Once you have the new agent's `agent_id` and the California `phnum_` id, point the
admin/Private workspace (id 2) at the NextGen campaign (replace the two values):

```sql
update campaign_settings set
  name                = 'NextGen AI — Outreach',
  goal_type           = 'ai_meeting',
  elevenlabs_agent_id = 'agent_XXXXXXXX',       -- new NextGen agent
  caller_number_ids   = 'phnum_CALIFORNIA_ID',  -- the California number
  window_start        = '09:00',
  window_end          = '18:00'
where workspace_id = 2;
```

(Don't run this yet — the calling-path code that reads these fields isn't built until
you send me the agent_id / California number / Cal.com link.)
