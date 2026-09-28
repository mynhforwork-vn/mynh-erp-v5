-- MYNH ERP V5
-- Prepare purchase accounts for future multi-platform expansion.

alter table public.erp_users
  add column if not exists platform text not null default 'SHOPEE';

create index if not exists idx_erp_users_platform on public.erp_users(platform);
