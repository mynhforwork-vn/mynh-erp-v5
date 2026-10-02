-- MYNH ERP V5 - Finance ledger core
-- Applied to production Supabase as migration: finance_ledger_core
-- Adds categories + finance documents while keeping finance_transactions as the central money ledger.

create sequence if not exists public.finance_document_seq start 1;
create sequence if not exists public.finance_category_seq start 1;

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tx_type public.finance_tx_type not null,
  parent_id uuid references public.finance_categories(id) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_name_nonempty check (btrim(name) <> '')
);

create index if not exists finance_categories_type_active_idx on public.finance_categories(tx_type,is_active,sort_order,name);
create index if not exists finance_categories_parent_idx on public.finance_categories(parent_id);

create table if not exists public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  document_type public.finance_tx_type not null,
  document_status text not null default 'DRAFT',
  occurred_at timestamptz not null default now(),
  counterparty_name text,
  payment_method text not null default 'CASH',
  cash_amount numeric(18,2) not null default 0,
  transfer_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  source_type text not null default 'MANUAL',
  source_id uuid,
  note text,
  created_by uuid,
  posted_by uuid,
  cancelled_by uuid,
  posted_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_documents_status_check check (document_status in ('DRAFT','POSTED','CANCELLED')),
  constraint finance_documents_payment_method_check check (payment_method in ('CASH','TRANSFER','COMBINED')),
  constraint finance_documents_amounts_nonnegative check (cash_amount >= 0 and transfer_amount >= 0 and total_amount >= 0)
);

create index if not exists finance_documents_occurred_idx on public.finance_documents(occurred_at desc);
create index if not exists finance_documents_type_status_idx on public.finance_documents(document_type,document_status,occurred_at desc);
create index if not exists finance_documents_source_idx on public.finance_documents(source_type,source_id) where source_id is not null;

create table if not exists public.finance_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.finance_documents(id) on delete cascade,
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  description text not null,
  amount numeric(18,2) not null,
  line_order integer not null default 0,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  constraint finance_document_lines_description_nonempty check (btrim(description) <> ''),
  constraint finance_document_lines_amount_positive check (amount > 0)
);

create index if not exists finance_document_lines_document_idx on public.finance_document_lines(document_id,line_order);
create index if not exists finance_document_lines_category_idx on public.finance_document_lines(category_id);

alter table public.finance_transactions
  add column if not exists finance_document_id uuid references public.finance_documents(id) on delete restrict,
  add column if not exists category_id uuid references public.finance_categories(id) on delete restrict,
  add column if not exists payment_method text,
  add column if not exists status text not null default 'POSTED',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='finance_transactions_payment_method_check' and conrelid='public.finance_transactions'::regclass) then
    alter table public.finance_transactions add constraint finance_transactions_payment_method_check check (payment_method is null or payment_method in ('CASH','TRANSFER'));
  end if;
  if not exists (select 1 from pg_constraint where conname='finance_transactions_status_check' and conrelid='public.finance_transactions'::regclass) then
    alter table public.finance_transactions add constraint finance_transactions_status_check check (status in ('POSTED','VOID'));
  end if;
end $$;

create index if not exists finance_transactions_document_idx on public.finance_transactions(finance_document_id);
create index if not exists finance_transactions_status_time_idx on public.finance_transactions(status,transaction_at desc);

alter table public.finance_categories enable row level security;
alter table public.finance_documents enable row level security;
alter table public.finance_document_lines enable row level security;

drop policy if exists finance_categories_read on public.finance_categories;
create policy finance_categories_read on public.finance_categories for select to authenticated
using ((select public.current_erp_role()) = any(array['admin','operator','viewer']));
drop policy if exists finance_documents_read on public.finance_documents;
create policy finance_documents_read on public.finance_documents for select to authenticated
using ((select public.current_erp_role()) = any(array['admin','operator','viewer']));
drop policy if exists finance_document_lines_read on public.finance_document_lines;
create policy finance_document_lines_read on public.finance_document_lines for select to authenticated
using ((select public.current_erp_role()) = any(array['admin','operator','viewer']));

