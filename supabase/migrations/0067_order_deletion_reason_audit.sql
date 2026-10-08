-- Store optional deletion reason atomically with existing immutable order batch audit.
-- Add two-argument RPC without breaking the original one-argument API.
create or replace function private.delete_orders_permanent_safe_impl(p_order_ids uuid[],p_reason text)
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
  v_transfer_count integer;
  v_inventory_count integer:=0;
  v_receive_batch_ids uuid[]:='{}'::uuid[];
  v_payment_ids uuid[]:='{}'::uuid[];
  v_finance_doc_ids uuid[]:='{}'::uuid[];
  v_receive_batch_count integer:=0;
  v_payment_count integer:=0;
  v_finance_doc_count integer:=0;
  v_codes text[];
begin
  perform private.assert_admin();

  select count(*),count(distinct x)
    into v_input_count,v_distinct_count
  from unnest(coalesce(p_order_ids,'{}'::uuid[])) as t(x);

  if coalesce(v_input_count,0)=0 then raise exception 'Chưa chọn đơn cần xóa'; end if;
  if v_input_count<>v_distinct_count then raise exception 'Danh sách đơn xóa bị trùng'; end if;
  if v_input_count>200 then raise exception 'Tối đa 200 đơn mỗi lần xóa'; end if;

  perform 1 from public.orders where id=any(p_order_ids) for update;

  select count(*),array_agg(coalesce(shopee_order_id,id::text) order by order_date)
    into v_order_count,v_codes
  from public.orders
  where id=any(p_order_ids);

  if v_order_count<>v_input_count then
    raise exception 'Có đơn không tồn tại hoặc không có quyền truy cập';
  end if;

  select count(*) into v_transfer_count
  from public.transfer_items
  where order_id=any(p_order_ids);

  if v_transfer_count>0 then
    raise exception 'Không thể xóa: có đơn đã phát sinh chuyển kho. Hãy hoàn tác chuyển kho trước.';
  end if;

  -- A receive batch can only be removed if every order in that batch is selected.
  if exists(
    select 1
    from public.receive_batch_details all_d
    where all_d.receive_batch_id in (
      select d.receive_batch_id
      from public.receive_batch_details d
      where d.order_id=any(p_order_ids)
    )
    group by all_d.receive_batch_id
    having count(*)<>count(*) filter(where all_d.order_id=any(p_order_ids))
  ) then
    raise exception 'Không thể xóa riêng một phần của đợt nhận hàng. Hãy chọn toàn bộ đơn trong cùng đợt nhận.';
  end if;

  -- A shipper settlement can only be rolled back if every order in it is selected.
  if exists(
    select 1
    from public.shipper_payment_details all_d
    where all_d.shipper_payment_id in (
      select d.shipper_payment_id
      from public.shipper_payment_details d
      where d.order_id=any(p_order_ids)
    )
    group by all_d.shipper_payment_id
    having count(*)<>count(*) filter(where all_d.order_id=any(p_order_ids))
  ) then
    raise exception 'Không thể xóa riêng một phần của đợt đối soát Shipper. Hãy chọn toàn bộ đơn trong cùng đợt.';
  end if;

  -- Removing purchase receipt ledger rows must never make inventory negative.
  if exists(
    with selected_tx as (
      select warehouse_id,product_variant_id,
        sum(case
          when tx_type::text in ('IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN') then quantity
          when tx_type::text in ('OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT') then -quantity
          else 0 end) as selected_net
      from public.inventory_transactions
      where reference_type='PURCHASE_RECEIPT'
        and reference_id=any(p_order_ids)
      group by warehouse_id,product_variant_id
    ),
    current_tx as (
      select warehouse_id,product_variant_id,
        sum(case
          when tx_type::text in ('IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN') then quantity
          when tx_type::text in ('OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT') then -quantity
          else 0 end) as current_net
      from public.inventory_transactions
      group by warehouse_id,product_variant_id
    )
    select 1
    from selected_tx s
    join current_tx c using(warehouse_id,product_variant_id)
    where c.current_net-s.selected_net<0
  ) then
    raise exception 'Không thể xóa: hàng từ đơn đã được xuất/bán khiến tồn kho sẽ âm sau khi hoàn tác.';
  end if;

  select coalesce(array_agg(distinct receive_batch_id),'{}'::uuid[])
    into v_receive_batch_ids
  from public.receive_batch_details
  where order_id=any(p_order_ids);

  select coalesce(array_agg(distinct shipper_payment_id),'{}'::uuid[])
    into v_payment_ids
  from public.shipper_payment_details
  where order_id=any(p_order_ids);

  select coalesce(array_agg(distinct id),'{}'::uuid[])
    into v_finance_doc_ids
  from public.finance_documents
  where source_type='SHIPPER_SETTLEMENT'
    and source_id=any(v_payment_ids);

  v_receive_batch_count:=coalesce(array_length(v_receive_batch_ids,1),0);
  v_payment_count:=coalesce(array_length(v_payment_ids,1),0);
  v_finance_doc_count:=coalesce(array_length(v_finance_doc_ids,1),0);

  select count(*) into v_inventory_count
  from public.inventory_transactions
  where reference_type='PURCHASE_RECEIPT'
    and reference_id=any(p_order_ids);

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
  ) values(
    v_actor,'ORDERS','DELETE_ORDER_PERMANENT','ORDER_BATCH',
    'DELETE-'||extract(epoch from clock_timestamp())::bigint::text,
    jsonb_build_object(
      'order_ids',to_jsonb(p_order_ids),
      'order_codes',to_jsonb(v_codes),
      'receive_batch_ids',to_jsonb(v_receive_batch_ids),
      'shipper_payment_ids',to_jsonb(v_payment_ids),
      'finance_document_ids',to_jsonb(v_finance_doc_ids),
      'inventory_transaction_count',v_inventory_count
    ),
    jsonb_build_object('deleted',true,'rollback_dependencies',true,'reason',nullif(btrim(coalesce(p_reason,'')),'')),
    'USER'
  );

  -- Finance must be removed before its document because transaction -> document is RESTRICT.
  delete from public.finance_transactions
  where reference_type='SHIPPER_PAYMENT'
    and reference_id=any(v_payment_ids);

  delete from public.finance_transactions
  where finance_document_id=any(v_finance_doc_ids);

  delete from public.finance_documents
  where id=any(v_finance_doc_ids);

  -- Inventory balance is a ledger view, so deleting receipt rows reverses stock.
  delete from public.inventory_transactions
  where reference_type='PURCHASE_RECEIPT'
    and reference_id=any(p_order_ids);

  -- Parent deletes cascade their detail rows.
  delete from public.shipper_payments where id=any(v_payment_ids);
  delete from public.receive_batches where id=any(v_receive_batch_ids);

  -- orders cascades shipments/tracking events/items/vouchers/alerts.
  delete from public.orders where id=any(p_order_ids);

  return jsonb_build_object(
    'deleted_count',v_order_count,
    'receive_batches_rolled_back',v_receive_batch_count,
    'shipper_payments_rolled_back',v_payment_count,
    'finance_documents_rolled_back',v_finance_doc_count,
    'inventory_transactions_rolled_back',v_inventory_count
  );
end;
$$;

revoke execute on function private.delete_orders_permanent_safe_impl(uuid[],text) from public,anon,authenticated;

create or replace function public.delete_orders_permanent_safe(p_order_ids uuid[],p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (select auth.jwt())->'app_metadata'->>'role'<>'admin' then
    raise exception 'Chỉ Admin được xóa vĩnh viễn đơn' using errcode='42501';
  end if;
  return private.delete_orders_permanent_safe_impl(p_order_ids,p_reason);
end;
$$;
revoke execute on function public.delete_orders_permanent_safe(uuid[],text) from public,anon;
grant execute on function public.delete_orders_permanent_safe(uuid[],text) to authenticated;
notify pgrst, 'reload schema';
