create table if not exists public.shipping_carrier_configs (
  id uuid primary key default gen_random_uuid(),
  carrier_code text not null unique,
  display_name text not null,
  tracking_prefixes text[] not null default '{}',
  supports_tracking boolean not null default true,
  supports_destination_hub boolean not null default false,
  priority integer not null default 100,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_carrier_code_not_blank check (length(trim(carrier_code)) > 0),
  constraint shipping_carrier_name_not_blank check (length(trim(display_name)) > 0)
);

create index if not exists idx_shipping_carrier_configs_active
  on public.shipping_carrier_configs(is_active, priority, display_name);

alter table public.shipping_carrier_configs enable row level security;

revoke all on public.shipping_carrier_configs from anon;
grant select, insert, update, delete on public.shipping_carrier_configs to authenticated;

drop policy if exists shipping_carrier_configs_select on public.shipping_carrier_configs;
create policy shipping_carrier_configs_select
on public.shipping_carrier_configs
for select to authenticated
using (public.current_erp_role() in ('admin','operator','viewer'));

drop policy if exists shipping_carrier_configs_write on public.shipping_carrier_configs;
create policy shipping_carrier_configs_write
on public.shipping_carrier_configs
for all to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));

insert into public.shipping_carrier_configs
(carrier_code,display_name,tracking_prefixes,supports_tracking,supports_destination_hub,priority,is_active,note)
values
('SPX','SPX Express',array['SPX'],true,true,10,true,'SPX dùng cấu hình HUB kho đích, Phường/Xã và Shipper.'),
('GHN','Giao Hàng Nhanh',array['GHN'],true,false,20,true,null),
('GHTK','Giao Hàng Tiết Kiệm',array['GHTK'],true,false,30,true,null),
('VTP','Viettel Post',array['VTP','VTPN'],true,false,40,true,null),
('JNT','J&T Express',array['JNT','JT'],true,false,50,true,null)
on conflict (carrier_code) do update set
  display_name=excluded.display_name,
  tracking_prefixes=excluded.tracking_prefixes,
  supports_tracking=excluded.supports_tracking,
  supports_destination_hub=excluded.supports_destination_hub,
  priority=excluded.priority,
  updated_at=now();