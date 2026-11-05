-- MYNH ERP V5 · Warehouse item-level intake V2.1
-- REVIEW ONLY: Do not apply to Production without a separate approval.
-- Additive schema. Legacy receipt data is preserved; no inventory backfill is generated.

alter table public.order_items
  add column if not exists warehouse_item_status text not null default 'PENDING';

alter table public.order_items
  drop constraint if exists order_items_warehouse_item_status_check;
alter table public.order_items
  add constraint order_items_warehouse_item_status_check
  check (warehouse_item_status in ('PENDING','RECEIVED','SKIPPED'));

alter table public.order_items
  add column if not exists warehouse_item_processed_at timestamptz,
  add column if not exists warehouse_item_processed_by uuid,
  add column if not exists warehouse_item_skip_reason text;

alter table public.inventory_transactions
  add column if not exists order_item_id uuid
  references public.order_items(id);

create unique index if not exists inventory_one_purchase_receipt_per_order_item_v21
  on public.inventory_transactions(order_item_id)
  where reference_type='PURCHASE_RECEIPT'
    and tx_type='IN' and order_item_id is not null;

create index if not exists order_items_warehouse_item_status_v21
  on public.order_items(order_id,warehouse_item_status);

-- Preserve legacy whole-order receipts and skips, even if the old order's
-- current mapping is null. Do not infer or create new inventory rows.
update public.order_items oi
set warehouse_item_status=case
  when o.warehouse_status='WAREHOUSE_RECEIVED' then 'RECEIVED'
  when o.warehouse_status='WAREHOUSE_SKIPPED' then 'SKIPPED'
  else oi.warehouse_item_status end
from public.orders o
where oi.order_id=o.id
  and o.warehouse_status in ('WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED')
  and oi.warehouse_item_status='PENDING';

alter type public.warehouse_order_status
  add value if not exists 'WAREHOUSE_MIXED' after 'WAREHOUSE_RECEIVED';

-- No path, including legacy actions, may re-map a completed item.
create or replace function private.guard_processed_warehouse_item_mapping_v21()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.warehouse_item_status <> 'PENDING'
     and (new.product_variant_id is distinct from old.product_variant_id
       or new.inventory_multiplier is distinct from old.inventory_multiplier)
  then
    raise exception 'Sản phẩm đã xử lý kho, không thể sửa SKU hoặc quy đổi trực tiếp';
  end if;
  return new;
end; $$;

drop trigger if exists guard_processed_warehouse_item_mapping_v21
  on public.order_items;
create trigger guard_processed_warehouse_item_mapping_v21
  before update of product_variant_id,inventory_multiplier on public.order_items
  for each row execute function private.guard_processed_warehouse_item_mapping_v21();

-- SKU mapping, optionally updating the canonical POS price, is one transaction.
create or replace function private.map_warehouse_order_item_v21_impl(
  p_item_id uuid,
  p_existing_variant_id uuid,
  p_sale_sku text,
  p_product_name text,
  p_variant_name text,
  p_sale_price numeric,
  p_expected_sale_price numeric,
  p_update_existing_price boolean,
  p_multiplier integer
)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_order_id uuid;
  v_order record;
  v_item record;
  v_variant_id uuid;
  v_product_id uuid;
  v_old_price numeric;
  v_new_price numeric;
  v_name text;
  v_variant text;
  v_sku text;
