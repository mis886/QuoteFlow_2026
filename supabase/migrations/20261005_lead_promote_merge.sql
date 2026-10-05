-- Customer Lead: one-step Promote and MIS-only Merge.
--   promote_lead(p_id, p_fields, p_actor_email, p_actor_name)
--     saves the form fields + flips customer_status lead -> customer in ONE
--     transaction, stamps promoted_at / promoted_by, writes the History Log.
--     Refuses a GSTIN that a Customer Master record already uses.
--   merge_lead_into_customer(p_lead_id, p_target_id, p_actor_email, p_actor_name)
--     MIS only (checked on the JWT email): moves the lead's enquiries / quotes /
--     orders / samples / prod_jobs / prod_products to the customer, deletes the
--     lead, writes the History Log with a snapshot of the lead.
--
-- Verify after running:
--   select proname from pg_proc where proname in ('promote_lead','merge_lead_into_customer');  -- 2 rows

-- ── ADDED: let the History Log accept 'promote' and 'merge' ────────────────
-- activity_log.action was created with check (action in ('insert','update','delete')),
-- so both functions' log inserts would fail and roll back the whole promote /
-- merge. The app itself only writes insert / update / delete.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.activity_log'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.activity_log drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.activity_log
  add constraint activity_log_action_check
  check (action in ('insert','update','delete','promote','merge'));

create or replace function public.promote_lead(
  p_id text, p_fields jsonb, p_actor_email text, p_actor_name text default null)
returns public.customers
language plpgsql security invoker set search_path = public as $$
declare
  v_old public.customers; v_new public.customers;
  v_set text; v_gstin text; v_dup text;
begin
  select * into v_old from customers where customer_id = p_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND: %', p_id; end if;
  if v_old.customer_status <> 'lead' then raise exception 'NOT_A_LEAD: % is already a customer', p_id; end if;

  v_gstin := upper(trim(coalesce(p_fields->>'gstin', v_old.gstin, '')));
  if length(v_gstin) = 15 then
    select customer_id into v_dup from customers
     where customer_status = 'customer' and upper(trim(gstin)) = v_gstin and customer_id <> p_id limit 1;
    if v_dup is not null then raise exception 'DUPLICATE_GSTIN: % already used by %', v_gstin, v_dup; end if;
  end if;

  select string_agg(format('%I = r.%I', k, k), ', ') into v_set
  from jsonb_object_keys(coalesce(p_fields,'{}'::jsonb)) k
  where k in (select column_name from information_schema.columns where table_schema='public' and table_name='customers')
    and k not in ('customer_id','customer_status','promoted_at','promoted_by','reviewed_at','reviewed_by');

  if v_set is not null then
    execute format('update customers c set %s from jsonb_populate_record(null::customers, $1) r where c.customer_id = $2', v_set)
      using p_fields, p_id;
  end if;

  update customers set customer_status = 'customer', promoted_at = now(),
         promoted_by = coalesce(p_actor_email, auth.jwt()->>'email'),
         modified_by = coalesce(p_actor_email, modified_by),
         modified_date = to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
   where customer_id = p_id returning * into v_new;

  insert into activity_log(actor_email, actor_name, module, record_id, record_label, action, changes)
  values (coalesce(p_actor_email, auth.jwt()->>'email'), p_actor_name, 'customers', p_id, v_new.company_name, 'promote',
          jsonb_build_object('status', jsonb_build_object('old','lead','new','customer'), 'fields saved', coalesce(p_fields,'{}'::jsonb)));
  return v_new;
end $$;

create or replace function public.merge_lead_into_customer(
  p_lead_id text, p_target_id text, p_actor_email text, p_actor_name text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_lead public.customers; v_tgt public.customers;
  n_enq int; n_quo int; n_ord int; n_smp int; n_job int; n_prd int;
  v_name text; v_by_name boolean;
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> 'mis@himalayaterpene.com' then
    raise exception 'MERGE_NOT_ALLOWED: only MIS can merge';
  end if;
  select * into v_lead from customers where customer_id = p_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND: %', p_lead_id; end if;
  if v_lead.customer_status <> 'lead' then raise exception 'NOT_A_LEAD: %', p_lead_id; end if;
  select * into v_tgt from customers where customer_id = p_target_id for update;
  if not found then raise exception 'TARGET_NOT_FOUND: %', p_target_id; end if;
  if v_tgt.customer_status <> 'customer' then raise exception 'TARGET_NOT_CUSTOMER: %', p_target_id; end if;

  -- ADDED: older documents have no customer_id and link to the lead by NAME
  -- only (trimmed, case-insensitive). Move those too — but only when no other
  -- customers row (besides the lead and the target) has that same name, so a
  -- document that might belong to someone else is never moved.
  v_name := lower(trim(coalesce(v_lead.company_name, '')));
  v_by_name := v_name <> '' and not exists (
    select 1 from customers
     where lower(trim(company_name)) = v_name and customer_id not in (p_lead_id, p_target_id));

  update enquiries set customer_id = p_target_id, cust = v_tgt.company_name
   where customer_id = p_lead_id or (v_by_name and customer_id is null and lower(trim(cust)) = v_name);
  get diagnostics n_enq = row_count;
  update quotes    set customer_id = p_target_id, cust = v_tgt.company_name
   where customer_id = p_lead_id or (v_by_name and customer_id is null and lower(trim(cust)) = v_name);
  get diagnostics n_quo = row_count;
  update orders    set customer_id = p_target_id, cust = v_tgt.company_name
   where customer_id = p_lead_id or (v_by_name and customer_id is null and lower(trim(cust)) = v_name);
  get diagnostics n_ord = row_count;
  update samples   set customer_id = p_target_id, cust = v_tgt.company_name
   where customer_id = p_lead_id or (v_by_name and customer_id is null and lower(trim(cust)) = v_name);
  get diagnostics n_smp = row_count;
  update prod_jobs     set customer_id = p_target_id where customer_id = p_lead_id; get diagnostics n_job = row_count;
  update prod_products set customer_id = p_target_id where customer_id = p_lead_id; get diagnostics n_prd = row_count;

  delete from customers where customer_id = p_lead_id;

  insert into activity_log(actor_email, actor_name, module, record_id, record_label, action, changes)
  values (coalesce(p_actor_email, auth.jwt()->>'email'), p_actor_name, 'customers', p_target_id, v_tgt.company_name, 'merge',
          jsonb_build_object('merged lead', p_lead_id,
            'documents moved', jsonb_build_object('enquiries',n_enq,'quotes',n_quo,'orders',n_ord,'samples',n_smp,'prod_jobs',n_job,'prod_products',n_prd),
            'lead snapshot', to_jsonb(v_lead)));
  return jsonb_build_object('target', p_target_id, 'enquiries',n_enq,'quotes',n_quo,'orders',n_ord,'samples',n_smp,'prod_jobs',n_job,'prod_products',n_prd);
end $$;

revoke all on function public.promote_lead(text,jsonb,text,text) from public, anon;
revoke all on function public.merge_lead_into_customer(text,text,text,text) from public, anon;
grant execute on function public.promote_lead(text,jsonb,text,text) to authenticated;
grant execute on function public.merge_lead_into_customer(text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