-- Seed system categories. Existing POS codes are preserved for backward compatibility.
insert into public.finance_categories(code,name,tx_type,sort_order,is_system,note) values
('SALES','Bán hàng','INCOME',10,true,'Nhóm thu từ bán hàng'),
('DEBT_COLLECTION','Thu công nợ','INCOME',20,true,'Thu tiền công nợ khách hàng'),
('REFUND_IN','Hoàn ứng / Thu hồi','INCOME',30,true,'Khoản hoàn ứng hoặc thu hồi'),
('OTHER_INCOME','Thu khác','INCOME',90,true,'Khoản thu khác'),
('PURCHASE_PAYMENT','Thanh toán đơn nhập','EXPENSE',10,true,'Thanh toán giá trị đơn nhập'),
('TRANSPORT','Vận chuyển','EXPENSE',20,true,'Nhóm chi phí vận chuyển'),
('PACKAGING','Đóng gói','EXPENSE',30,true,'Vật tư và chi phí đóng gói'),
('WAREHOUSE_COST','Kho','EXPENSE',40,true,'Chi phí vận hành kho'),
('MARKETING','Marketing','EXPENSE',50,true,'Chi phí marketing'),
('SOFTWARE','Phần mềm','EXPENSE',60,true,'Chi phí phần mềm và công cụ'),
('PERSONNEL','Nhân sự','EXPENSE',70,true,'Chi phí nhân sự'),
('UTILITIES','Điện nước','EXPENSE',80,true,'Điện, nước và tiện ích'),
('OFFICE','Văn phòng','EXPENSE',90,true,'Chi phí văn phòng'),
('CUSTOMER_REFUND','Hoàn tiền khách','EXPENSE',100,true,'Hoàn tiền cho khách hàng'),
('OTHER_EXPENSE','Chi khác','EXPENSE',190,true,'Khoản chi khác')
on conflict(code) do update set name=excluded.name,tx_type=excluded.tx_type,sort_order=excluded.sort_order,is_system=true,note=excluded.note,updated_at=now();

insert into public.finance_categories(code,name,tx_type,parent_id,sort_order,is_system,note)
select 'SALE_CASH','Bán hàng · Tiền mặt','INCOME',id,11,true,'POS tiền mặt' from public.finance_categories where code='SALES'
on conflict(code) do update set name=excluded.name,parent_id=excluded.parent_id,is_system=true,updated_at=now();
insert into public.finance_categories(code,name,tx_type,parent_id,sort_order,is_system,note)
select 'SALE_TRANSFER','Bán hàng · Chuyển khoản','INCOME',id,12,true,'POS chuyển khoản' from public.finance_categories where code='SALES'
on conflict(code) do update set name=excluded.name,parent_id=excluded.parent_id,is_system=true,updated_at=now();
insert into public.finance_categories(code,name,tx_type,parent_id,sort_order,is_system,note)
select 'SHIPPING_FEE','Phí vận chuyển','EXPENSE',id,21,true,'Phí vận chuyển' from public.finance_categories where code='TRANSPORT'
on conflict(code) do update set name=excluded.name,parent_id=excluded.parent_id,is_system=true,updated_at=now();
insert into public.finance_categories(code,name,tx_type,parent_id,sort_order,is_system,note)
select 'SHIPPER_TIP','Tip Shipper','EXPENSE',id,22,true,'Tiền tip shipper' from public.finance_categories where code='TRANSPORT'
on conflict(code) do update set name=excluded.name,parent_id=excluded.parent_id,is_system=true,updated_at=now();

update public.finance_transactions ft set category_id=fc.id
from public.finance_categories fc where ft.category_id is null and fc.code=ft.category;

