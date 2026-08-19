# Migrations to run on Supabase

Run these in the Supabase **SQL Editor**, in order. Mark them done as you go.
All are additive + safe — the existing (rose/financing) data and calls are untouched.

- [x] `20260818120000_workspaces.sql` — workspaces + isolation (done)
- [x] `20260819120000_ai_meeting_campaign.sql` — NextGen campaign fields (done)
- [ ] `20260819130000_ai_meeting_states.sql` — new outcome/status states ⬅️ **RUN THIS**

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
