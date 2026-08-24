-- History Log module: a single, generic, append-only audit trail for every
-- insert/update/delete performed through the app, mirroring the activity_log
-- table already used by the WADA / Himalaya Terpene Quality & Lab System
-- (Supabase project ikiziqiudhsyrmwubfnp), adapted to this app's identity
-- model (Supabase Google auth + team_roster "doer" names instead of WADA's
-- staff_members/PIN system).
--
-- This is populated by APPLICATION CODE (a shared logActivity() helper called
-- from src/store/index.tsx's mutation functions), not by database triggers --
-- confirmed that's how WADA itself does it (its activity_log rows are written
-- by RPC functions / client code, and no generic audit trigger exists there).
--
-- changes column convention (matches WADA):
--   insert -> full new row as jsonb
--   delete -> full old row as jsonb
--   update -> only the fields that actually changed, each as {"old":..., "new":...}

create table if not exists public.activity_log (
    id           uuid primary key default gen_random_uuid(),
    actor_email  text,
    actor_name   text,
    module       text not null,        -- raw table name, e.g. 'enquiries', 'quotes', 'orders'
    record_id    text not null,        -- the row's primary key, as text
    record_label text,                 -- human-meaningful id (enquiry id, po_no, company name...) -- WADA's "lot_no" equivalent
    action       text not null check (action in ('insert','update','delete')),
    changes      jsonb,
    created_at   timestamptz not null default now()
);

comment on table public.activity_log is 'Append-only audit trail of every insert/update/delete made through the app. Written by src/lib/activityLog.ts, called from the mutation functions in src/store/index.tsx. Modeled on the WADA system''s activity_log table (project ikiziqiudhsyrmwubfnp).';

create index if not exists idx_activity_log_created_at on public.activity_log(created_at desc);
create index if not exists idx_activity_log_module      on public.activity_log(module);
create index if not exists idx_activity_log_record_id   on public.activity_log(record_id);
create index if not exists idx_activity_log_actor_name  on public.activity_log(actor_name);

alter table public.activity_log enable row level security;

-- Any authenticated user can read the log (it's a read-only History page for staff).
create policy activity_log_read on public.activity_log
    for select to authenticated using (true);

-- Any authenticated user (i.e. the app itself, on the acting user's behalf) can
-- append a row. No update/delete policies exist for any role, so once written a
-- row cannot be edited or removed through the API -- append-only by construction.
create policy activity_log_write on public.activity_log
    for insert to authenticated with check (true);

notify pgrst, 'reload schema';
