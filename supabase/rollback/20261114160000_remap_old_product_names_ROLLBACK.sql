-- ROLLBACK for migration 20261114160000_remap_old_product_names.
-- NOT a migration: run by hand only if the remap must be undone.
-- Puts back the exact old values saved in the backup_20261114_* tables (only the rows
-- the remap changed). Any edit made to those rows AFTER the remap is
-- overwritten for these columns. Runs as one transaction.

begin;

update public.enquiries t set items = b.items from public.backup_20261114_enquiries_items b where b.id = t.id;
update public.quotes t set items = b.items from public.backup_20261114_quotes_items b where b.id = t.id;
update public.orders t set items = b.items, dispatch_snapshot = b.dispatch_snapshot from public.backup_20261114_orders b where b.id = t.id;
update public.dispatch_entries t set items = b.items from public.backup_20261114_dispatch_entries_items b where b.id = t.id;
update public.sample_products t set product_name = b.product_name, grade = b.grade from public.backup_20261114_sample_products b where b.id = t.id;
update public.samples t set product_name = b.product_name, product_grade = b.product_grade, products = b.products from public.backup_20261114_samples b where b.id = t.id;

commit;

-- Once the remap is confirmed good, the backups can be dropped:
-- drop table public.backup_20261114_enquiries_items, public.backup_20261114_quotes_items, public.backup_20261114_orders,
--   public.backup_20261114_dispatch_entries_items, public.backup_20261114_sample_products, public.backup_20261114_samples;
