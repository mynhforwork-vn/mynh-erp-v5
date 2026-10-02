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

-- Write APIs are SECURITY DEFINER and enforce operator/admin through private.assert_operator().
-- See production migration finance_ledger_core for exact function bodies:
-- public.save_finance_category(...)
-- public.save_finance_document(...)
-- public.cancel_finance_document(...)
