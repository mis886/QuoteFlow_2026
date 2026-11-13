-- 2026-11-13: Direct Delivery (Dispatch Step 6 "Issue DO" with Warehouse =
-- Direct Delivery, stored as the round's Step 6 row with remark starting
-- "Direct Delivery"). For such a round the LR at Step 10 is optional: Step 10
-- may be marked done without an LR file. Every other rule is unchanged.
create or replace function public.enforce_dispatch_entry_step_prereqs()
 returns trigger
 language plpgsql
as $function$
declare
  e record;
  has_invoice_file boolean;
  has_lr boolean;
  direct_delivery boolean;
begin
  if new.entry_id is null or new.status <> 'done' or new.step_no not in (8, 9, 10) then
    return new;
  end if;
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
      direct_delivery := exists (
        select 1 from public.dispatch_steps s
        where s.order_id = new.order_id and s.round = new.round
          and s.step_no = 6 and s.status = 'done'
          and lower(btrim(coalesce(s.remark, ''))) like 'direct delivery%'
      );
      if not direct_delivery then
        raise exception 'Upload LR first';
      end if;
    end if;
  end if;
  return new;
end;
$function$;
