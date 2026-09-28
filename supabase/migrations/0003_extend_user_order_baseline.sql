-- MYNH ERP V5
-- Extend frozen User + Order baseline required by the operational UI and demo matrix.

alter type public.tracking_status add value if not exists 'ARRIVED_TRANSIT_HUB' after 'IN_TRANSIT';
alter type public.tracking_status add value if not exists 'RETURNING' before 'RETURNED';
alter type public.warehouse_order_status add value if not exists 'TRANSFERRED' after 'IN_TRANSFER';

alter table public.erp_users
  add column if not exists password_encrypted text,
  add column if not exists spc_st_encrypted text,
  add column if not exists spc_f_encrypted text,
  add column if not exists mobile boolean not null default false,
  add column if not exists web boolean not null default false,
  add column if not exists voucher_summary text,
  add column if not exists order_count integer not null default 0,
  add column if not exists created_at_source text not null default 'MANUAL';

alter table public.orders
  add column if not exists order_date timestamptz not null default now(),
  add column if not exists area text,
  add column if not exists order_status text not null default 'PENDING',
  add column if not exists payment_status text not null default 'UNPAID',
  add column if not exists source text not null default 'MANUAL';

create index if not exists idx_orders_order_date on public.orders(order_date desc);
create index if not exists idx_orders_area on public.orders(area);
create index if not exists idx_orders_order_status on public.orders(order_status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='erp_users_status_allowed' and conrelid='public.erp_users'::regclass) then
    alter table public.erp_users add constraint erp_users_status_allowed
      check (status in ('Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'));
  end if;
  if not exists (select 1 from pg_constraint where conname='orders_order_status_allowed' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_order_status_allowed
      check (order_status in ('PENDING','CONFIRMED','PROCESSING','COMPLETED','CANCELLED','RETURNED'));
  end if;
  if not exists (select 1 from pg_constraint where conname='orders_payment_status_allowed' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_payment_status_allowed
      check (payment_status in ('UNPAID','PENDING','PARTIAL','PAID','REFUNDED'));
  end if;
end $$;