begin
  perform private.assert_operator();
  if p_item_id is null then raise exception 'Thiếu sản phẩm cần bóc tách'; end if;
  if p_multiplier is null or p_multiplier<=0 then
    raise exception 'Hệ số quy đổi phải là số nguyên dương';
  end if;
  select oi.order_id into v_order_id from public.order_items oi where oi.id=p_item_id;
  if v_order_id is null then raise exception 'Sản phẩm không còn tồn tại'; end if;

  select o.id,o.receive_status,o.warehouse_status,o.archived_at
  into v_order from public.orders o where o.id=v_order_id for update;
  if v_order.id is null or v_order.archived_at is not null
    or v_order.receive_status<>'RECEIVED'
    or v_order.warehouse_status<>'READY_TO_TRANSFER'
  then raise exception 'Đơn không ở trạng thái được phép bóc tách'; end if;

  select oi.* into v_item from public.order_items oi
    where oi.id=p_item_id and oi.order_id=v_order_id for update;
  if v_item.warehouse_item_status<>'PENDING' then
    raise exception 'Sản phẩm này đã xử lý kho, không thể sửa bóc tách';
  end if;

  if p_existing_variant_id is not null then
    v_variant_id:=p_existing_variant_id;
    select pv.sale_price into v_old_price
      from public.product_variants pv where pv.id=v_variant_id for update;
    if not found then raise exception 'SKU bán được chọn không còn tồn tại'; end if;
    v_new_price:=v_old_price;
    if coalesce(p_update_existing_price,false) then
      if v_old_price is distinct from p_expected_sale_price then
        raise exception 'Giá SKU đã thay đổi bởi người khác. Vui lòng tải lại giá';
      end if;
      if p_sale_price is null or p_sale_price<0 then
        raise exception 'Giá bán mới không hợp lệ';
      end if;
      v_new_price:=p_sale_price;
      if v_new_price is distinct from v_old_price then
        update public.product_variants
          set sale_price=v_new_price,updated_at=now()
          where id=v_variant_id;
        insert into public.audit_logs(
          actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
        ) values (
          v_actor,'WAREHOUSE','UPDATE_SALE_PRICE','ORDER',v_order_id::text,
          jsonb_build_object('order_item_id',p_item_id,'product_variant_id',v_variant_id,'sale_price',v_old_price),
          jsonb_build_object('order_item_id',p_item_id,'product_variant_id',v_variant_id,'sale_price',v_new_price),
          'USER'
        );
      end if;
    end if;
  else
    v_sku:=upper(nullif(btrim(coalesce(p_sale_sku,'')),''));
    v_name:=nullif(btrim(coalesce(p_product_name,'')),'');
    v_variant:=coalesce(nullif(btrim(coalesce(p_variant_name,'')),''),'Mặc định');
    if v_sku is null or v_name is null then
      raise exception 'Thiếu mã SKU hoặc tên sản phẩm mới';
    end if;
    if p_sale_price is null or p_sale_price<0 then
      raise exception 'Giá bán sản phẩm mới không hợp lệ';
    end if;
    insert into public.products(sku,name,note)
      values(v_sku,v_name,'Tạo từ Bóc tách nhập kho V2.1')
      on conflict(sku) do nothing returning id into v_product_id;
    if v_product_id is null then
      raise exception 'Mã SKU bán đã tồn tại. Hãy chọn SKU có sẵn';
    end if;
    insert into public.product_variants(product_id,variant_name,sale_price)
      values(v_product_id,v_variant,p_sale_price)
      returning id into v_variant_id;
    v_new_price:=p_sale_price;
  end if;

  update public.order_items set
    product_variant_id=v_variant_id,inventory_multiplier=p_multiplier
    where id=p_item_id;

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
  ) values (
    v_actor,'WAREHOUSE','MAP_INVENTORY_SKU','ORDER',v_order_id::text,
    jsonb_build_object('order_item_id',p_item_id,
      'product_variant_id',v_item.product_variant_id,'inventory_multiplier',v_item.inventory_multiplier),
    jsonb_build_object('order_item_id',p_item_id,
      'product_variant_id',v_variant_id,'inventory_multiplier',p_multiplier,
      'sale_price',v_new_price),
    'USER'
  );

  return jsonb_build_object('order_item_id',p_item_id,'product_variant_id',v_variant_id,
    'inventory_multiplier',p_multiplier,'sale_price',v_new_price);
end; $$;

revoke execute on function private.map_warehouse_order_item_v21_impl(
  uuid,uuid,text,text,text,numeric,numeric,boolean,integer)
  from public,anon,authenticated;
grant execute on function private.map_warehouse_order_item_v21_impl(
  uuid,uuid,text,text,text,numeric,numeric,boolean,integer) to authenticated;

create or replace function public.map_warehouse_order_item_v21(
  p_item_id uuid,
  p_existing_variant_id uuid default null,
  p_sale_sku text default null,
  p_product_name text default null,
  p_variant_name text default null,
  p_sale_price numeric default null,
  p_expected_sale_price numeric default null,
  p_update_existing_price boolean default false,
  p_multiplier integer default 1
) returns jsonb language sql set search_path='' as $$
  select private.map_warehouse_order_item_v21_impl(
    p_item_id,p_existing_variant_id,p_sale_sku,p_product_name,p_variant_name,
    p_sale_price,p_expected_sale_price,p_update_existing_price,p_multiplier
  );
