-- Isolated PostgreSQL QA schema (NOT Production).
create schema if not exists auth;
create schema if not exists private;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '90000000-0000-0000-0000-000000000001'::uuid
$$;
create or replace function private.assert_operator() returns void language plpgsql as $$
begin
  if current_setting('qa.role',true)='viewer' then
    raise exception 'Không có quyền thực hiện thao tác kho';
  end if;
end; $$;

create type public.warehouse_order_status as enum (
  'NOT_READY','READY_TO_TRANSFER','WAREHOUSE_SKIPPED','IN_TRANSFER','TRANSFERRED','WAREHOUSE_RECEIVED'
);
create type public.receive_status as enum ('NOT_READY','WAITING_RECEIVE','RECEIVED');
create type public.inventory_tx_type as enum ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','SALE','RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT');

create table public.warehouses(id uuid primary key,code text not null);
create table public.orders(
  id uuid primary key,receive_status public.receive_status not null,
  warehouse_status public.warehouse_order_status not null,
  archived_at timestamptz,updated_at timestamptz not null default now()
);
create table public.products(
  id uuid primary key default gen_random_uuid(),sku text not null unique,name text not null,
  note text,updated_at timestamptz not null default now()
);
create table public.product_variants(
  id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),
  variant_name text not null,sale_price numeric,updated_at timestamptz not null default now(),
  unique(product_id,variant_name)
);
create table public.order_items(
  id uuid primary key,order_id uuid not null references public.orders(id),sku text,
  product_name text not null,variant text,quantity integer not null,
  original_price numeric,final_price numeric,
  product_variant_id uuid references public.product_variants(id),
  inventory_multiplier integer not null default 1
);
create table public.receive_batches(
  id uuid primary key,warehouse_id uuid not null references public.warehouses(id)
);
create table public.receive_batch_details(
  id uuid primary key,order_id uuid not null references public.orders(id),
  receive_batch_id uuid not null references public.receive_batches(id)
);
create table public.inventory_transactions(
  id bigserial primary key,warehouse_id uuid not null references public.warehouses(id),
  product_variant_id uuid not null references public.product_variants(id),
  tx_type public.inventory_tx_type not null,quantity integer not null,
  reference_type text,reference_id uuid,created_by uuid,
  created_at timestamptz not null default now()
);
create table public.audit_logs(
  id bigserial primary key,actor_user_id uuid,module text not null,action text not null,
  entity_type text not null,entity_id text not null,
  old_value jsonb,new_value jsonb,source text,created_at timestamptz not null default now()
);

insert into public.warehouses values
  ('10000000-0000-0000-0000-000000000001','BG'),
  ('10000000-0000-0000-0000-000000000002','HN');
insert into public.receive_batches(id,warehouse_id) values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.products(id,sku,name) values
  ('20000000-0000-0000-0000-000000000001','SKU-A','Demo SKU A');
insert into public.product_variants(id,product_id,variant_name,sale_price)
values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Mặc định',159000);
insert into public.orders(id,receive_status,warehouse_status) values
  ('40000000-0000-0000-0000-000000000001','RECEIVED','WAREHOUSE_RECEIVED'),
  ('40000000-0000-0000-0000-000000000002','RECEIVED','READY_TO_TRANSFER'),
  ('40000000-0000-0000-0000-000000000003','RECEIVED','READY_TO_TRANSFER'),
  ('40000000-0000-0000-0000-000000000004','RECEIVED','READY_TO_TRANSFER');
insert into public.receive_batch_details values
  ('12000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001'),
  ('12000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001'),
  ('12000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001'),
  ('12000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001');
insert into public.order_items(id,order_id,product_name,quantity,product_variant_id,inventory_multiplier)
values
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Legacy unmapped',1,null,1),
  ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Item A',2,null,1),
  ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','Item B',1,'30000000-0000-0000-0000-000000000001',1),
  ('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','Item C',3,'30000000-0000-0000-0000-000000000001',2),
  ('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000003','Item D',1,null,1),
  ('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000004','Item E',1,'30000000-0000-0000-0000-000000000001',1);
