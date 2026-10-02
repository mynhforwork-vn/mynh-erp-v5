alter table public.customer_payments
  add column if not exists payment_method text not null default 'CASH';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.customer_payments'::regclass
      and conname='customer_payments_payment_method_check'
  ) then
    alter table public.customer_payments
      add constraint customer_payments_payment_method_check
      check (payment_method in ('CASH','TRANSFER'));
  end if;
end $$;

create unique index if not exists finance_documents_source_unique
  on public.finance_documents(source_type,source_id)
  where source_id is not null;

create or replace function private.create_finance_from_shipper_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payment public.shipper_payments%rowtype;
  v_doc_id uuid;
  v_code text;
  v_purchase_id uuid;
  v_tip_id uuid;
  v_shipper_name text;
begin
  select * into v_payment from public.shipper_payments where id=p_payment_id;
  if not found or coalesce(v_payment.actual_transferred,0)<=0 then return null; end if;

  select id into v_doc_id from public.finance_documents
  where source_type='SHIPPER_SETTLEMENT' and source_id=p_payment_id;
  if v_doc_id is not null then return v_doc_id; end if;

  select name into v_shipper_name from public.destination_shippers where id=v_payment.shipper_id;
  v_shipper_name:=coalesce(v_shipper_name,v_payment.shipper_name,v_payment.destination_hub,'Shipper');

  select id into v_purchase_id from public.finance_categories where code='PURCHASE_PAYMENT';
  select id into v_tip_id from public.finance_categories where code='SHIPPER_TIP';

  v_code:='PC-'||to_char(v_payment.transferred_at at time zone 'Asia/Ho_Chi_Minh','YYMMDD')
    ||'-'||lpad(nextval('public.finance_document_seq')::text,6,'0');

  insert into public.finance_documents(
    document_code,document_type,document_status,occurred_at,counterparty_name,
    payment_method,cash_amount,transfer_amount,total_amount,source_type,source_id,
    note,created_by,posted_by,posted_at
  ) values (
    v_code,'EXPENSE','POSTED',v_payment.transferred_at,v_shipper_name,
    'TRANSFER',0,v_payment.actual_transferred,v_payment.actual_transferred,
    'SHIPPER_SETTLEMENT',p_payment_id,
    coalesce(v_payment.note,'Đối soát Shipper'||case when v_payment.destination_hub is not null then ' · '||v_payment.destination_hub else '' end),
    v_payment.transferred_by,v_payment.transferred_by,v_payment.transferred_at
  ) returning id into v_doc_id;

  if coalesce(v_payment.total_cod,0)>0 then
    insert into public.finance_document_lines(
      document_id,category_id,description,amount,line_order,reference_type,reference_id
    ) values (
      v_doc_id,v_purchase_id,
      'Thanh toán đơn nhập'||case when v_payment.destination_hub is not null then ' · '||v_payment.destination_hub else '' end,
      v_payment.total_cod,1,'SHIPPER_PAYMENT',p_payment_id
    );
    insert into public.finance_transactions(
      tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,
      created_by,note,finance_document_id,payment_method,status
    ) values (
      'EXPENSE','PURCHASE_PAYMENT',v_purchase_id,v_payment.total_cod,
      'SHIPPER_PAYMENT',p_payment_id,v_payment.transferred_at,v_payment.transferred_by,
      v_code||' · Thanh toán đơn nhập',v_doc_id,'TRANSFER','POSTED'
    );
  end if;

  if coalesce(v_payment.tip,0)>0 then
    insert into public.finance_document_lines(
      document_id,category_id,description,amount,line_order,reference_type,reference_id
    ) values (v_doc_id,v_tip_id,'Tip Shipper',v_payment.tip,2,'SHIPPER_PAYMENT',p_payment_id);
    insert into public.finance_transactions(
      tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,
      created_by,note,finance_document_id,payment_method,status
    ) values (
      'EXPENSE','SHIPPER_TIP',v_tip_id,v_payment.tip,
      'SHIPPER_PAYMENT',p_payment_id,v_payment.transferred_at,v_payment.transferred_by,
      v_code||' · Tip Shipper',v_doc_id,'TRANSFER','POSTED'
    );
  end if;

  return v_doc_id;
end;
$$;

create or replace function private.trg_shipper_payment_to_finance()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.create_finance_from_shipper_payment(new.id);
  return new;
end;
$$;

drop trigger if exists trg_shipper_payment_to_finance on public.shipper_payments;
create trigger trg_shipper_payment_to_finance
after insert on public.shipper_payments
for each row execute function private.trg_shipper_payment_to_finance();

create or replace function private.create_finance_from_customer_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payment public.customer_payments%rowtype;
  v_doc_id uuid;
  v_code text;
  v_category_id uuid;
  v_customer_name text;
begin
  select * into v_payment from public.customer_payments where id=p_payment_id;
  if not found or coalesce(v_payment.amount,0)<=0 then return null; end if;

  select id into v_doc_id from public.finance_documents
  where source_type='CUSTOMER_PAYMENT' and source_id=p_payment_id;
  if v_doc_id is not null then return v_doc_id; end if;

  select name into v_customer_name from public.customers where id=v_payment.customer_id;
  select id into v_category_id from public.finance_categories where code='DEBT_COLLECTION';

  v_code:='PT-'||to_char(v_payment.paid_at at time zone 'Asia/Ho_Chi_Minh','YYMMDD')
    ||'-'||lpad(nextval('public.finance_document_seq')::text,6,'0');

  insert into public.finance_documents(
    document_code,document_type,document_status,occurred_at,counterparty_name,
    payment_method,cash_amount,transfer_amount,total_amount,source_type,source_id,
    note,created_by,posted_by,posted_at
  ) values (
    v_code,'INCOME','POSTED',v_payment.paid_at,v_customer_name,
    v_payment.payment_method,
    case when v_payment.payment_method='CASH' then v_payment.amount else 0 end,
    case when v_payment.payment_method='TRANSFER' then v_payment.amount else 0 end,
    v_payment.amount,'CUSTOMER_PAYMENT',p_payment_id,
    coalesce(v_payment.note,v_payment.receipt_code,'Thu công nợ'),
    v_payment.created_by,v_payment.created_by,v_payment.paid_at
  ) returning id into v_doc_id;

  insert into public.finance_document_lines(
    document_id,category_id,description,amount,line_order,reference_type,reference_id
  ) values (
    v_doc_id,v_category_id,'Thu công nợ'||case when v_customer_name is not null then ' · '||v_customer_name else '' end,
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
$$;

create or replace function private.trg_customer_payment_to_finance()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.create_finance_from_customer_payment(new.id);
  return new;
end;
$$;

drop trigger if exists trg_customer_payment_to_finance on public.customer_payments;
create trigger trg_customer_payment_to_finance
after insert on public.customer_payments
for each row execute function private.trg_customer_payment_to_finance();

do $$
declare r record;
begin
  for r in select id from public.shipper_payments loop
    perform private.create_finance_from_shipper_payment(r.id);
  end loop;
  for r in select id from public.customer_payments loop
    perform private.create_finance_from_customer_payment(r.id);
  end loop;
end $$;