$$;
revoke execute on function public.map_warehouse_order_item_v21(
  uuid,uuid,text,text,text,numeric,numeric,boolean,integer) from public,anon;
grant execute on function public.map_warehouse_order_item_v21(
  uuid,uuid,text,text,text,numeric,numeric,boolean,integer) to authenticated;

-- One atomic action for one order with one or more selected items.
create or replace function private.process_warehouse_order_items_v21_impl(
  p_order_id uuid,p_decisions jsonb,p_note text default null
)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_order record;
  v_receipts integer;
  v_warehouse_count integer;
  v_warehouse_id uuid;
  v_entry jsonb;
  v_item_id uuid;
  v_action text;
  v_reason text;
  v_item record;
  v_qty numeric;
  v_count integer;
  v_received integer;
  v_skipped integer;
  v_pending integer;
  v_status text;
begin
  perform private.assert_operator();
  if p_order_id is null then raise exception 'Thiếu đơn hàng'; end if;
  if p_decisions is null or jsonb_typeof(p_decisions)<>'array' then
    raise exception 'Danh sách sản phẩm không hợp lệ';
  end if;
  v_count:=jsonb_array_length(p_decisions);
  if v_count<1 or v_count>200 then
    raise exception 'Chọn từ 1 đến 200 sản phẩm mỗi lần xử lý';
  end if;
  if (select count(distinct el->>'item_id') from jsonb_array_elements(p_decisions) el)<>v_count then
    raise exception 'Danh sách sản phẩm bị trùng';
  end if;

  select o.id,o.receive_status,o.warehouse_status,o.archived_at
    into v_order from public.orders o where o.id=p_order_id for update;
  if v_order.id is null or v_order.archived_at is not null
    or v_order.receive_status<>'RECEIVED'
    or v_order.warehouse_status<>'READY_TO_TRANSFER' then
    raise exception 'Đơn không còn ở trạng thái chờ xử lý kho';
  end if;

  select count(*),count(distinct rb.warehouse_id),min(rb.warehouse_id::text)::uuid
    into v_receipts,v_warehouse_count,v_warehouse_id
    from public.receive_batch_details rbd
    join public.receive_batches rb on rb.id=rbd.receive_batch_id
    where rbd.order_id=p_order_id;
  if v_receipts<>1 or v_warehouse_count<>1 or v_warehouse_id is null then
    raise exception 'Không xác định được một Kho nhận thực tế cho đơn';
  end if;

  for v_entry in select value from jsonb_array_elements(p_decisions)
  loop
    v_item_id:=(v_entry->>'item_id')::uuid;
    v_action:=upper(btrim(coalesce(v_entry->>'action','')));
    v_reason:=coalesce(nullif(btrim(coalesce(v_entry->>'reason','')),''),nullif(btrim(coalesce(p_note,'')),''));
    if v_item_id is null or v_action not in ('IN','SKIP') then
      raise exception 'Sản phẩm hoặc quyết định xử lý không hợp lệ';
    end if;
    select oi.* into v_item from public.order_items oi
      where oi.id=v_item_id and oi.order_id=p_order_id for update;
    if v_item.id is null then raise exception 'Sản phẩm không thuộc đơn đang xử lý'; end if;
    if v_item.warehouse_item_status<>'PENDING' then
      raise exception 'Sản phẩm đã được nhập hoặc bỏ qua, không thể thực hiện lại';
    end if;
    if v_item.product_variant_id is null or v_item.inventory_multiplier<=0 then
      raise exception 'Cần xác nhận SKU và quy đổi trước khi xử lý kho';
    end if;

    if v_action='IN' then
      v_qty:=v_item.quantity::numeric*v_item.inventory_multiplier;
      if v_qty<=0 or v_qty<>trunc(v_qty) or v_qty>2147483647 then
        raise exception 'Số lượng nhập kho sau quy đổi không hợp lệ';
      end if;
      insert into public.inventory_transactions(
        warehouse_id,product_variant_id,tx_type,quantity,
        reference_type,reference_id,order_item_id,created_by
      ) values (
        v_warehouse_id,v_item.product_variant_id,'IN',v_qty::integer,
        'PURCHASE_RECEIPT',p_order_id,v_item_id,v_actor
      );
      update public.order_items
        set warehouse_item_status='RECEIVED',warehouse_item_processed_at=now(),
            warehouse_item_processed_by=v_actor,warehouse_item_skip_reason=null
        where id=v_item_id;
    else
      if v_reason is null or length(v_reason)>500 then
        raise exception 'Cần nhập lý do bỏ qua kho (tối đa 500 ký tự)';
      end if;
      update public.order_items
        set warehouse_item_status='SKIPPED',warehouse_item_processed_at=now(),
            warehouse_item_processed_by=v_actor,warehouse_item_skip_reason=v_reason
        where id=v_item_id;
    end if;

    insert into public.audit_logs(
      actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
    ) values (
      v_actor,'WAREHOUSE',
      case when v_action='IN' then 'RECEIVE_INTO_STOCK' else 'SKIP_WAREHOUSE_ITEM' end,
      'ORDER',p_order_id::text,
      jsonb_build_object('order_item_id',v_item_id,'warehouse_item_status','PENDING'),
      jsonb_build_object('order_item_id',v_item_id,
        'warehouse_item_status',case when v_action='IN' then 'RECEIVED' else 'SKIPPED' end,
        'warehouse_id',v_warehouse_id,'quantity',case when v_action='IN' then v_qty else null end,
        'reason',case when v_action='SKIP' then v_reason else null end),
      'USER'
    );
  end loop;

  select count(*),
    count(*) filter(where warehouse_item_status='RECEIVED'),
    count(*) filter(where warehouse_item_status='SKIPPED'),
    count(*) filter(where warehouse_item_status='PENDING')
    into v_count,v_received,v_skipped,v_pending
    from public.order_items where order_id=p_order_id;
  if v_pending>0 then v_status:='READY_TO_TRANSFER';
  elsif v_received=v_count then v_status:='WAREHOUSE_RECEIVED';
  elsif v_skipped=v_count then v_status:='WAREHOUSE_SKIPPED';
  else v_status:='WAREHOUSE_MIXED'; end if;

  update public.orders set warehouse_status=v_status::public.warehouse_order_status,updated_at=now()
    where id=p_order_id;
  return jsonb_build_object(
    'order_id',p_order_id,'warehouse_id',v_warehouse_id,
    'warehouse_status',v_status,'received_items',v_received,
    'skipped_items',v_skipped,'pending_items',v_pending
  );
