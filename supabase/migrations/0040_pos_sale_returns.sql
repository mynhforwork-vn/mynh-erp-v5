-- Atomic partial/full POS return with inventory, debt and finance synchronization.
create or replace function private.return_pos_sale_impl(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_return_id uuid;
  v_gross numeric(18,2);
  v_return_discount numeric(18,2);
  v_return_fee numeric(18,2);
  v_return_value numeric(18,2);
  v_debt_relief numeric(18,2);
  v_cash_refund numeric(18,2);
  v_new_subtotal numeric(18,2);
  v_new_discount numeric(18,2);
  v_new_fee numeric(18,2);
  v_new_total numeric(18,2);
  v_new_paid numeric(18,2);
  v_new_status text;
  v_payment_status public.sale_payment_status;
  v_invalid integer;
  v_remaining integer;
begin
  perform private.assert_operator();

  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Không tìm thấy hóa đơn'; end if;
  if v_sale.sale_status not in ('COMPLETED','PARTIAL_RETURN') then
    raise exception 'Hóa đơn không còn ở trạng thái cho phép hoàn hàng';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'Chưa chọn sản phẩm hoàn';
  end if;

  with requested as (
    select (x->>'sale_item_id')::uuid sale_item_id,
           sum((x->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) x
    group by 1
  ), checked as (
    select r.sale_item_id,r.quantity,si.quantity sold_qty,
           coalesce((
             select sum(sri.quantity)
             from public.sale_return_items sri
             join public.sale_returns sr on sr.id=sri.sale_return_id
             where sr.sale_id=p_sale_id
               and sr.return_type in ('PARTIAL','FULL')
               and sri.sale_item_id=r.sale_item_id
           ),0) returned_qty,
           si.sale_price
    from requested r
    left join public.sale_items si on si.id=r.sale_item_id and si.sale_id=p_sale_id
  )
  select count(*) filter(
    where sold_qty is null or quantity is null or quantity<=0 or quantity>sold_qty-returned_qty
  )
  into v_invalid
  from checked;

  if v_invalid>0 then raise exception 'Số lượng hoàn không hợp lệ'; end if;

  with requested as (
    select (x->>'sale_item_id')::uuid sale_item_id,
           sum((x->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) x group by 1
  )
  select coalesce(sum(r.quantity*si.sale_price),0)
  into v_gross
  from requested r join public.sale_items si on si.id=r.sale_item_id and si.sale_id=p_sale_id;

  if v_gross<=0 or v_sale.subtotal<=0 then raise exception 'Giá trị hoàn không hợp lệ'; end if;

  v_return_discount := round(v_sale.discount_amount*(v_gross/v_sale.subtotal),2);
  v_return_fee := round(v_sale.other_fee*(v_gross/v_sale.subtotal),2);
  v_return_value := least(v_sale.total_amount, v_gross-v_return_discount+v_return_fee);

  if v_return_value<=0 then raise exception 'Giá trị hoàn phải lớn hơn 0'; end if;

  v_debt_relief := least(v_return_value,coalesce(v_sale.debt_amount,0));
  v_cash_refund := greatest(v_return_value-v_debt_relief,0);

  v_new_subtotal := greatest(v_sale.subtotal-v_gross,0);
  v_new_discount := greatest(v_sale.discount_amount-v_return_discount,0);
  v_new_fee := greatest(v_sale.other_fee-v_return_fee,0);
  v_new_total := greatest(v_sale.total_amount-v_return_value,0);
  v_new_paid := greatest(v_sale.paid_amount-v_cash_refund,0);

  with item_state as (
    select si.id,si.quantity sold_qty,
      coalesce((
        select sum(sri.quantity)
        from public.sale_return_items sri
        join public.sale_returns sr on sr.id=sri.sale_return_id
        where sr.sale_id=p_sale_id
          and sr.return_type in ('PARTIAL','FULL')
          and sri.sale_item_id=si.id
      ),0)
      + coalesce((
        select sum((x->>'quantity')::integer)
        from jsonb_array_elements(p_items) x
        where (x->>'sale_item_id')::uuid=si.id
      ),0) returned_qty
    from public.sale_items si
    where si.sale_id=p_sale_id
  )
  select coalesce(sum(greatest(sold_qty-returned_qty,0)),0)::integer
  into v_remaining
  from item_state;

  v_new_status := case when v_remaining=0 then 'RETURNED' else 'PARTIAL_RETURN' end;
  v_payment_status := case
    when v_new_total<=0 or v_new_paid>=v_new_total then 'PAID'::public.sale_payment_status
    when v_new_paid<=0 then 'UNPAID'::public.sale_payment_status
    else 'PARTIAL'::public.sale_payment_status
  end;

  insert into public.sale_returns(
    sale_id,return_type,reason,return_value,debt_relief,refund_amount,created_by
  )
  values(
    p_sale_id,case when v_new_status='RETURNED' then 'FULL' else 'PARTIAL' end,
    nullif(btrim(coalesce(p_reason,'')),''),v_return_value,v_debt_relief,v_cash_refund,v_actor
  )
  returning id into v_return_id;

  with requested as (
    select (x->>'sale_item_id')::uuid sale_item_id,
           sum((x->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) x group by 1
  )
  insert into public.sale_return_items(
    sale_return_id,sale_item_id,warehouse_id,product_variant_id,quantity,refund_amount
  )
  select v_return_id,si.id,si.warehouse_id,si.product_variant_id,r.quantity,
         case when v_gross>0 then round(v_cash_refund*((r.quantity*si.sale_price)/v_gross),2) else 0 end
  from requested r
  join public.sale_items si on si.id=r.sale_item_id and si.sale_id=p_sale_id;

  with requested as (
    select (x->>'sale_item_id')::uuid sale_item_id,
           sum((x->>'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) x group by 1
  )
  insert into public.inventory_transactions(
    warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
  )
  select si.warehouse_id,si.product_variant_id,'RETURN',sum(r.quantity)::integer,
         'SALE_RETURN',v_return_id,v_actor
  from requested r
  join public.sale_items si on si.id=r.sale_item_id and si.sale_id=p_sale_id
  group by si.warehouse_id,si.product_variant_id;

  if v_debt_relief>0 then
    if v_sale.customer_id is null then raise exception 'Hóa đơn có công nợ nhưng không có khách hàng'; end if;
    insert into public.debt_ledger(customer_id,reference_type,reference_id,debit,credit,transaction_at,note)
    values(
      v_sale.customer_id,'SALE_RETURN',v_return_id,0,v_debt_relief,now(),
      'Giảm công nợ do hoàn hàng '||coalesce(v_sale.invoice_code,p_sale_id::text)
    );
  end if;

  if v_cash_refund>0 then
    insert into public.finance_transactions(
      tx_type,category,amount,reference_type,reference_id,transaction_at,created_by,note,status
    )
    values(
      'EXPENSE','SALE_RETURN_REFUND',v_cash_refund,'SALE_RETURN',v_return_id,now(),v_actor,
      'Hoàn tiền do trả hàng '||coalesce(v_sale.invoice_code,p_sale_id::text),'POSTED'
    );
  end if;

  update public.sales
  set subtotal=v_new_subtotal,
      discount_amount=v_new_discount,
      other_fee=v_new_fee,
      total_amount=v_new_total,
      paid_amount=v_new_paid,
      payment_status=v_payment_status,
      sale_status=v_new_status,
      updated_at=now()
  where id=p_sale_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SALES','RETURN_SALE','SALE',p_sale_id::text,
    jsonb_build_object(
      'sale_status',v_sale.sale_status,'subtotal',v_sale.subtotal,'discount_amount',v_sale.discount_amount,
      'other_fee',v_sale.other_fee,'total_amount',v_sale.total_amount,'paid_amount',v_sale.paid_amount,
      'debt_amount',v_sale.debt_amount
    ),
    jsonb_build_object(
      'sale_status',v_new_status,'sale_return_id',v_return_id,'return_value',v_return_value,
      'refund_amount',v_cash_refund,'debt_relief',v_debt_relief,'remaining_quantity',v_remaining,
      'reason',nullif(btrim(coalesce(p_reason,'')),'')
    ),
    'USER'
  );

  return jsonb_build_object(
    'sale_id',p_sale_id,'sale_return_id',v_return_id,'sale_status',v_new_status,
    'return_value',v_return_value,'refund_amount',v_cash_refund,'debt_relief',v_debt_relief,
    'remaining_quantity',v_remaining,'total_amount',v_new_total,'paid_amount',v_new_paid
  );
end;
$$;

revoke execute on function private.return_pos_sale_impl(uuid,jsonb,text) from public,anon;
grant execute on function private.return_pos_sale_impl(uuid,jsonb,text) to authenticated;

create or replace function public.return_pos_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
begin
  perform private.assert_operator();
  return private.return_pos_sale_impl(p_sale_id,p_items,p_reason);
end;
$$;

revoke execute on function public.return_pos_sale(uuid,jsonb,text) from public,anon;
grant execute on function public.return_pos_sale(uuid,jsonb,text) to authenticated;
