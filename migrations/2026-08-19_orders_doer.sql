-- Migration: 2026-08-19 — Add doer column to orders table
--
-- mapOrderToDB() never wrote `doer` into the insert/update payload (an
-- explicit allow-list mapper, unlike mapQuoteToDB which already forwards it),
-- and the live `orders` table has no `doer` column to receive it anyway —
-- same class of bug fixed for `inco`/`curr` in 2026-06-22_orders_inco_curr.sql
-- (an earlier migration, 2026-06-06_enquiry_doer.sql, listed an `orders.doer`
-- column too, but it evidently never actually landed on the live table).
--
-- NewOrder.tsx already stamps `doer: stampName()` on the client-side Order
-- object; this column plus the mapOrderToDB fix let it actually persist, so
-- kpi.ts's matchDoer(o.doer, 'DEO') can attribute DEO order-conversion volume.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS doer TEXT;
