create or replace function private.confirm_receive_and_pay_shipper_impl(
  p_order_ids uuid[],
  p_warehouse_id uuid,
  p_shipper_name text,
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
begin
  perform private.assert_operator();

  if nullif(trim(coalesce(p_shipper_name,'')),'') is null then
    raise exception 'Shipper name is required';
  end if;
  if p_actual_transferred is null or p_actual_transferred < 0 then
    raise exception 'Actual transferred amount is required';
  end if;

  select count(*) into v_existing
  from public.shipper_payment_details d
  where d.order_id = any(p_order_ids);

  if v_existing > 0 then
    raise exception 'One or more selected orders were already included in a shipper payment';
  end if;

  v_receive := private.confirm_receive_orders_impl(p_order_ids,p_warehouse_id,p_note);
  v_total_cod := coalesce((v_receive->>'total_cod')::numeric,0);

  if p_actual_transferred < v_total_cod then
    raise exception 'Actual transferred amount cannot be lower than total COD';
  end if;

  insert into public.shipper_payments(
    warehouse_id,shipper_name,total_cod,actual_transferred,
    transferred_at,transferred_by,note
  )
  values(
    p_warehouse_id,trim(p_shipper_name),v_total_cod,p_actual_transferred,
    now(),v_actor,p_note
  )
  returning id,tip into v_payment_id,v_tip;

  insert into public.shipper_payment_details(shipper_payment_id,order_id,cod_snapshot)
  select v_payment_id,o.id,o.cod
  from public.orders o
  where o.id = any(p_order_ids);

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  )
  values(
    v_actor,'FINANCE','SHIPPER_PAYMENT_BATCH','SHIPPER_PAYMENT',v_payment_id::text,
    jsonb_build_object(
      'order_count',coalesce(jsonb_array_length(to_jsonb(p_order_ids)),0),
      'total_cod',v_total_cod,
      'actual_transferred',p_actual_transferred,
      'tip',v_tip,
      'warehouse_id',p_warehouse_id,
      'shipper_name',trim(p_shipper_name)
    ),
    'MANUAL'
  );

  return v_receive || jsonb_build_object(
    'shipper_payment_id',v_payment_id,
    'actual_transferred',p_actual_transferred,
    'tip',v_tip,
    'shipper_name',trim(p_shipper_name)
  );
end;
$$;

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

  insert into public.shipper_payments(
    warehouse_id,
    destination_hub,
    shipper_name,
    shipper_id,
    total_cod,
    actual_transferred,
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
    now(),
    v_actor,
    p_note
  )
  returning id,tip into v_payment_id,v_tip;

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
