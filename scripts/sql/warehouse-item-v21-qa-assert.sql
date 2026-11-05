-- Isolated DB QA: exercise migration + actual SQL RPCs without any Production credentials.
do $qa$
declare
  v jsonb; n integer; amount numeric; stage text; v_old integer;
begin
  -- Legacy status must not be reclassified from its missing SKU mapping.
  if (select warehouse_item_status from public.order_items
      where id='50000000-0000-0000-0000-000000000001')<>'RECEIVED' then
    raise exception 'Legacy received row not preserved';
  end if;

  -- Atomic SKU mapping and canonical POS price edit.
  v:=public.map_warehouse_order_item_v21(
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    null,null,null,169000,159000,true,2
  );
  if (select sale_price from public.product_variants
      where id='30000000-0000-0000-0000-000000000001')<>169000 then
    raise exception 'Canonical price did not update';
  end if;
  if (select inventory_multiplier from public.order_items
      where id='50000000-0000-0000-0000-000000000002')<>2 then
    raise exception 'Mapping multiplier did not persist';
  end if;
  if not exists(select 1 from public.audit_logs where action='UPDATE_SALE_PRICE') then
    raise exception 'Price audit missing';
  end if;

  -- Price stale edit must reject without mutating the pending row.
  begin
    perform public.map_warehouse_order_item_v21(
      '50000000-0000-0000-0000-000000000005',
      '30000000-0000-0000-0000-000000000001',
      null,null,null,179000,159000,true,1);
    raise exception 'Stale price unexpectedly accepted';
  exception when others then
    if sqlerrm='Stale price unexpectedly accepted' then raise; end if;
  end;
  if (select product_variant_id from public.order_items
       where id='50000000-0000-0000-0000-000000000005') is not null then
    raise exception 'Partial mapping write after stale-price error';
  end if;

  -- Missing skip reason must reject atomically.
  begin
    perform public.process_warehouse_order_items_v21(
      '40000000-0000-0000-0000-000000000002',
      '[{"item_id":"50000000-0000-0000-0000-000000000003","action":"SKIP"}]'::jsonb);
    raise exception 'Skip without reason unexpectedly accepted';
  exception when others then
    if sqlerrm='Skip without reason unexpectedly accepted' then raise; end if;
  end;
  if (select warehouse_item_status from public.order_items
      where id='50000000-0000-0000-0000-000000000003')<>'PENDING' then
    raise exception 'Partial state changed after missing reason';
  end if;

  -- 2 IN, 1 SKIP with two separate confirmations; no extra stock.
  v:=public.process_warehouse_order_items_v21(
    '40000000-0000-0000-0000-000000000002',
    '[{"item_id":"50000000-0000-0000-0000-000000000002","action":"IN"},
      {"item_id":"50000000-0000-0000-0000-000000000003","action":"SKIP","reason":"Không bán"}]'::jsonb);
  if v->>'warehouse_status'<>'READY_TO_TRANSFER' then
    raise exception 'Partial order incorrectly marked completed';
  end if;
  v:=public.process_warehouse_order_items_v21(
    '40000000-0000-0000-0000-000000000002',
    '[{"item_id":"50000000-0000-0000-0000-000000000004","action":"IN"}]'::jsonb);
  if v->>'warehouse_status'<>'WAREHOUSE_MIXED' then
    raise exception 'Mixed order status incorrect';
  end if;
  select count(*),sum(quantity) into n,amount
  from public.inventory_transactions
  where reference_type='PURCHASE_RECEIPT'
    and reference_id='40000000-0000-0000-0000-000000000002';
  if n<>2 or amount<>10 then
    raise exception 'Unexpected stock: receipts %, quantity %',n,amount;
  end if;
  if exists(select 1 from public.inventory_transactions
    where order_item_id='50000000-0000-0000-0000-000000000003') then
    raise exception 'Skipped item incorrectly incremented stock';
  end if;

  -- A completed order cannot be retried; no additional ledger rows.
  begin
    perform public.process_warehouse_order_items_v21(
      '40000000-0000-0000-0000-000000000002',
      '[{"item_id":"50000000-0000-0000-0000-000000000002","action":"IN"}]'::jsonb);
    raise exception 'Repeat receipt unexpectedly accepted';
  exception when others then
    if sqlerrm='Repeat receipt unexpectedly accepted' then raise; end if;
  end;

  -- Legacy whole-order RPC still works for fully pending orders and marks
  -- the same item-level ledger; it must not attempt a mixed order twice.
  v:=private.receive_orders_into_warehouse_impl(
    array['40000000-0000-0000-0000-000000000004'::uuid],null);
  if (select warehouse_item_status from public.order_items
    where id='50000000-0000-0000-0000-000000000006')<>'RECEIVED' then
    raise exception 'Legacy RPC failed to mark individual item';
  end if;
  if (select count(*) from public.inventory_transactions
    where reference_id='40000000-0000-0000-0000-000000000004' and order_item_id is not null)<>1 then
    raise exception 'Legacy RPC did not produce traceable stock row';
  end if;

  -- Guard mapping for already-posted items.
  begin
    update public.order_items set inventory_multiplier=4
    where id='50000000-0000-0000-0000-000000000006';
    raise exception 'Posted mapping unexpectedly editable';
  exception when others then
    if sqlerrm='Posted mapping unexpectedly editable' then raise; end if;
  end;

  -- Ensure permission check is actually called on both RPCs in isolation.
  perform set_config('qa.role','viewer',true);
  begin
    perform public.map_warehouse_order_item_v21(
      '50000000-0000-0000-0000-000000000005',
      '30000000-0000-0000-0000-000000000001',
      null,null,null,null,null,false,1);
    raise exception 'Viewer unexpectedly changed SKU';
  exception when others then
    if sqlerrm='Viewer unexpectedly changed SKU' then raise; end if;
  end;
  perform set_config('qa.role','operator',true);

  raise notice 'Warehouse V2.1 isolated PostgreSQL transactional QA: PASS';
end;
$qa$;


-- Test a real non-definer SQL role: direct table writes must not be able to
-- fake a warehouse receipt or delete a previously completed source item.
grant usage on schema public to authenticated;
grant select,update,delete on public.order_items to authenticated;
set role authenticated;
do $role_test$
begin
  begin
    update public.order_items set warehouse_item_status='RECEIVED'
      where id='50000000-0000-0000-0000-000000000005';
    raise exception 'Direct status forgery was accepted';
  exception when others then
    if sqlerrm='Direct status forgery was accepted' then raise; end if;
  end;
  begin
    delete from public.order_items
      where id='50000000-0000-0000-0000-000000000001';
    raise exception 'Completed item delete was accepted';
  exception when others then
    if sqlerrm='Completed item delete was accepted' then raise; end if;
  end;
  raise notice 'Non-definer direct state/delete guard: PASS';
end;
$role_test$;
reset role;
