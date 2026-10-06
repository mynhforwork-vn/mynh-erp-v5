alter table public.sale_returns
  add column if not exists return_value numeric(18,2) not null default 0 check (return_value >= 0),
  add column if not exists debt_relief numeric(18,2) not null default 0 check (debt_relief >= 0);

create or replace function private.cancel_pos_sale_impl(
  p_sale_id uuid,
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
  v_refund numeric(18,2);
  v_open_debt numeric(18,2);
  v_subtotal numeric(18,2);
begin
  perform private.assert_operator();

  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Không tìm thấy hóa đơn'; end if;
  if v_sale.sale_status <> 'COMPLETED' then
    raise exception 'Chỉ có thể huỷ hóa đơn đang hoàn tất';
  end if;
  if exists(select 1 from public.sale_returns where sale_id=p_sale_id) then
    raise exception 'Hóa đơn đã có nghiệp vụ huỷ/hoàn';
  end if;

  v_refund := greatest(coalesce(v_sale.paid_amount,0),0);
  v_open_debt := greatest(coalesce(v_sale.debt_amount,v_sale.total_amount-v_sale.paid_amount),0);
  select coalesce(sum(quantity*sale_price),0) into v_subtotal
  from public.sale_items where sale_id=p_sale_id;

  insert into public.sale_returns(
    sale_id,return_type,reason,return_value,debt_relief,refund_amount,created_by
  )
  values(
    p_sale_id,'CANCEL',nullif(btrim(coalesce(p_reason,'')),''),
    v_sale.total_amount,v_open_debt,v_refund,v_actor
  )
  returning id into v_return_id;

  insert into public.sale_return_items(
    sale_return_id,sale_item_id,warehouse_id,product_variant_id,quantity,refund_amount
  )
  select
    v_return_id,si.id,si.warehouse_id,si.product_variant_id,si.quantity,
    case when v_subtotal>0
      then round(v_refund*((si.quantity*si.sale_price)/v_subtotal),2)
      else 0 end
  from public.sale_items si where si.sale_id=p_sale_id;

  insert into public.inventory_transactions(
    warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
  )
  select si.warehouse_id,si.product_variant_id,'RETURN',sum(si.quantity)::integer,
         'SALE_CANCEL',v_return_id,v_actor
  from public.sale_items si
  where si.sale_id=p_sale_id
  group by si.warehouse_id,si.product_variant_id;

  if v_open_debt>0 then
    if v_sale.customer_id is null then raise exception 'Hóa đơn có công nợ nhưng không có khách hàng'; end if;
    insert into public.debt_ledger(customer_id,reference_type,reference_id,debit,credit,transaction_at,note)
    values(
      v_sale.customer_id,'SALE_CANCEL',v_return_id,0,v_open_debt,now(),
      'Triệt công nợ khi huỷ hóa đơn '||coalesce(v_sale.invoice_code,p_sale_id::text)
    );
  end if;

  if v_refund>0 then
    insert into public.finance_transactions(
      tx_type,category,amount,reference_type,reference_id,transaction_at,created_by,note,status
    )
    values(
      'EXPENSE','SALE_CANCEL_REFUND',v_refund,'SALE_CANCEL',v_return_id,now(),v_actor,
      'Hoàn tiền khi huỷ hóa đơn '||coalesce(v_sale.invoice_code,p_sale_id::text),'POSTED'
    );
  end if;

  update public.sales
  set sale_status='CANCELLED',
      subtotal=0,
      discount_amount=0,
      other_fee=0,
      total_amount=0,
      paid_amount=0,
      payment_status='PAID',
      updated_at=now()
  where id=p_sale_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SALES','CANCEL_SALE','SALE',p_sale_id::text,
    jsonb_build_object(
      'sale_status',v_sale.sale_status,'subtotal',v_sale.subtotal,'discount_amount',v_sale.discount_amount,
      'other_fee',v_sale.other_fee,'total_amount',v_sale.total_amount,'paid_amount',v_sale.paid_amount,
      'debt_amount',v_sale.debt_amount
    ),
    jsonb_build_object(
      'sale_status','CANCELLED','sale_return_id',v_return_id,'return_value',v_sale.total_amount,
      'refund_amount',v_refund,'debt_reversed',v_open_debt,
      'reason',nullif(btrim(coalesce(p_reason,'')),'')
    ),
    'USER'
  );

  return jsonb_build_object(
    'sale_id',p_sale_id,'sale_return_id',v_return_id,'sale_status','CANCELLED',
    'return_value',v_sale.total_amount,'refund_amount',v_refund,'debt_reversed',v_open_debt
  );
end;
$$;
