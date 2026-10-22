-- Dispatch Steps 8–10 become MANUAL (2026-10-22).
-- Until now Step 8 Invoice / 9 Get LR / 10 Send Documents moved by
-- themselves from the dispatch entry's data (invoice no., LR files,
-- email_sent_at). From now on each is a button click in the Board drawer,
-- saved here like Steps 1–7 — but per DISPATCH ENTRY (entry_id), since one
-- order can have several entries (partial dispatch).
--   Step 8 "Invoice done"   — refused unless the entry has an invoice no.
--   Step 9 "LR received"    — refused unless the entry has an LR file
--                             (Self Pickup skips Step 9, as before)
--   Step 10 "Documents sent" — no data check
-- The refusals are enforced here (trigger), not only by disabled buttons.
-- Removing the invoice no. / LR later does NOT undo a step.

-- 1. Steps 8–10 rows point at their dispatch entry; deleting the entry
--    deletes its step rows.
alter table public.dispatch_steps
  add column if not exists entry_id text references public.dispatch_entries(id) on delete cascade;
create index if not exists idx_dispatch_steps_entry_id on public.dispatch_steps(entry_id);

-- 2. step_no 1–10 (was 1–7). Steps 1–7 belong to the order (no entry_id),
--    steps 8–10 to one entry (entry_id required).
alter table public.dispatch_steps drop constraint if exists dispatch_steps_step_no_check;
alter table public.dispatch_steps add constraint dispatch_steps_step_no_check check (step_no between 1 and 10);
alter table public.dispatch_steps drop constraint if exists dispatch_steps_entry_step_check;
alter table public.dispatch_steps add constraint dispatch_steps_entry_step_check check ((step_no >= 8) = (entry_id is not null));

-- One row per entry per step: a double click can't save twice; Undo
-- deletes the row so the step can be clicked again.
create unique index if not exists uq_dispatch_steps_entry_step
  on public.dispatch_steps(entry_id, step_no) where entry_id is not null;

-- 3. Server-side check before saving Step 8 / Step 9 as done.
create or replace function public.enforce_dispatch_entry_step_prereqs()
returns trigger
language plpgsql
as $$
declare
  e record;
  has_lr boolean;
begin
  if new.entry_id is null or new.status <> 'done' or new.step_no not in (8, 9) then
    return new;
  end if;
  -- Editing a row that is already done (remark / time) is never blocked.
  if tg_op = 'UPDATE' and old.status = 'done' then
    return new;
  end if;
  select invoice_number, lr_files, lr_url into e from public.dispatch_entries where id = new.entry_id;
  if new.step_no = 8 and btrim(coalesce(e.invoice_number, '')) = '' then
    raise exception 'Add invoice no. first';
  end if;
  if new.step_no = 9 then
    has_lr := (case when jsonb_typeof(e.lr_files) = 'array' then jsonb_array_length(e.lr_files) > 0 else false end)
              or coalesce(e.lr_url, '') <> '';
    if not has_lr then
      raise exception 'Upload LR first';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_entry_step_prereqs on public.dispatch_steps;
create trigger trg_dispatch_entry_step_prereqs
  before insert or update on public.dispatch_steps
  for each row execute function public.enforce_dispatch_entry_step_prereqs();

-- 4. BACKFILL — entries that already passed Steps 8/9/10 under the old
--    automatic rule keep their place. Same conditions the old rule used
--    (src/lib/dispatchFlow.ts entryPosition before 2026-10-22). Real entries
--    only (imported 'system-import' entries never show on the Board).
--    round = which shipment of the order the entry closed (1, 2, …).
--    Safe to run again: NOT EXISTS skips steps already saved.
with e as (
  select d.id, d.order_id, d.fulfillment_type, d.invoice_number, d.lr_files, d.lr_url,
         d.email_sent_at, d.created_at, d.updated_at,
         row_number() over (partition by d.order_id order by d.created_at) as round
  from public.dispatch_entries d
  where coalesce(d.created_by, '') <> 'system-import'
    and exists (select 1 from public.orders o where o.id = d.order_id)
),
rows as (
  -- Step 8: invoice no. present → done when the entry was saved.
  select id, order_id, round, 8 as step_no, 'done' as status, created_at as done_at
  from e where coalesce(invoice_number, '') <> ''
  union all
  -- Step 9: Self Pickup → skipped; Delivery with an LR → done (the entry's
  -- last save stands in for the upload time, as the old rule did).
  select id, order_id, round, 9, 'skipped', coalesce(updated_at, created_at)
  from e where fulfillment_type = 'self_pickup'
  union all
  select id, order_id, round, 9, 'done', coalesce(updated_at, created_at)
  from e where fulfillment_type <> 'self_pickup'
    and ((case when jsonb_typeof(lr_files) = 'array' then jsonb_array_length(lr_files) > 0 else false end)
         or coalesce(lr_url, '') <> '')
  union all
  -- Step 10: email sent → done at the email time.
  select id, order_id, round, 10, 'done', email_sent_at
  from e where email_sent_at is not null
)
insert into public.dispatch_steps (order_id, round, step_no, status, done_at, done_by, remark, entry_id)
select r.order_id, r.round, r.step_no, r.status, coalesce(r.done_at, now()), 'system-backfill',
       'Backfilled from the old automatic rule (2026-10-22)', r.id
from rows r
where not exists (
  select 1 from public.dispatch_steps s where s.entry_id = r.id and s.step_no = r.step_no
);

notify pgrst, 'reload schema';