end; $$;

revoke execute on function private.process_warehouse_order_items_v21_impl(uuid,jsonb,text)
  from public,anon,authenticated;
grant execute on function private.process_warehouse_order_items_v21_impl(uuid,jsonb,text)
  to authenticated;

create or replace function public.process_warehouse_order_items_v21(
  p_order_id uuid,p_decisions jsonb,p_note text default null
)
returns jsonb language sql set search_path='' as $$
  select private.process_warehouse_order_items_v21_impl(p_order_id,p_decisions,p_note);
$$;
revoke execute on function public.process_warehouse_order_items_v21(uuid,jsonb,text)
  from public,anon;
grant execute on function public.process_warehouse_order_items_v21(uuid,jsonb,text)
  to authenticated;

-- Old whole-order RPC remains callable and atomic; it can only process items
-- still PENDING, preventing mixed/partial orders from ever entering twice.
create or replace function private.receive_orders_into_warehouse_impl(
  p_order_ids uuid[],p_note text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_order_count integer;
  v_warehouse_count integer;
  v_receipt_count integer;
  v_warehouse_id uuid;
  v_violation integer;
  v_order record;
  v_payload jsonb;
  v_tx_count integer:=0;
begin
  perform private.assert_operator();
  select count(*),count(distinct x) into v_input_count,v_distinct_count
    from unnest(p_order_ids) as t(x);
  if v_input_count=0 or v_input_count is null then raise exception 'Chưa chọn đơn cần nhập kho'; end if;
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

  -- Avoid interleaved locking order across concurrent old/new RPCs.
  for v_order in select o.id from public.orders o
    where o.id=any(p_order_ids) order by o.id for update
  loop
    null;
  end loop;

  select count(*) into v_order_count
  from public.orders o
  where o.id=any(p_order_ids)
    and o.archived_at is null and o.receive_status='RECEIVED'
    and o.warehouse_status='READY_TO_TRANSFER';
  if v_order_count<>v_input_count then
    raise exception 'Có đơn không còn ở trạng thái chờ nhập kho';
  end if;
  select count(*) into v_violation
    from public.order_items oi
    where oi.order_id=any(p_order_ids)
      and (oi.warehouse_item_status<>'PENDING'
        or oi.product_variant_id is null or oi.inventory_multiplier<=0);
  if v_violation>0 then raise exception 'Có sản phẩm đã xử lý hoặc chưa bóc tách'; end if;
  if exists(select 1 from public.orders o where o.id=any(p_order_ids)
    and not exists(select 1 from public.order_items oi where oi.order_id=o.id)) then
    raise exception 'Có đơn không có sản phẩm để nhập kho';
  end if;

  for v_order in select o.id from public.orders o
    where o.id=any(p_order_ids) order by o.id
  loop
    select jsonb_agg(jsonb_build_object('item_id',oi.id,'action','IN') order by oi.id)
      into v_payload from public.order_items oi where oi.order_id=v_order.id;
    perform private.process_warehouse_order_items_v21_impl(v_order.id,v_payload,p_note);
    v_tx_count:=v_tx_count+jsonb_array_length(v_payload);
  end loop;
  return jsonb_build_object('warehouse_id',v_warehouse_id,
    'order_count',v_input_count,'transaction_count',v_tx_count);
end; $$;
-- Grants for the existing private and public receipt RPC remain as configured
-- by migrations 0048/0049.


-- UPDATE RLS on order_items currently grants Operator UPDATE across columns.
-- Do not trust UI guards alone: only the vetted SECURITY DEFINER transaction
-- (owned by postgres on this project) may transition an item to RECEIVED/SKIPPED.
create or replace function private.guard_warehouse_item_state_v21()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.warehouse_item_status<>'PENDING'
      or new.warehouse_item_processed_at is not null
      or new.warehouse_item_processed_by is not null
      or new.warehouse_item_skip_reason is not null then
      raise exception 'Sản phẩm mới phải bắt đầu ở trạng thái chờ xử lý kho';
    end if;
  elsif current_user<>'postgres'
    and (new.warehouse_item_status is distinct from old.warehouse_item_status
      or new.warehouse_item_processed_at is distinct from old.warehouse_item_processed_at
      or new.warehouse_item_processed_by is distinct from old.warehouse_item_processed_by
      or new.warehouse_item_skip_reason is distinct from old.warehouse_item_skip_reason)
  then
    raise exception 'Chỉ nghiệp vụ xác nhận kho mới được cập nhật trạng thái sản phẩm';
  end if;
  return new;
end; $$;

drop trigger if exists guard_warehouse_item_state_v21 on public.order_items;
create trigger guard_warehouse_item_state_v21
  before insert or update of warehouse_item_status,warehouse_item_processed_at,warehouse_item_processed_by,warehouse_item_skip_reason on public.order_items
  for each row execute function private.guard_warehouse_item_state_v21();

-- Completed rows cannot be deleted directly through an Operator's table role.
-- Normal administrative RPCs running as postgres remain responsible for any
-- authorized permanent-delete lifecycle and must preserve ledger integrity.
create or replace function private.guard_completed_warehouse_item_delete_v21()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.warehouse_item_status<>'PENDING' and current_user<>'postgres' then
    raise exception 'Không được xóa trực tiếp sản phẩm đã xử lý kho';
  end if;
  return old;
end; $$;

drop trigger if exists guard_completed_warehouse_item_delete_v21 on public.order_items;
create trigger guard_completed_warehouse_item_delete_v21
  before delete on public.order_items
  for each row execute function private.guard_completed_warehouse_item_delete_v21();


-- Legacy RLS allows Operator INSERT into inventory_transactions for stocktake
-- and adjustment tools. Limit forged PURCHASE_RECEIPT inserts without removing
-- legitimate stocktake/adjustment and POS transaction paths.
create or replace function private.guard_direct_purchase_receipt_v21()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.reference_type='PURCHASE_RECEIPT' then
    if current_user<>'postgres' then
      raise exception 'Chỉ nghiệp vụ nhập kho xác nhận mới được tạo giao dịch nhận hàng';
    end if;
    if new.order_item_id is null then
      raise exception 'Giao dịch nhận hàng mới phải tham chiếu sản phẩm mua';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_direct_purchase_receipt_v21 on public.inventory_transactions;
create trigger guard_direct_purchase_receipt_v21
  before insert on public.inventory_transactions
  for each row execute function private.guard_direct_purchase_receipt_v21();
