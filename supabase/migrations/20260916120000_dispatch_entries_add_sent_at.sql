-- The "Dispatch -> Sent" tab in src/pages/Dispatch.tsx (previously a "parked
-- for a later phase" placeholder) now needs a way to tell which dispatch
-- entries have moved from "Order -> Dispatch" to "Dispatch -> Sent". This is
-- a lightweight MVP (a single "Dispatch -> Sent" button setting a
-- timestamp) — NOT the full SP8-SP11/DO9-DO12 stage-checklist system hinted
-- at by the dispatch_entries.stages/current_stage_index columns and this
-- table's own comment ("Dispatch -> Sent ... is intentionally out of scope
-- for this table and may extend it later"); that fuller system remains
-- unbuilt and untouched.
alter table public.dispatch_entries
  add column if not exists sent_at timestamptz;

comment on column public.dispatch_entries.sent_at is 'Set when a doer clicks "Dispatch -> Sent" on an Order -> Dispatch entry (src/pages/Dispatch.tsx). Null = still in Order -> Dispatch; non-null = shown in Dispatch -> Sent.';

notify pgrst, 'reload schema';
