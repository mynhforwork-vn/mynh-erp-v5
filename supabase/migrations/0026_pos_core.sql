alter table public.product_variants
  add column if not exists barcode text null;

create unique index if not exists product_variants_barcode_uq
  on public.product_variants(barcode)
  where barcode is not null and btrim(barcode) <> '';

alter table public.sales
  add column if not exists invoice_code text null,
  add column if not exists warehouse_id uuid null references public.warehouses(id),
  add column if not exists subtotal numeric not null default 0,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists other_fee numeric not null default 0,
  add column if not exists sale_status text not null default 'COMPLETED',
  add column if not exists cash_received numeric not null default 0,
  add column if not exists change_amount numeric not null default 0;

create unique index if not exists sales_invoice_code_uq
  on public.sales(invoice_code)
  where invoice_code is not null;

alter table public.sales drop constraint if exists sales_sale_status_allowed;
alter table public.sales add constraint sales_sale_status_allowed
  check (sale_status = any(array['COMPLETED'::text,'CANCELLED'::text,'PARTIAL_RETURN'::text,'RETURNED'::text]));

alter table public.sales drop constraint if exists sales_pos_amounts_check;
alter table public.sales add constraint sales_pos_amounts_check
  check (
    subtotal >= 0 and discount_amount >= 0 and other_fee >= 0
    and cash_received >= 0 and change_amount >= 0
  );

create sequence if not exists public.pos_invoice_seq;

create table if not exists public.sale_payments(
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null,
  amount numeric not null,
  tendered_amount numeric null,
  change_amount numeric not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint sale_payments_method_allowed check(method = any(array['CASH'::text,'TRANSFER'::text])),
  constraint sale_payments_amount_check check(amount > 0 and coalesce(tendered_amount,amount) >= amount and change_amount >= 0)
);

alter table public.sale_payments enable row level security;

drop policy if exists sale_payments_read on public.sale_payments;
create policy sale_payments_read on public.sale_payments
for select to authenticated
using ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text,'viewer'::text]));

drop policy if exists sale_payments_insert on public.sale_payments;
create policy sale_payments_insert on public.sale_payments
for insert to authenticated
with check ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text]));

drop policy if exists sale_payments_update on public.sale_payments;
create policy sale_payments_update on public.sale_payments
for update to authenticated
using ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text]))
with check ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text]));

drop policy if exists sale_payments_delete on public.sale_payments;
create policy sale_payments_delete on public.sale_payments
for delete to authenticated
using ((select public.current_erp_role()) = 'admin'::text);

