alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

alter table public.erp_users
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists idx_orders_active_order_date
  on public.orders(order_date desc)
  where archived_at is null;

create index if not exists idx_orders_archived_at
  on public.orders(archived_at desc)
  where archived_at is not null;

create index if not exists idx_erp_users_active_platform_created
  on public.erp_users(platform,created_at desc)
  where archived_at is null;

create index if not exists idx_erp_users_archived_at
  on public.erp_users(archived_at desc)
  where archived_at is not null;
