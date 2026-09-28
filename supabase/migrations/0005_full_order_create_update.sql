-- MYNH ERP V5
-- Atomic full order create/update with items, vouchers and active shipment replacement.

create or replace function public.create_order_full(
  p_shopee_order_id text default null,
  p_erp_user_id uuid default null,
  p_order_date timestamptz default now(),
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_recipient_address text default null,
  p_area text default null,
  p_destination_hub text default null,
  p_cod numeric default 0,
  p_order_status text default 'PENDING',
  p_payment_status text default 'UNPAID',
  p_tracking_number text default null,
  p_carrier text default null,
  p_items jsonb default '[]'::jsonb,
  p_vouchers jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_tracking text := nullif(btrim(coalesce(p_tracking_number,'')),'');
begin
  if public.current_erp_role() not in ('admin','operator') then
    raise exception 'Không có quyền thực hiện thao tác này';
  end if;

  insert into public.orders(
    id,shopee_order_id,erp_user_id,recipient_name,recipient_phone,recipient_address,
    destination_hub,cod,order_date,area,order_status,payment_status,source
  ) values (
    v_order_id,nullif(btrim(coalesce(p_shopee_order_id,'')),''),
    p_erp_user_id,nullif(btrim(coalesce(p_recipient_name,'')),''),
    nullif(btrim(coalesce(p_recipient_phone,'')),''),
    nullif(btrim(coalesce(p_recipient_address,'')),''),
    nullif(btrim(coalesce(p_destination_hub,'')),''),
    greatest(coalesce(p_cod,0),0),coalesce(p_order_date,now()),
    nullif(btrim(coalesce(p_area,'')),''),
    coalesce(p_order_status,'PENDING'),
    coalesce(p_payment_status,'UNPAID'),'MANUAL'
  );

  insert into public.order_items(order_id,sku,product_name,variant,quantity,original_price,final_price)
  select
    v_order_id,nullif(btrim(x.sku),''),btrim(x.product_name),nullif(btrim(x.variant),''),
    greatest(coalesce(x.quantity,1),1),x.original_price,x.final_price
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
    as x(sku text,product_name text,variant text,quantity integer,original_price numeric,final_price numeric)
  where nullif(btrim(coalesce(x.product_name,'')),'') is not null;

  insert into public.order_vouchers(order_id,voucher_code,voucher_name,voucher_type,voucher_tag,voucher_account)
  select
    v_order_id,nullif(btrim(x.voucher_code),''),nullif(btrim(x.voucher_name),''),
    nullif(btrim(x.voucher_type),''),nullif(btrim(x.voucher_tag),''),nullif(btrim(x.voucher_account),'')
  from jsonb_to_recordset(coalesce(p_vouchers,'[]'::jsonb))
    as x(voucher_code text,voucher_name text,voucher_type text,voucher_tag text,voucher_account text)
  where coalesce(
    nullif(btrim(coalesce(x.voucher_code,'')),''),
    nullif(btrim(coalesce(x.voucher_name,'')),''),
    nullif(btrim(coalesce(x.voucher_tag,'')),'')
  ) is not null;

  if v_tracking is not null then
    insert into public.shipments(
      order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,
      tracking_interval_minutes,next_track_at,last_status_change_at,queue_status
    ) values (
      v_order_id,v_tracking,nullif(btrim(coalesce(p_carrier,'')),''),
      true,true,'READY_TO_SHIP',120,now()+interval '120 minutes',now(),'READY'
    );
  end if;

  if p_erp_user_id is not null then
    update public.erp_users u
    set order_count=(select count(*)::int from public.orders o where o.erp_user_id=u.id)
    where u.id=p_erp_user_id;
  end if;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  values(
    auth.uid(),'ORDERS','CREATE','ORDER',v_order_id::text,
    jsonb_build_object(
      'shopee_order_id',p_shopee_order_id,'erp_user_id',p_erp_user_id,'cod',p_cod,
      'order_status',p_order_status,'payment_status',p_payment_status,'tracking_number',v_tracking
    ),
    'USER'
  );

  return v_order_id;
end $$;

create or replace function public.update_order_full(
  p_order_id uuid,
  p_shopee_order_id text default null,
  p_erp_user_id uuid default null,
  p_order_date timestamptz default now(),
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_recipient_address text default null,
  p_area text default null,
  p_destination_hub text default null,
  p_cod numeric default 0,
  p_order_status text default 'PENDING',
  p_payment_status text default 'UNPAID',
  p_tracking_number text default null,
  p_carrier text default null,
  p_items jsonb default '[]'::jsonb,
  p_vouchers jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_old public.orders%rowtype;
  v_old_user uuid;
  v_tracking text := nullif(btrim(coalesce(p_tracking_number,'')),'');
  v_ship public.shipments%rowtype;
begin
  if public.current_erp_role() not in ('admin','operator') then
    raise exception 'Không có quyền thực hiện thao tác này';
  end if;

  select * into v_old from public.orders where id=p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  v_old_user := v_old.erp_user_id;

  update public.orders set
    shopee_order_id=nullif(btrim(coalesce(p_shopee_order_id,'')),''),
    erp_user_id=p_erp_user_id,
    order_date=coalesce(p_order_date,order_date),
    recipient_name=nullif(btrim(coalesce(p_recipient_name,'')),''),
    recipient_phone=nullif(btrim(coalesce(p_recipient_phone,'')),''),
    recipient_address=nullif(btrim(coalesce(p_recipient_address,'')),''),
    area=nullif(btrim(coalesce(p_area,'')),''),
    destination_hub=nullif(btrim(coalesce(p_destination_hub,'')),''),
    cod=greatest(coalesce(p_cod,0),0),
    order_status=coalesce(p_order_status,'PENDING'),
    payment_status=coalesce(p_payment_status,'UNPAID'),
    updated_at=now()
  where id=p_order_id;

  delete from public.order_items where order_id=p_order_id;
  insert into public.order_items(order_id,sku,product_name,variant,quantity,original_price,final_price)
  select
    p_order_id,nullif(btrim(x.sku),''),btrim(x.product_name),nullif(btrim(x.variant),''),
    greatest(coalesce(x.quantity,1),1),x.original_price,x.final_price
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
    as x(sku text,product_name text,variant text,quantity integer,original_price numeric,final_price numeric)
  where nullif(btrim(coalesce(x.product_name,'')),'') is not null;

  delete from public.order_vouchers where order_id=p_order_id;
  insert into public.order_vouchers(order_id,voucher_code,voucher_name,voucher_type,voucher_tag,voucher_account)
  select
    p_order_id,nullif(btrim(x.voucher_code),''),nullif(btrim(x.voucher_name),''),
    nullif(btrim(x.voucher_type),''),nullif(btrim(x.voucher_tag),''),nullif(btrim(x.voucher_account),'')
  from jsonb_to_recordset(coalesce(p_vouchers,'[]'::jsonb))
    as x(voucher_code text,voucher_name text,voucher_type text,voucher_tag text,voucher_account text)
  where coalesce(
    nullif(btrim(coalesce(x.voucher_code,'')),''),
    nullif(btrim(coalesce(x.voucher_name,'')),''),
    nullif(btrim(coalesce(x.voucher_tag,'')),'')
  ) is not null;

  select * into v_ship
  from public.shipments
  where order_id=p_order_id and is_active=true
  order by created_at desc
  limit 1;

  if v_tracking is not null and (v_ship.id is null or v_ship.tracking_number is distinct from v_tracking) then
    update public.shipments
    set is_active=false,tracking_enabled=false,next_track_at=null,replaced_at=now(),updated_at=now()
    where order_id=p_order_id and is_active=true;

    insert into public.shipments(
      order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,
      tracking_interval_minutes,next_track_at,last_status_change_at,queue_status
    ) values (
      p_order_id,v_tracking,nullif(btrim(coalesce(p_carrier,'')),''),
      true,true,'READY_TO_SHIP',120,now()+interval '120 minutes',now(),'READY'
    );

    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    values(
      auth.uid(),'ORDERS','UPDATE_TRACKING_NUMBER','ORDER',p_order_id::text,
      jsonb_build_object('tracking_number',v_ship.tracking_number,'carrier',v_ship.carrier),
      jsonb_build_object('tracking_number',v_tracking,'carrier',p_carrier),'USER'
    );
  elsif v_ship.id is not null and v_ship.carrier is distinct from nullif(btrim(coalesce(p_carrier,'')),'') then
    update public.shipments
    set carrier=nullif(btrim(coalesce(p_carrier,'')),''),updated_at=now()
    where id=v_ship.id;
  end if;

  if v_old_user is not null then
    update public.erp_users u
    set order_count=(select count(*)::int from public.orders o where o.erp_user_id=u.id)
    where u.id=v_old_user;
  end if;
  if p_erp_user_id is not null and p_erp_user_id is distinct from v_old_user then
    update public.erp_users u
    set order_count=(select count(*)::int from public.orders o where o.erp_user_id=u.id)
    where u.id=p_erp_user_id;
  end if;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    auth.uid(),'ORDERS','UPDATE','ORDER',p_order_id::text,
    jsonb_build_object(
      'shopee_order_id',v_old.shopee_order_id,'erp_user_id',v_old.erp_user_id,'cod',v_old.cod,
      'order_status',v_old.order_status,'payment_status',v_old.payment_status
    ),
    jsonb_build_object(
      'shopee_order_id',p_shopee_order_id,'erp_user_id',p_erp_user_id,'cod',p_cod,
      'order_status',p_order_status,'payment_status',p_payment_status
    ),
    'USER'
  );

  return p_order_id;
end $$;

revoke all on function public.create_order_full(text,uuid,timestamptz,text,text,text,text,text,numeric,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_order_full(text,uuid,timestamptz,text,text,text,text,text,numeric,text,text,text,text,jsonb,jsonb) to authenticated;

revoke all on function public.update_order_full(uuid,text,uuid,timestamptz,text,text,text,text,text,numeric,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.update_order_full(uuid,text,uuid,timestamptz,text,text,text,text,text,numeric,text,text,text,text,jsonb,jsonb) to authenticated;
