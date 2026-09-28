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

insert into public.purchase_account_devices
(erp_user_id,device_key,device_name,device_type,browser_name,browser_profile,is_active,last_seen_at,source)
values
('10000000-0000-0000-0000-000000000001','demo-macbook','MacBook M1 · Máy mua 01','DESKTOP','Chrome','Profile A',true,now()-interval '8 minutes','DEMO'),
('10000000-0000-0000-0000-000000000001','demo-iphone','iPhone · App Shopee','MOBILE','Shopee App',null,true,now()-interval '22 minutes','DEMO'),
('10000000-0000-0000-0000-000000000002','demo-imac','iMac · Máy mua 02','DESKTOP','Safari','Profile B',true,now()-interval '34 minutes','DEMO'),
('10000000-0000-0000-0000-000000000003','demo-macbook-03','MacBook Air · Máy mua 03','DESKTOP','Chrome','Profile C',true,now()-interval '1 hour','DEMO'),
('10000000-0000-0000-0000-000000000004','demo-pc-04','PC Windows · Máy mua 04','DESKTOP','Chrome','Profile D',true,now()-interval '2 hours','DEMO'),
('10000000-0000-0000-0000-000000000005','demo-phone-05','Android · App Shopee','MOBILE','Shopee App',null,true,now()-interval '3 hours','DEMO'),
('10000000-0000-0000-0000-000000000006','demo-pc-06','PC Windows · Máy mua 06','DESKTOP','Edge','Profile F',true,now()-interval '4 hours','DEMO'),
('10000000-0000-0000-0000-000000000007','demo-macbook-07','MacBook Pro · Máy mua 07','DESKTOP','Chrome','Profile G',true,now()-interval '45 minutes','DEMO'),
('10000000-0000-0000-0000-000000000008','demo-pc-08','PC Windows · Máy mua 08','DESKTOP','Edge','Profile H',false,now()-interval '3 days','DEMO'),
('10000000-0000-0000-0000-000000000009','demo-pc-09','PC Windows · Máy mua 09','DESKTOP','Edge','Profile I',false,now()-interval '6 days','DEMO'),
('10000000-0000-0000-0000-000000000010','demo-safari-10','Mac mini · Máy mua 10','DESKTOP','Safari','Profile J',true,now()-interval '5 hours','DEMO')
on conflict (erp_user_id,device_key) do update set
  device_name=excluded.device_name,
  device_type=excluded.device_type,
  browser_name=excluded.browser_name,
  browser_profile=excluded.browser_profile,
  is_active=excluded.is_active,
  last_seen_at=excluded.last_seen_at,
  source=excluded.source,
  updated_at=now();
