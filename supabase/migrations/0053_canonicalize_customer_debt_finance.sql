-- Canonicalize customer debt collection finance posting.
-- One customer payment must create one Finance Document and one DEBT_COLLECTION transaction.
-- Also allow COMBINED payment method and preserve its cash/transfer split.

alter table public.finance_transactions
  drop constraint if exists finance_transactions_payment_method_check;

alter table public.finance_transactions
  add constraint finance_transactions_payment_method_check
  check (payment_method is null or payment_method in ('CASH','TRANSFER','COMBINED'));

create or replace function private.create_finance_from_customer_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_payment public.customer_payments%rowtype;
  v_doc_id uuid;
  v_code text;
  v_category_id uuid;
  v_customer_name text;
begin
  select * into v_payment
  from public.customer_payments
  where id=p_payment_id;

  if not found or coalesce(v_payment.amount,0)<=0 then
    return null;
  end if;

  select id into v_doc_id
  from public.finance_documents
  where source_type='CUSTOMER_PAYMENT' and source_id=p_payment_id;
  if v_doc_id is not null then return v_doc_id; end if;

  select name into v_customer_name
  from public.customers
  where id=v_payment.customer_id;

  select id into v_category_id
  from public.finance_categories
  where code='DEBT_COLLECTION';

  v_code:='PT-'||to_char(v_payment.paid_at at time zone 'Asia/Ho_Chi_Minh','YYMMDD')
    ||'-'||lpad(nextval('public.finance_document_seq')::text,6,'0');

  insert into public.finance_documents(
    document_code,document_type,document_status,occurred_at,counterparty_name,
    payment_method,cash_amount,transfer_amount,total_amount,source_type,source_id,
    note,created_by,posted_by,posted_at
  ) values (
    v_code,'INCOME','POSTED',v_payment.paid_at,v_customer_name,
    v_payment.payment_method,
    v_payment.cash_amount,
    v_payment.transfer_amount,
    v_payment.amount,'CUSTOMER_PAYMENT',p_payment_id,
    coalesce(v_payment.note,v_payment.receipt_code,'Thu công nợ'),
    v_payment.created_by,v_payment.created_by,v_payment.paid_at
  )
  returning id into v_doc_id;

  insert into public.finance_document_lines(
    document_id,category_id,description,amount,line_order,reference_type,reference_id
  ) values (
    v_doc_id,v_category_id,
    'Thu công nợ'||case when v_customer_name is not null then ' · '||v_customer_name else '' end,
    v_payment.amount,1,'CUSTOMER_PAYMENT',p_payment_id
  );

  insert into public.finance_transactions(
    tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,
    created_by,note,finance_document_id,payment_method,status
  ) values (
    'INCOME','DEBT_COLLECTION',v_category_id,v_payment.amount,
    'CUSTOMER_PAYMENT',p_payment_id,v_payment.paid_at,v_payment.created_by,
    coalesce(v_payment.receipt_code,'Thu công nợ'),v_doc_id,v_payment.payment_method,'POSTED'
  );

  return v_doc_id;
end;
$function$;

-- Fix customer debt collection against generated sales.debt_amount.
-- sales.debt_amount is derived by PostgreSQL; only paid_amount/payment_status are mutable.

