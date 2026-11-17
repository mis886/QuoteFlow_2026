-- 2026-11-17: the person who raised a ticket can edit it (Module, Subject,
-- Priority, Description, Attachment) while it is Open / In Progress.
-- See src/pages/TicketRaise.tsx (Edit on "My Tickets") and editTicket in
-- src/store/index.tsx.
--
-- Before this, tickets had two wide-open policies ("allow_authenticated_all"
-- = any logged-in user could change or delete ANY ticket, including status
-- and the resolution note). Now:
--   * read:   every company login (as today — the Resolver lists all tickets)
--   * insert: company login, raised_by_email must be your own email
--             (admins may raise for anyone)
--   * update: admins = everything (as today);
--             others  = only their OWN ticket, only while Open / In Progress,
--             and only Module / Subject / Priority / Description /
--             Attachment (the trigger below blocks status, resolver note,
--             resolved by, raised by, id, created date)
--   * delete: admins only (the app has no ticket delete today)
--
-- edited_at = when the person who raised it last edited it ("Edited" label on
-- the card). updated_at already exists but also moves on every admin status /
-- note change, so it can't tell an edit apart.

alter table public.tickets add column if not exists edited_at timestamptz;

-- Tickets admins. KEEP IN SYNC with ADMIN_EMAILS in src/store/index.tsx.
create or replace function public.is_ticket_admin()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'mis@himalayaterpene.com', 'shishir@himalayaterpene.com', 'anil@himalayaterpene.com'
  );
$$;

drop policy if exists "allow_authenticated_all" on public.tickets;
drop policy if exists "Allow company access" on public.tickets;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update_admin on public.tickets;
drop policy if exists tickets_update_own on public.tickets;
drop policy if exists tickets_delete_admin on public.tickets;

create policy tickets_select on public.tickets
  for select to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    (auth.jwt() ->> 'email') like '%@himalayaterpene.com'
    and (public.is_ticket_admin() or lower(raised_by_email) = lower(auth.jwt() ->> 'email'))
  );

create policy tickets_update_admin on public.tickets
  for update to authenticated
  using (public.is_ticket_admin())
  with check (public.is_ticket_admin());

create policy tickets_update_own on public.tickets
  for update to authenticated
  using (lower(raised_by_email) = lower(auth.jwt() ->> 'email') and status in ('Open', 'In Progress'))
  with check (lower(raised_by_email) = lower(auth.jwt() ->> 'email') and status in ('Open', 'In Progress'));

create policy tickets_delete_admin on public.tickets
  for delete to authenticated
  using (public.is_ticket_admin());

-- Policies can't limit columns, so a trigger does: a non-admin login may only
-- change the editable fields. (Service role / SQL editor are not limited.)
create or replace function public.tickets_guard_owner_edit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_ticket_admin() then
    if new.id is distinct from old.id
       or new.status is distinct from old.status
       or new.resolved_by is distinct from old.resolved_by
       or new.resolution_note is distinct from old.resolution_note
       or new.raised_by_email is distinct from old.raised_by_email
       or new.raised_by_name is distinct from old.raised_by_name
       or new.created_at is distinct from old.created_at then
      raise exception 'You can only change Module, Subject, Priority, Description and Attachment of your own ticket.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_guard_owner_edit on public.tickets;
create trigger tickets_guard_owner_edit
  before update on public.tickets
  for each row execute function public.tickets_guard_owner_edit();
