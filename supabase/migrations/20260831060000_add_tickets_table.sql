-- Tickets module: internal issue-tracking for staff to report problems with
-- any part of EnqBoss (Enquiry/Quotation/Order/Dispatch/Customer/Sampling/
-- Other) and for admins to triage + resolve them. One row per ticket, no
-- threaded replies — a single description in, a single resolution note out,
-- plus a status field. Mirrors the shape of dispatch_entries (own table, own
-- id prefix TKT-YYYY-NNN via src/lib/utils.ts generateId, app-level RLS).

create table if not exists public.tickets (
  id                text primary key,
  raised_by_email   text not null,
  raised_by_name    text not null,
  module            text not null check (module in ('Enquiry','Quotation','Order','Dispatch','Customer','Sampling','Other')),
  subject           text not null,
  description       text not null,
  priority          text not null default 'Medium' check (priority in ('Low','Medium','High')),
  status            text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  attachment_path   text,
  attachment_name   text,
  resolved_by       text,
  resolution_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.tickets is 'Internal issue-tracking. Raised by any staff member (src/pages/TicketRaise.tsx), triaged/resolved by admins (src/pages/TicketResolver.tsx). Admin gate is app-level (ADMIN_EMAILS in src/store/index.tsx), not RLS.';

create index if not exists idx_tickets_raised_by_email on public.tickets(raised_by_email);
create index if not exists idx_tickets_status           on public.tickets(status);
create index if not exists idx_tickets_created_at        on public.tickets(created_at desc);

alter table public.tickets enable row level security;

create policy "Allow company access" on public.tickets
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com')
  with check ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy "allow_authenticated_all" on public.tickets
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
