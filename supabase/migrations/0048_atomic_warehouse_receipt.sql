-- Make received-order stock posting atomic and retry-safe.
create or replace function private.receive_orders_into_warehouse_impl(
  p_order_ids uuid[],
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_input_count integer;
  v_distinct_count integer;
  v_order_count integer;
  v_receipt_count integer;
  v_warehouse_count integer;
  v_warehouse_id uuid;
  v_unmapped integer;
  v_invalid_multiplier integer;
  v_existing integer;
  v_tx_count integer;
begin
  perform private.assert_operator();

  select count(*),count(distinct x)
  into v_input_count,v_distinct_count
  from unnest(p_order_ids) as t(x);

  if coalesce(v_input_count,0)=0 then raise exception 'Chưa chọn đơn cần nhập kho'; end if;
  if v_input_count<>v_distinct_count then raise exception 'Danh sách đơn bị trùng'; end if;
  if v_input_count>200 then raise exception 'Tối đa 200 đơn mỗi lần nhập kho'; end if;

  select count(*),count(distinct rb.warehouse_id),min(rb.warehouse_id::text)::uuid
  into v_receipt_count,v_warehouse_count,v_warehouse_id
  from public.receive_batch_details rbd
  join public.receive_batches rb on rb.id=rbd.receive_batch_id
  where rbd.order_id=any(p_order_ids);

  if v_receipt_count<>v_input_count or v_warehouse_count<>1 or v_warehouse_id is null then
    raise exception 'Các đơn phải thuộc cùng một Kho nhận đã xác nhận';
  end if;

  -- Lock selected orders so concurrent retries cannot both pass the guards.
  perform 1
  from public.orders o
  where o.id=any(p_order_ids)
  for update;

  select count(*) into v_order_count
  from public.orders o
  where o.id=any(p_order_ids)
    and o.archived_at is null
    and o.receive_status='RECEIVED'
    and o.warehouse_status='READY_TO_TRANSFER';

  if v_order_count<>v_input_count then
    raise exception 'Có đơn không còn ở trạng thái chờ nhập kho';
  end if;

  select count(*) into v_unmapped
  from public.order_items oi
  where oi.order_id=any(p_order_ids)
    and oi.product_variant_id is null;
  if v_unmapped>0 then raise exception 'Có đơn chưa mapping đầy đủ SKU bán'; end if;

  if exists(
    select 1 from public.orders o
    where o.id=any(p_order_ids)
      and not exists(select 1 from public.order_items oi where oi.order_id=o.id)
  ) then
    raise exception 'Có đơn không có sản phẩm để nhập kho';
  end if;

  select count(*) into v_invalid_multiplier
  from public.order_items oi
  where oi.order_id=any(p_order_ids)
    and (
      coalesce(oi.quantity,0)<=0
      or coalesce(oi.inventory_multiplier,0)<=0
      or (oi.quantity*oi.inventory_multiplier)<>trunc(oi.quantity*oi.inventory_multiplier)
    );
  if v_invalid_multiplier>0 then raise exception 'Số lượng nhập kho sau quy đổi không hợp lệ'; end if;

  select count(*) into v_existing
  from public.inventory_transactions it
  where it.reference_type='PURCHASE_RECEIPT'
    and it.reference_id=any(p_order_ids);
  if v_existing>0 then
    raise exception 'Có đơn đã phát sinh giao dịch nhập kho; không được nhập lại';
  end if;

  insert into public.inventory_transactions(
    warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
  )
  select
    v_warehouse_id,
    oi.product_variant_id,
    'IN',
    (oi.quantity*oi.inventory_multiplier)::integer,
    'PURCHASE_RECEIPT',
    oi.order_id,
    v_actor
  from public.order_items oi
  where oi.order_id=any(p_order_ids);

  get diagnostics v_tx_count=row_count;

  update public.orders
  set warehouse_status='WAREHOUSE_RECEIVED',updated_at=now()
  where id=any(p_order_ids);

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  )
  select
    v_actor,'WAREHOUSE','RECEIVE_INTO_STOCK','ORDER',o.id::text,
    jsonb_build_object(
      'warehouse_id',v_warehouse_id,
      'warehouse_status','WAREHOUSE_RECEIVED',
      'note',nullif(btrim(coalesce(p_note,'')),'')
    ),
    'USER'
  from public.orders o
  where o.id=any(p_order_ids);

  return jsonb_build_object(
    'warehouse_id',v_warehouse_id,
    'order_count',v_input_count,
    'transaction_count',v_tx_count
  );
end;
$$;

revoke execute on function private.receive_orders_into_warehouse_impl(uuid[],text)
from public,anon,authenticated;

create or replace function public.receive_orders_into_warehouse(
  p_order_ids uuid[],
  p_note text default null
)
returns jsonb
language sql
set search_path=''
as $$
  select private.receive_orders_into_warehouse_impl(p_order_ids,p_note);
$$;

revoke execute on function public.receive_orders_into_warehouse(uuid[],text) from public,anon;
grant execute on function public.receive_orders_into_warehouse(uuid[],text) to authenticated;
