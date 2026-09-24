alter table public.enquiries add column if not exists management_notes text;
alter table public.quotes    add column if not exists management_notes text;
alter table public.orders    add column if not exists management_notes text;
