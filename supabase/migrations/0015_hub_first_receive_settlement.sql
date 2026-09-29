alter table public.shipper_payments
  add column if not exists destination_hub text;

create index if not exists idx_shipper_payments_destination_hub
  on public.shipper_payments(destination_hub, transferred_at desc);

with single_hub as (
  select
    d.shipper_payment_id,
    min(o.destination_hub) as destination_hub
  from public.shipper_payment_details d
  join public.orders o on o.id=d.order_id
  where o.destination_hub is not null
  group by d.shipper_payment_id
  having count(distinct o.destination_hub)=1
)
update public.shipper_payments p
set destination_hub=s.destination_hub
from single_hub s
where p.id=s.shipper_payment_id
  and p.destination_hub is null;

create or replace function private.confirm_receive_and_pay_hub_impl(
  p_order_ids uuid[],
  p_warehouse_id uuid,
  p_destination_hub text,
  p_actual_transferred numeric,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_receive jsonb;
  v_payment_id uuid;
  v_total_cod numeric(18,2);
  v_tip numeric(18,2);
  v_existing integer;
  v_input_count integer;
  v_distinct_count integer;
  v_matching_count integer;
begin
  perform private.assert_operator();

  if nullif(trim(coalesce(p_destination_hub,'')),'') is null then
    raise exception 'Destination HUB is required';
  end if;

  if p_actual_transferred is null or p_actual_transferred < 0 then
    raise exception 'Actual transferred amount is required';
  end if;

  select count(*), count(distinct x)
    into v_input_count, v_distinct_count
    from unnest(p_order_ids) as t(x);

  if coalesce(v_input_count,0)=0 then
    raise exception 'No orders selected';
  end if;

  if v_input_count <> v_distinct_count then
    raise exception 'Duplicate order ids are not allowed';
  end if;

  if not exists (
    select 1
    from public.destination_hub_configs h
    where h.hub_code=trim(p_destination_hub)
      and h.is_active=true
  ) then
    raise exception 'Destination HUB not found or inactive';
  end if;

  select count(*)
    into v_matching_count
    from public.orders o
   where o.id = any(p_order_ids)
     and o.destination_hub = trim(p_destination_hub)
     and coalesce(o.shipping_service,'STANDARD') <> 'EXPRESS';

  if v_matching_count <> v_input_count then
    raise exception 'All selected orders must belong to the same destination HUB and cannot be EXPRESS';
  end if;

  select count(*)
    into v_existing
    from public.shipper_payment_details d
   where d.order_id = any(p_order_ids);

  if v_existing > 0 then
    raise exception 'One or more selected orders were already included in a HUB settlement';
  end if;

  v_receive := private.confirm_receive_orders_impl(
    p_order_ids,
    p_warehouse_id,
    p_note
  );

  v_total_cod := coalesce((v_receive->>'total_cod')::numeric,0);

  if p_actual_transferred < v_total_cod then
    raise exception 'Actual transferred amount cannot be lower than total COD';
  end if;

  v_tip := p_actual_transferred - v_total_cod;

  insert into public.shipper_payments(
    warehouse_id,
    destination_hub,
    shipper_name,
    shipper_id,
    total_cod,
    actual_transferred,
    tip,
    transferred_at,
    transferred_by,
    note
  )
  values(
    p_warehouse_id,
    trim(p_destination_hub),
    null,
    null,
    v_total_cod,
    p_actual_transferred,
    v_tip,
    now(),
    v_actor,
    p_note
  )
  returning id into v_payment_id;

  insert into public.shipper_payment_details(
    shipper_payment_id,
    order_id,
    cod_snapshot
  )
  select v_payment_id,o.id,o.cod
  from public.orders o
  where o.id = any(p_order_ids);

  insert into public.audit_logs(
    actor_user_id,
    module,
    action,
    entity_type,
    entity_id,
    new_value,
    source
  )
  values(
    v_actor,
    'FINANCE',
    'HUB_PAYMENT_BATCH',
    'HUB_SETTLEMENT',
    v_payment_id::text,
    jsonb_build_object(
      'destination_hub',trim(p_destination_hub),
      'order_count',v_input_count,
      'total_cod',v_total_cod,
      'actual_transferred',p_actual_transferred,
      'tip',v_tip,
      'warehouse_id',p_warehouse_id
    ),
    'MANUAL'
  );

  return v_receive || jsonb_build_object(
    'shipper_payment_id',v_payment_id,
    'destination_hub',trim(p_destination_hub),
    'actual_transferred',p_actual_transferred,
    'tip',v_tip
  );
end;
$$;

create or replace function public.confirm_receive_and_pay_hub(
  p_order_ids uuid[],
  p_warehouse_id uuid,
  p_destination_hub text,
  p_actual_transferred numeric,
  p_note text default null
) returns jsonb
language sql
set search_path = ''
as $$
  select private.confirm_receive_and_pay_hub_impl(
    p_order_ids,
    p_warehouse_id,
    p_destination_hub,
    p_actual_transferred,
    p_note
  );
$$;

revoke all on function public.confirm_receive_and_pay_hub(
  uuid[],uuid,text,numeric,text
) from public;

revoke all on function public.confirm_receive_and_pay_hub(
  uuid[],uuid,text,numeric,text
) from anon;

grant execute on function public.confirm_receive_and_pay_hub(
  uuid[],uuid,text,numeric,text
) to authenticated;
