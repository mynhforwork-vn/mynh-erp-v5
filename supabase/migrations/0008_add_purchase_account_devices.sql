-- MYNH ERP V5
-- Real purchase-account device activity instead of checkbox-only Mobile/Web metadata.

create table if not exists public.purchase_account_devices (
  id uuid primary key default gen_random_uuid(),
  erp_user_id uuid not null references public.erp_users(id) on delete cascade,
  device_key text not null,
  device_name text not null,
  device_type text not null default 'DESKTOP',
  browser_name text,
  browser_profile text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  source text not null default 'MANUAL',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(erp_user_id, device_key)
);

create index if not exists idx_purchase_account_devices_user
  on public.purchase_account_devices(erp_user_id);
create index if not exists idx_purchase_account_devices_active
  on public.purchase_account_devices(erp_user_id,is_active,last_seen_at desc);

alter table public.purchase_account_devices enable row level security;

drop policy if exists purchase_account_devices_select on public.purchase_account_devices;
create policy purchase_account_devices_select
on public.purchase_account_devices
for select to authenticated
using (public.current_erp_role() in ('admin','operator','viewer'));

drop policy if exists purchase_account_devices_write on public.purchase_account_devices;
create policy purchase_account_devices_write
on public.purchase_account_devices
for all to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));
 
-- Retired legacy device DEMO rows. Keep the device table, indexes and RLS
-- policies, but never insert sample accounts/devices during DB initialization.
-- Original demo fixtures remain in Git history (blob 02247d9e5cd60b7136f5fa2250d520c1ccd8faa2).
