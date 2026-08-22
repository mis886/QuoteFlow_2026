-- Restrict marking an order "Delivered" (i.e. clicking Complete) to
-- mum@himalayaterpene.com only. This mirrors the client-side
-- canCompleteOrder() check in src/lib/utils.ts, but enforced here at the
-- database level so it can't be bypassed by calling the Supabase REST/JS
-- client directly with any other @himalayaterpene.com session — the
-- existing "allow_authenticated_all" RLS policy on public.orders permits
-- any authenticated user to update any column, so a trigger (which fires
-- regardless of which RLS policy allowed the row) is the only way to add
-- this restriction without weakening that broader policy.

CREATE OR REPLACE FUNCTION public.enforce_order_complete_restriction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF coalesce(auth.jwt() ->> 'email', '') <> 'mum@himalayaterpene.com' THEN
      RAISE EXCEPTION 'Only mum@himalayaterpene.com can mark an order as Delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_complete_restriction ON public.orders;

CREATE TRIGGER trg_enforce_order_complete_restriction
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_complete_restriction();
