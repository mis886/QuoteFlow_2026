-- Migration: 2026-08-27 — Add dispatch_finalized column to orders table
--
-- A leftover order split off a partial dispatch (splitFromOrderId set) was
-- only hidden from the Orders module while it had an active dispatch entry
-- (isRetiredSplitOrder checked dispatchEntries.some(orderId === o.id)).
-- Deleting that dispatch entry from the Dispatch module made the order
-- reappear in Orders — first under "Order Pending for Dispatch" (fixed by
-- removing a status-revert in deleteDispatchEntry), then under "Order
-- Confirmed" instead, since the visibility check itself was still keyed off
-- entry existence rather than a durable fact about the order.
--
-- dispatch_finalized is a one-way flag: NewDispatchEntry.tsx's handleSubmit
-- sets it true the first (and every subsequent) time a dispatch entry is
-- created or edited for a split order, and nothing ever resets it. Orders.tsx
-- now keys isRetiredSplitOrder off this flag instead of dispatch entry
-- existence, so a split order that has ever been dispatched stays hidden
-- permanently, regardless of later dispatch-entry deletions.
--
-- Applied directly to the live database (QuoteFlow_EnqBoss,
-- nheujyknkqeimgpdfyiw) prior to this file being added — this is a record
-- of that change, not something that still needs running.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_finalized BOOLEAN NOT NULL DEFAULT false;
