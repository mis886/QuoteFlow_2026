-- Dispatch: new Step 9 "Send Invoice to Bhiwandi" (2026-10-30).
-- Entry steps were 8 Invoice / 9 Get LR / 10 Send Documents / Done.
-- They become:
--   8  Invoice            — invoice no. AND at least one Invoice / Eway Bill file
--   9  Send Invoice to Bhiwandi (NEW) — done when the Bhiwandi email is sent
--                           (dispatch_entries.bhiwandi_email_sent_at), or marked
--                           by hand (remark 'marked manually'). Delivery AND
--                           Self Pickup — never skipped.
--   10 Get LR (was 9)      — needs an LR file; Self Pickup skips it
--   11 Send Documents (was 10)
--   Done (board column 12, was 11 — the app only, nothing stored).
-- Entries that already passed Step 8 get Step 9 'skipped' (system-backfill),
-- so nothing moves backwards on the board.
-- Run ONCE, in the Supabase SQL Editor.

begin;

-- a) Backup of every step row before anything changes.
create schema if not exists backup;
create table backup.dispatch_steps_20261030 as select * from public.dispatch_steps;

-- b) When the Bhiwandi email was sent (Step 9's proof).
alter table public.dispatch_entries
  add column if not exists bhiwandi_email_sent_at timestamptz null;

-- c) step_no 1–11 (was 1–10).
alter table public.dispatch_steps drop constraint if exists dispatch_steps_step_no_check;
alter table public.dispatch_steps add constraint dispatch_steps_step_no_check check (step_no between 1 and 11);

-- d) Renumber the entry rows, highest first, so the unique index
--    (entry_id, step_no) never clashes. Order rows (steps 1–7, no entry_id)
--    are not touched.
update public.dispatch_steps set step_no = 11 where entry_id is not null and step_no = 10;
update public.dispatch_steps set step_no = 10 where entry_id is not null and step_no = 9;

-- e) Step 9 'skipped' for every entry whose Step 8 is already done. Same
--    order_id / round / time as that Step 8 row; created a moment before it,
--    so "Undo last step" on an old entry still takes back what it did before.
insert into public.dispatch_steps (order_id, round, step_no, status, done_at, done_by, remark, entry_id, created_at)
select s.order_id, s.round, 9, 'skipped', coalesce(s.done_at, now()), 'system-backfill', 'before Bhiwandi step', s.entry_id,
       coalesce(s.created_at, now()) - interval '1 millisecond'
from public.dispatch_steps s
where s.entry_id is not null and s.step_no = 8 and s.status = 'done'
  and not exists (select 1 from public.dispatch_steps x where x.entry_id = s.entry_id and x.step_no = 9);

-- f) Server-side checks before an entry step is saved as done.
create or replace function public.enforce_dispatch_entry_step_prereqs()
returns trigger
language plpgsql
as $$
declare
  e record;
  has_invoice_file boolean;
  has_lr boolean;
begin
  if new.entry_id is null or new.status <> 'done' or new.step_no not in (8, 9, 10) then
    return new;
  end if;
  -- Editing a row that is already done (remark / time) is never blocked.
  if tg_op = 'UPDATE' and old.status = 'done' then
    return new;
  end if;
  select invoice_number, invoice_eway_bill_files, invoice_eway_bill_url, lr_files, lr_url, bhiwandi_email_sent_at
    into e from public.dispatch_entries where id = new.entry_id;
  if new.step_no = 8 then
    has_invoice_file := (case when jsonb_typeof(e.invoice_eway_bill_files) = 'array' then jsonb_array_length(e.invoice_eway_bill_files) > 0 else false end)
                        or coalesce(e.invoice_eway_bill_url, '') <> '';
    if btrim(coalesce(e.invoice_number, '')) = '' or not has_invoice_file then
      raise exception 'Add invoice no. and attach Invoice / Eway Bill first';
    end if;
  end if;
  if new.step_no = 9 and e.bhiwandi_email_sent_at is null and coalesce(new.remark, '') <> 'marked manually' then
    raise exception 'Send email to Bhiwandi first';
  end if;
  if new.step_no = 10 then
    has_lr := (case when jsonb_typeof(e.lr_files) = 'array' then jsonb_array_length(e.lr_files) > 0 else false end)
              or coalesce(e.lr_url, '') <> '';
    if not has_lr then
      raise exception 'Upload LR first';
    end if;
  end if;
  return new;
end;
$$;

-- g) delete_dispatch_entry_reset (20261026120000) has no entry step numbers
--    (it deletes every step row of the round; its 1 / 5 are order steps), and
--    dispatch_steps_entry_step_check ((step_no >= 8) = (entry_id is not null))
--    still holds for 8–11 — neither needs a change.

notify pgrst, 'reload schema';

commit;

-- After running — checks (read-only):
--   select step_no, status, count(*) from public.dispatch_steps where entry_id is not null group by 1, 2 order by 1, 2;
--   select count(*) from backup.dispatch_steps_20261030;
--   -- every database function that mentions step_no (should be only enforce_dispatch_entry_step_prereqs):
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc ilike '%step_no%';