create or replace function private.create_pos_sale_impl(
  p_warehouse_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0,
  p_other_fee numeric default 0,
  p_payments jsonb default '[]'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_sale_id uuid;
  v_invoice_code text;
  v_subtotal numeric(18,2) := 0;
  v_discount numeric(18,2) := greatest(coalesce(p_discount_amount,0),0);
  v_other_fee numeric(18,2) := greatest(coalesce(p_other_fee,0),0);
  v_total numeric(18,2);
  v_paid numeric(18,2) := 0;
  v_debt numeric(18,2);
  v_status public.sale_payment_status;
  v_bad integer := 0;
  v_short integer := 0;
  v_cash_received numeric(18,2) := 0;
  v_change numeric(18,2) := 0;
  v_payment jsonb;
  v_variant uuid;
begin
  perform private.assert_operator();

  if p_warehouse_id is null or not exists(
    select 1 from public.warehouses where id=p_warehouse_id and is_active=true
  ) then raise exception 'Kho bán không hợp lệ'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Giỏ hàng đang trống';
  end if;

  if jsonb_typeof(coalesce(p_payments,'[]'::jsonb)) <> 'array' then
    raise exception 'Thông tin thanh toán không hợp lệ';
  end if;

  if p_customer_id is not null and not exists(
    select 1 from public.customers where id=p_customer_id
  ) then raise exception 'Khách hàng không tồn tại'; end if;

  with src as (
    select
      (x->>'product_variant_id')::uuid product_variant_id,
      (x->>'quantity')::integer quantity,
      case when x ? 'sale_price' and nullif(x->>'sale_price','') is not null
        then (x->>'sale_price')::numeric else pv.sale_price end sale_price
    from jsonb_array_elements(p_items) x
    left join public.product_variants pv on pv.id=(x->>'product_variant_id')::uuid
  )
  select
    count(*) filter(
      where product_variant_id is null
        or quantity is null or quantity<=0
        or sale_price is null or sale_price<0
        or not exists(select 1 from public.product_variants pv where pv.id=product_variant_id)
    ),
    coalesce(sum(quantity*sale_price),0)
  into v_bad,v_subtotal
  from src;

  if v_bad>0 then raise exception 'Có sản phẩm trong giỏ không hợp lệ'; end if;
  if v_discount>v_subtotal+v_other_fee then raise exception 'Giảm giá vượt quá tổng tiền'; end if;

  v_total := v_subtotal-v_discount+v_other_fee;
  if v_total<=0 then raise exception 'Tổng thanh toán phải lớn hơn 0'; end if;

  for v_variant in
    select distinct (x->>'product_variant_id')::uuid
    from jsonb_array_elements(p_items) x
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(p_warehouse_id::text||':'||v_variant::text,0)
    );
  end loop;

  with requested as (
    select
      (x->>'product_variant_id')::uuid product_variant_id,
      sum((x->>'quantity')::integer)::bigint qty
    from jsonb_array_elements(p_items) x
    group by 1
  ), balances as (
    select r.product_variant_id,r.qty,
      coalesce((
        select sum(
          case
            when it.tx_type in ('IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN') then it.quantity
            when it.tx_type in ('OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT') then -it.quantity
            else 0
          end
        )
        from public.inventory_transactions it
        where it.warehouse_id=p_warehouse_id
          and it.product_variant_id=r.product_variant_id
      ),0) balance
    from requested r
  )
  select count(*) filter(where balance<qty) into v_short from balances;

  if v_short>0 then raise exception 'Không đủ tồn kho cho một hoặc nhiều sản phẩm'; end if;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    if upper(coalesce(v_payment->>'method','')) not in ('CASH','TRANSFER') then
      raise exception 'Phương thức thanh toán không hợp lệ';
    end if;
    if coalesce((v_payment->>'amount')::numeric,0)<=0 then
      raise exception 'Số tiền thanh toán phải lớn hơn 0';
    end if;
    if upper(v_payment->>'method')='CASH' then
      if coalesce(nullif(v_payment->>'tendered_amount','')::numeric,(v_payment->>'amount')::numeric)
          < (v_payment->>'amount')::numeric then
        raise exception 'Tiền khách đưa nhỏ hơn tiền mặt cần thu';
      end if;
      v_cash_received := v_cash_received
        + coalesce(nullif(v_payment->>'tendered_amount','')::numeric,(v_payment->>'amount')::numeric);
      v_change := v_change
        + coalesce(nullif(v_payment->>'tendered_amount','')::numeric,(v_payment->>'amount')::numeric)
        - (v_payment->>'amount')::numeric;
    end if;
    v_paid := v_paid + (v_payment->>'amount')::numeric;
  end loop;

  if v_paid>v_total then raise exception 'Số tiền đã thu vượt tổng thanh toán'; end if;
  v_debt := v_total-v_paid;

  if v_debt>0 and p_customer_id is null then
    raise exception 'Cần chọn khách hàng khi hóa đơn còn công nợ';
  end if;

  v_status := case
    when v_paid=0 then 'UNPAID'::public.sale_payment_status
    when v_paid<v_total then 'PARTIAL'::public.sale_payment_status
    else 'PAID'::public.sale_payment_status
  end;

  v_invoice_code :=
    'POS-'||
    to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYMMDD')||
    '-'||
    lpad(nextval('public.pos_invoice_seq')::text,6,'0');

  insert into public.sales(
    customer_id,sale_at,total_amount,paid_amount,debt_amount,payment_status,
    created_by,note,invoice_code,warehouse_id,subtotal,discount_amount,other_fee,
    sale_status,cash_received,change_amount
  ) values(
    p_customer_id,now(),v_total,v_paid,v_debt,v_status,
    v_actor,p_note,v_invoice_code,p_warehouse_id,v_subtotal,v_discount,v_other_fee,
    'COMPLETED',v_cash_received,v_change
  ) returning id into v_sale_id;

  insert into public.sale_items(
    sale_id,warehouse_id,product_variant_id,quantity,unit_cost,sale_price
  )
  select
    v_sale_id,p_warehouse_id,(x->>'product_variant_id')::uuid,(x->>'quantity')::integer,0,
    case when x ? 'sale_price' and nullif(x->>'sale_price','') is not null
      then (x->>'sale_price')::numeric else pv.sale_price end
  from jsonb_array_elements(p_items) x
  join public.product_variants pv on pv.id=(x->>'product_variant_id')::uuid;

  insert into public.inventory_transactions(
    warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
  )
  select p_warehouse_id,product_variant_id,'SALE',sum(quantity),'SALE',v_sale_id,v_actor
  from public.sale_items
  where sale_id=v_sale_id
  group by product_variant_id;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    insert into public.sale_payments(
      sale_id,method,amount,tendered_amount,change_amount,created_by
    ) values(
      v_sale_id,
      upper(v_payment->>'method'),
      (v_payment->>'amount')::numeric,
      case when upper(v_payment->>'method')='CASH'
        then coalesce(nullif(v_payment->>'tendered_amount','')::numeric,(v_payment->>'amount')::numeric)
        else null end,
      case when upper(v_payment->>'method')='CASH'
        then coalesce(nullif(v_payment->>'tendered_amount','')::numeric,(v_payment->>'amount')::numeric)
          -(v_payment->>'amount')::numeric
        else 0 end,
      v_actor
    );

    insert into public.finance_transactions(
      tx_type,category,amount,reference_type,reference_id,transaction_at,created_by,note
    ) values(
      'INCOME',
      case when upper(v_payment->>'method')='CASH' then 'SALE_CASH' else 'SALE_TRANSFER' end,
      (v_payment->>'amount')::numeric,'SALE',v_sale_id,now(),v_actor,
      case when upper(v_payment->>'method')='CASH' then 'POS · Tiền mặt' else 'POS · Chuyển khoản' end
    );
  end loop;

  if v_debt>0 then
    insert into public.debt_ledger(
      customer_id,reference_type,reference_id,debit,credit,transaction_at,note
    ) values(
      p_customer_id,'SALE',v_sale_id,v_debt,0,now(),'Công nợ phát sinh từ POS'
    );
  end if;

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  ) values(
    v_actor,'SALES','POS_CHECKOUT','SALE',v_sale_id::text,
    jsonb_build_object(
      'invoice_code',v_invoice_code,'warehouse_id',p_warehouse_id,
      'subtotal',v_subtotal,'discount_amount',v_discount,'other_fee',v_other_fee,
      'total_amount',v_total,'paid_amount',v_paid,'debt_amount',v_debt,
      'payment_status',v_status,'customer_id',p_customer_id
    ),
    'USER'
  );

  return jsonb_build_object(
    'sale_id',v_sale_id,'invoice_code',v_invoice_code,
    'subtotal',v_subtotal,'discount_amount',v_discount,'other_fee',v_other_fee,
    'total_amount',v_total,'paid_amount',v_paid,'debt_amount',v_debt,
    'payment_status',v_status,'cash_received',v_cash_received,'change_amount',v_change
  );
end;
$function$;

create or replace function public.create_pos_sale(
  p_warehouse_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0,
  p_other_fee numeric default 0,
  p_payments jsonb default '[]'::jsonb,
  p_note text default null
)
returns jsonb
language sql
set search_path=''
as $function$
  select private.create_pos_sale_impl(
    p_warehouse_id,p_customer_id,p_items,p_discount_amount,p_other_fee,p_payments,p_note
  );
$function$;

revoke all on function public.create_pos_sale(uuid,uuid,jsonb,numeric,numeric,jsonb,text) from public;
grant execute on function public.create_pos_sale(uuid,uuid,jsonb,numeric,numeric,jsonb,text) to authenticated;