create or replace function public.register_customer_payment_v2(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text default 'CASH'::text,
  p_cash_amount numeric default 0,
  p_transfer_amount numeric default 0,
  p_note text default null::text,
  p_receipt_code text default null::text,
  p_allocations jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_payment_id uuid;
  v_balance numeric(18,2);
  v_remaining numeric(18,2);
  v_alloc numeric(18,2);
  v_sale record;
  v_allocated numeric(18,2) := 0;
  v_receipt_code text;
  v_method text := upper(coalesce(p_payment_method,'CASH'));
  v_cash numeric(18,2) := greatest(coalesce(p_cash_amount,0),0);
  v_transfer numeric(18,2) := greatest(coalesce(p_transfer_amount,0),0);
  v_item record;
begin
  perform private.assert_operator();

  if p_amount is null or p_amount<=0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  if v_method not in ('CASH','TRANSFER','COMBINED') then
    raise exception 'Invalid payment method';
  end if;

  if not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'Customer not found';
  end if;

  select coalesce(sum(debit-credit),0)
    into v_balance
    from public.debt_ledger
   where customer_id=p_customer_id;

  if v_balance<=0 then raise exception 'Customer has no outstanding debt'; end if;
  if p_amount>v_balance then raise exception 'Payment cannot exceed outstanding debt'; end if;

  if v_method='CASH' then
    v_cash := p_amount;
    v_transfer := 0;
  elsif v_method='TRANSFER' then
    v_cash := 0;
    v_transfer := p_amount;
  else
    if round(v_cash+v_transfer,2)<>round(p_amount,2) then
      raise exception 'Combined payment parts must equal payment amount';
    end if;
  end if;

  v_receipt_code := nullif(btrim(p_receipt_code),'');
  if v_receipt_code is null then
    v_receipt_code := 'PTN-' ||
      to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  end if;

  insert into public.customer_payments(
    customer_id,amount,paid_at,created_by,note,receipt_code,payment_method,cash_amount,transfer_amount
  )
  values(
    p_customer_id,p_amount,now(),v_actor,nullif(btrim(coalesce(p_note,'')),''),
    v_receipt_code,v_method,v_cash,v_transfer
  )
  returning id into v_payment_id;

  v_remaining := p_amount;

  if p_allocations is not null and jsonb_typeof(p_allocations)='array' and jsonb_array_length(p_allocations)>0 then
    if (
      select coalesce(sum((x->>'amount')::numeric),0)
      from jsonb_array_elements(p_allocations) x
    ) <> p_amount then
      raise exception 'Allocation total must equal payment amount';
    end if;

    for v_item in
      select (x->>'sale_id')::uuid as sale_id, (x->>'amount')::numeric as amount
      from jsonb_array_elements(p_allocations) x
    loop
      if v_item.amount<=0 then raise exception 'Allocation amount must be greater than 0'; end if;

      select id,total_amount,paid_amount
        into v_sale
        from public.sales
       where id=v_item.sale_id
         and customer_id=p_customer_id
       for update;

      if not found then raise exception 'Sale not found for customer'; end if;
      if v_item.amount > (v_sale.total_amount-v_sale.paid_amount) then
        raise exception 'Allocation exceeds outstanding sale debt';
      end if;

      update public.sales
         set paid_amount=paid_amount+v_item.amount,
             payment_status=case
               when paid_amount+v_item.amount>=total_amount then 'PAID'::public.sale_payment_status
               when paid_amount+v_item.amount>0 then 'PARTIAL'::public.sale_payment_status
               else 'UNPAID'::public.sale_payment_status
             end,
             updated_at=now()
       where id=v_item.sale_id;

      insert into public.customer_payment_allocations(customer_payment_id,sale_id,amount)
      values(v_payment_id,v_item.sale_id,v_item.amount);

      v_allocated := v_allocated+v_item.amount;
      v_remaining := v_remaining-v_item.amount;
    end loop;
  else
    for v_sale in
      select id,total_amount,paid_amount
        from public.sales
       where customer_id=p_customer_id
         and paid_amount<total_amount
       order by sale_at,id
       for update
    loop
      exit when v_remaining<=0;
      v_alloc := least(v_sale.total_amount-v_sale.paid_amount,v_remaining);

      update public.sales
         set paid_amount=paid_amount+v_alloc,
             payment_status=case
               when paid_amount+v_alloc>=total_amount then 'PAID'::public.sale_payment_status
               when paid_amount+v_alloc>0 then 'PARTIAL'::public.sale_payment_status
               else 'UNPAID'::public.sale_payment_status
             end,
             updated_at=now()
       where id=v_sale.id;

      insert into public.customer_payment_allocations(customer_payment_id,sale_id,amount)
      values(v_payment_id,v_sale.id,v_alloc);

      v_remaining := v_remaining-v_alloc;
      v_allocated := v_allocated+v_alloc;
    end loop;
  end if;

  if round(v_remaining,2)<>0 then
    raise exception 'Debt ledger is inconsistent with outstanding sales';
  end if;

  insert into public.debt_ledger(customer_id,reference_type,reference_id,debit,credit,transaction_at,note)
  values(p_customer_id,'CUSTOMER_PAYMENT',v_payment_id,0,p_amount,now(),'Khách thanh toán công nợ');

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  values(
    v_actor,'DEBT','REGISTER_CUSTOMER_PAYMENT','CUSTOMER_PAYMENT',v_payment_id::text,
    jsonb_build_object(
      'customer_id',p_customer_id,'amount',p_amount,'allocated',v_allocated,
      'payment_method',v_method,'receipt_code',v_receipt_code,
      'cash_amount',v_cash,'transfer_amount',v_transfer
    ),
    'MANUAL'
  );

  return jsonb_build_object(
    'customer_payment_id',v_payment_id,
    'receipt_code',v_receipt_code,
    'amount',p_amount,
    'allocated',v_allocated,
    'remaining_customer_debt',v_balance-p_amount,
    'payment_method',v_method,
    'cash_amount',v_cash,
    'transfer_amount',v_transfer
  );
end;
$function$;

revoke execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) from public;
revoke execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) from anon;
grant execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) to authenticated;

