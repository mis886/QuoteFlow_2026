-- 2026-11-02: FMS workspace (replaced Production). Applied to Supabase from the Claude app as migration "fms_workspace_init".
-- All tables are prefixed fms_ (EnqBoss already has activity_log / app_settings) and are locked to the "fms" edge function.

create table if not exists fms_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- users
create table fms_users (
  id uuid primary key default gen_random_uuid(),
  emp_code text not null,
  name text not null,
  email text,
  role text not null default 'doer' check (role in ('admin','manager','doer')),
  is_coordinator boolean not null default false,
  can_create_workflows boolean not null default false,
  manager_id uuid references fms_users(id) on delete set null,
  active boolean not null default true,
  pin_hash text,
  pin_version integer not null default 1,
  must_change_pin boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  constraint users_no_self_manager check (manager_id is null or manager_id <> id)
);
create unique index fms_users_emp_code_uq on fms_users (lower(emp_code));
create index fms_users_manager_idx on fms_users (manager_id);
-- EnqBoss link: a person's FMS identity is their EnqBoss login email.
create unique index fms_users_email_uq on fms_users (lower(email)) where email is not null;

-- ------------------------------------------------------------- settings
-- Single-row table. Times are minutes after midnight, Asia/Kolkata.
create table fms_app_settings (
  id smallint primary key default 1 check (id = 1),
  work_start integer not null default 570,      -- 09:30
  work_end integer not null default 1080,       -- 18:00
  lunch_start integer default 780,              -- 13:00 (null = no lunch break)
  lunch_end integer default 810,                -- 13:30
  weekly_offs integer[] not null default '{0}', -- 0 = Sunday ... 6 = Saturday
  mis_green_limit numeric not null default 5,   -- MIS within -5% is green
  mis_amber_limit numeric not null default 15,  -- within -15% amber, worse is red
  updated_at timestamptz not null default now(),
  constraint settings_hours_ok check (work_start >= 0 and work_end <= 1440 and work_start < work_end),
  constraint settings_lunch_ok check (
    (lunch_start is null and lunch_end is null)
    or (lunch_start is not null and lunch_end is not null
        and lunch_start < lunch_end and lunch_start >= work_start and lunch_end <= work_end)
  ),
  constraint settings_offs_ok check (cardinality(weekly_offs) < 7)
);
insert into fms_app_settings (id) values (1);

create table fms_holidays (
  day date primary key,
  name text not null
);

-- ------------------------------------------------------------ workflows
create table fms_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  start_access text not null default 'admin' check (start_access in ('admin','anyone','selected')),
  created_by uuid references fms_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index fms_workflows_name_uq on fms_workflows (lower(name)) where status = 'active';

create table fms_workflow_starters (
  workflow_id uuid not null references fms_workflows(id) on delete cascade,
  user_id uuid not null references fms_users(id) on delete cascade,
  primary key (workflow_id, user_id)
);

-- What / When / How / Who
create table fms_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references fms_workflows(id) on delete cascade,
  position integer not null check (position >= 1),
  what text not null,                                    -- WHAT: the task
  how text,                                              -- HOW: method / instructions
  tat_minutes integer not null check (tat_minutes >= 0 and tat_minutes <= 60 * 24 * 60), -- WHEN: working minutes allowed
  owner_id uuid not null references fms_users(id),           -- WHO
  unique (workflow_id, position) deferrable initially deferred
);

create table fms_workflow_instances (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references fms_workflows(id) on delete set null,
  workflow_name text not null,
  reference text not null,
  status text not null default 'running' check (status in ('running','completed','cancelled')),
  started_by uuid references fms_users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_reason text
);
create index fms_instances_status_idx on fms_workflow_instances (status);

-- ---------------------------------------------------------------- tasks
create table fms_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text,
  owner_id uuid not null references fms_users(id),
  created_by uuid references fms_users(id) on delete set null,
  weekdays integer[] not null,                 -- 0..6, days it recurs on
  due_minute integer not null check (due_minute between 0 and 1439), -- due time of day (IST)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurring_days_ok check (cardinality(weekdays) between 1 and 7)
);

create table fms_tasks (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('workflow','delegated','recurring','personal')),
  title text not null,
  instructions text,
  owner_id uuid not null references fms_users(id),
  scored_owner_id uuid references fms_users(id),   -- keeps a late task's penalty with the original owner after reassignment
  assigned_by uuid references fms_users(id) on delete set null,
  status text not null check (status in ('waiting','open','done','cancelled')),
  counts_in_mis boolean not null default true,
  tat_minutes integer,
  released_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  remarks text,
  instance_id uuid references fms_workflow_instances(id) on delete cascade,
  step_id uuid references fms_workflow_steps(id) on delete set null,
  seq integer,
  template_id uuid references fms_recurring_templates(id) on delete set null,
  occurrence_date date,
  created_at timestamptz not null default now(),
  constraint tasks_open_has_due check (status not in ('open','done') or (released_at is not null and due_at is not null)),
  constraint tasks_done_has_time check (status <> 'done' or completed_at is not null),
  constraint tasks_wf_shape check (source <> 'workflow' or (instance_id is not null and seq is not null))
);
create index fms_tasks_owner_status_idx on fms_tasks (owner_id, status);
create index fms_tasks_due_idx on fms_tasks (due_at);
create index fms_tasks_instance_idx on fms_tasks (instance_id, seq);
create unique index fms_tasks_recurring_uq on fms_tasks (template_id, occurrence_date) where template_id is not null;

-- ------------------------------------------------------------- activity
create table fms_activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references fms_users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb
);
create index fms_activity_at_idx on fms_activity_log (at desc);

-- ---------------------------------------------------------- data safety
-- All access goes through the server with the database role. Lock the tables
-- against the public Supabase API keys (anon / authenticated) completely.
alter table fms_users enable row level security;
alter table fms_app_settings enable row level security;
alter table fms_holidays enable row level security;
alter table fms_workflows enable row level security;
alter table fms_workflow_starters enable row level security;
alter table fms_workflow_steps enable row level security;
alter table fms_workflow_instances enable row level security;
alter table fms_recurring_templates enable row level security;
alter table fms_tasks enable row level security;
alter table fms_activity_log enable row level security;
alter table fms_schema_migrations enable row level security;

-- Lock every fms_ table against the public API keys. Only the "fms" edge function
-- (service connection) reads or writes them. Scoped to fms_ tables ONLY: the rest of
-- EnqBoss depends on anon/authenticated access to its own tables.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'fms\_%' loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', r.tablename);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', r.tablename);
    end if;
  end loop;
end $$;

-- First FMS admins (EnqBoss ADMIN_EMAILS). They add everyone else under FMS → People.
insert into fms_users (emp_code, name, email, role, is_coordinator, can_create_workflows, must_change_pin) values
  ('MIS', 'MIS Htpl', 'mis@himalayaterpene.com', 'admin', true, true, false),
  ('SHISHIR', 'Shishir Agarwal', 'shishir@himalayaterpene.com', 'admin', false, true, false),
  ('ANIL', 'Anil', 'anil@himalayaterpene.com', 'admin', false, true, false);