-- Write APIs. All functions enforce operator/admin through private.assert_operator().
create or replace function public.save_finance_category(
  p_id uuid default null,
  p_name text default null,
  p_tx_type public.finance_tx_type default null,
  p_parent_id uuid default null,
  p_note text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
  v_code text;
  v_existing public.finance_categories%rowtype;
  v_parent_type public.finance_tx_type;
begin
  perform private.assert_operator();

  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'Chưa nhập tên hạng mục';
  end if;
  if p_tx_type is null then
    raise exception 'Chưa chọn loại Thu / Chi';
  end if;

  if p_parent_id is not null then
    select tx_type into v_parent_type
    from public.finance_categories
    where id=p_parent_id;
    if v_parent_type is null then raise exception 'Hạng mục cha không tồn tại'; end if;
    if v_parent_type<>p_tx_type then raise exception 'Hạng mục cha phải cùng loại Thu / Chi'; end if;
  end if;

  if p_id is null then
    v_code:=
      case when p_tx_type='INCOME' then 'IN-' else 'OUT-' end
      ||lpad(nextval('public.finance_category_seq')::text,5,'0');

    insert into public.finance_categories(
      code,name,tx_type,parent_id,sort_order,is_active,is_system,note,created_by
    )
    values(
      v_code,btrim(p_name),p_tx_type,p_parent_id,999,coalesce(p_is_active,true),false,
      nullif(btrim(coalesce(p_note,'')),''),v_actor
    )
    returning id into v_id;
  else
    select * into v_existing
    from public.finance_categories
    where id=p_id
    for update;

    if not found then raise exception 'Hạng mục không tồn tại'; end if;
    if v_existing.is_system and p_tx_type<>v_existing.tx_type then
      raise exception 'Không thể đổi loại của hạng mục hệ thống';
    end if;

    update public.finance_categories
    set name=btrim(p_name),
        tx_type=case when is_system then tx_type else p_tx_type end,
        parent_id=p_parent_id,
        note=nullif(btrim(coalesce(p_note,'')),''),
        is_active=case when is_system then true else coalesce(p_is_active,true) end,
        updated_at=now()
    where id=p_id
    returning id into v_id;
  end if;

  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.save_finance_document(
  p_document_id uuid default null,
  p_document_type public.finance_tx_type default null,
  p_occurred_at timestamptz default now(),
  p_counterparty_name text default null,
  p_payment_method text default 'CASH',
  p_cash_amount numeric default 0,
  p_transfer_amount numeric default 0,
  p_note text default null,
  p_lines jsonb default '[]'::jsonb,
  p_post boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
  v_code text;
  v_status text;
  v_total numeric(18,2):=0;
  v_cash numeric(18,2):=greatest(coalesce(p_cash_amount,0),0);
  v_transfer numeric(18,2):=greatest(coalesce(p_transfer_amount,0),0);
  v_method text:=upper(btrim(coalesce(p_payment_method,'CASH')));
  v_prefix text;
  v_line jsonb;
  v_category uuid;
  v_description text;
  v_amount numeric(18,2);
  v_line_order integer:=0;
  v_category_type public.finance_tx_type;
  v_category_code text;
  v_distinct_categories integer;
  v_single_category_id uuid;
  v_single_category_code text;
begin
  perform private.assert_operator();

  if p_document_type is null then raise exception 'Chưa chọn loại Phiếu thu / Phiếu chi'; end if;
  if v_method not in ('CASH','TRANSFER','COMBINED') then raise exception 'Phương thức thanh toán không hợp lệ'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception 'Phiếu phải có ít nhất một dòng';
  end if;
  if jsonb_array_length(p_lines)>100 then raise exception 'Tối đa 100 dòng mỗi phiếu'; end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    begin
      v_category:=(v_line->>'category_id')::uuid;
    exception when others then
      raise exception 'Hạng mục không hợp lệ';
    end;
    v_description:=nullif(btrim(coalesce(v_line->>'description','')),'');
    v_amount:=coalesce(nullif(v_line->>'amount','')::numeric,0);

    if v_description is null then raise exception 'Có dòng chưa nhập nội dung'; end if;
    if v_amount<=0 then raise exception 'Số tiền từng dòng phải lớn hơn 0'; end if;

    select tx_type,code into v_category_type,v_category_code
    from public.finance_categories
    where id=v_category and is_active=true;

    if v_category_type is null then raise exception 'Hạng mục không tồn tại hoặc đã ngừng sử dụng'; end if;
    if v_category_type<>p_document_type then raise exception 'Hạng mục không đúng loại Thu / Chi'; end if;

    v_total:=v_total+v_amount;
  end loop;

  if v_method='CASH' then
    v_cash:=v_total;
    v_transfer:=0;
  elsif v_method='TRANSFER' then
    v_cash:=0;
    v_transfer:=v_total;
  else
    if round(v_cash+v_transfer,2)<>round(v_total,2) then
      raise exception 'Tổng Tiền mặt + Chuyển khoản phải bằng tổng phiếu';
    end if;
    if v_cash<=0 or v_transfer<=0 then
      raise exception 'Thanh toán kết hợp cần có cả Tiền mặt và Chuyển khoản';
    end if;
  end if;

  if p_document_id is null then
    v_prefix:=case when p_document_type='INCOME' then 'PT' else 'PC' end;
    v_code:=v_prefix||'-'
      ||to_char(coalesce(p_occurred_at,now()) at time zone 'Asia/Ho_Chi_Minh','YYMMDD')
      ||'-'||lpad(nextval('public.finance_document_seq')::text,6,'0');

    insert into public.finance_documents(
      document_code,document_type,document_status,occurred_at,counterparty_name,
      payment_method,cash_amount,transfer_amount,total_amount,source_type,note,created_by
    )
    values(
      v_code,p_document_type,'DRAFT',coalesce(p_occurred_at,now()),
      nullif(btrim(coalesce(p_counterparty_name,'')),''),
      v_method,v_cash,v_transfer,v_total,'MANUAL',
      nullif(btrim(coalesce(p_note,'')),''),v_actor
    )
    returning id into v_id;
  else
    select document_status,document_code into v_status,v_code
    from public.finance_documents
    where id=p_document_id
    for update;

    if not found then raise exception 'Phiếu không tồn tại'; end if;
    if v_status<>'DRAFT' then raise exception 'Chỉ Phiếu nháp mới được sửa'; end if;

    update public.finance_documents
    set document_type=p_document_type,
        occurred_at=coalesce(p_occurred_at,now()),
        counterparty_name=nullif(btrim(coalesce(p_counterparty_name,'')),''),
        payment_method=v_method,
        cash_amount=v_cash,
        transfer_amount=v_transfer,
        total_amount=v_total,
        note=nullif(btrim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=p_document_id;

    v_id:=p_document_id;
    delete from public.finance_document_lines where document_id=v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_order:=v_line_order+1;
    v_category:=(v_line->>'category_id')::uuid;
    v_description:=btrim(v_line->>'description');
    v_amount:=(v_line->>'amount')::numeric;

    insert into public.finance_document_lines(
      document_id,category_id,description,amount,line_order,
      reference_type,reference_id
    )
    values(
      v_id,v_category,v_description,v_amount,v_line_order,
      nullif(btrim(coalesce(v_line->>'reference_type','')),''),
      case
        when nullif(v_line->>'reference_id','') is null then null
        else (v_line->>'reference_id')::uuid
      end
    );
  end loop;

  if p_post then
    select count(distinct category_id),min(category_id)
      into v_distinct_categories,v_single_category_id
    from public.finance_document_lines
    where document_id=v_id;

    if v_distinct_categories=1 then
      select code into v_single_category_code
      from public.finance_categories
      where id=v_single_category_id;
    else
      v_single_category_id:=null;
      v_single_category_code:='MULTI';
    end if;

    update public.finance_documents
    set document_status='POSTED',
        posted_by=v_actor,
        posted_at=now(),
        updated_at=now()
    where id=v_id;

    if v_cash>0 then
      insert into public.finance_transactions(
        tx_type,category,category_id,amount,reference_type,reference_id,
        transaction_at,created_by,note,finance_document_id,payment_method,status
      )
      values(
        p_document_type,v_single_category_code,v_single_category_id,v_cash,
        'FINANCE_DOCUMENT',v_id,coalesce(p_occurred_at,now()),v_actor,
        v_code||case
          when p_counterparty_name is not null then ' · '||btrim(p_counterparty_name)
          else ''
        end,
        v_id,'CASH','POSTED'
      );
    end if;

    if v_transfer>0 then
      insert into public.finance_transactions(
        tx_type,category,category_id,amount,reference_type,reference_id,
        transaction_at,created_by,note,finance_document_id,payment_method,status
      )
      values(
        p_document_type,v_single_category_code,v_single_category_id,v_transfer,
        'FINANCE_DOCUMENT',v_id,coalesce(p_occurred_at,now()),v_actor,
        v_code||case
          when p_counterparty_name is not null then ' · '||btrim(p_counterparty_name)
          else ''
        end,
        v_id,'TRANSFER','POSTED'
      );
    end if;
  end if;

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  )
  values(
    v_actor,'FINANCE',
    case when p_post then 'FINANCE_DOCUMENT_POSTED' else 'FINANCE_DOCUMENT_SAVED' end,
    'FINANCE_DOCUMENT',v_id::text,
    jsonb_build_object(
      'document_code',v_code,
      'document_type',p_document_type,
      'total_amount',v_total,
      'payment_method',v_method,
      'cash_amount',v_cash,
      'transfer_amount',v_transfer,
      'status',case when p_post then 'POSTED' else 'DRAFT' end
    ),
    'USER'
  );

  return jsonb_build_object(
    'id',v_id,
    'document_code',v_code,
    'total_amount',v_total,
    'status',case when p_post then 'POSTED' else 'DRAFT' end
  );
end;
$$;

create or replace function public.cancel_finance_document(
  p_document_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_status text;
  v_code text;
begin
  perform private.assert_operator();

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Cần nhập lý do huỷ phiếu';
  end if;

  select document_status,document_code into v_status,v_code
  from public.finance_documents
  where id=p_document_id
  for update;

  if not found then raise exception 'Phiếu không tồn tại'; end if;
  if v_status='CANCELLED' then
    return jsonb_build_object('id',p_document_id,'status','CANCELLED');
  end if;

  update public.finance_documents
  set document_status='CANCELLED',
      cancelled_by=v_actor,
      cancelled_at=now(),
      cancellation_reason=btrim(p_reason),
      updated_at=now()
  where id=p_document_id;

  update public.finance_transactions
  set status='VOID',
      voided_at=now(),
      voided_by=v_actor,
      void_reason=btrim(p_reason)
  where finance_document_id=p_document_id
    and status='POSTED';

  insert into public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  )
  values(
    v_actor,'FINANCE','FINANCE_DOCUMENT_CANCELLED','FINANCE_DOCUMENT',p_document_id::text,
    jsonb_build_object('document_code',v_code,'reason',btrim(p_reason)),
    'USER'
  );

  return jsonb_build_object('id',p_document_id,'status','CANCELLED');
end;
$$;

