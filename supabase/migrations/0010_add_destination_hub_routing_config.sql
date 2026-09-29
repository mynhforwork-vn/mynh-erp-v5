create table if not exists public.destination_hub_configs (
  id uuid primary key default gen_random_uuid(),
  hub_code text not null unique,
  area text not null,
  region text not null,
  province_keywords text[] not null default '{}',
  district_keywords text[] not null default '{}',
  address_keywords text[] not null default '{}',
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destination_hub_region_check
    check (region in ('Miền Bắc','Miền Trung','Miền Nam'))
);

create index if not exists idx_destination_hub_configs_active
  on public.destination_hub_configs(is_active,priority,hub_code);

alter table public.destination_hub_configs enable row level security;

drop policy if exists destination_hub_configs_select on public.destination_hub_configs;
create policy destination_hub_configs_select
on public.destination_hub_configs
for select to authenticated
using (public.current_erp_role() in ('admin','operator','viewer'));

drop policy if exists destination_hub_configs_write on public.destination_hub_configs;
create policy destination_hub_configs_write
on public.destination_hub_configs
for all to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));

insert into public.destination_hub_configs
(hub_code,area,region,province_keywords,district_keywords,address_keywords,priority,is_active)
values
('HN-Ba Đình','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Ba Đình','Ba Dinh'],array[]::text[],10,true),
('HN-Cầu Giấy','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Cầu Giấy','Cau Giay'],array[]::text[],10,true),
('HN-Hà Đông','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Hà Đông','Ha Dong'],array[]::text[],10,true),
('HN-Hai Bà Trưng','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Hai Bà Trưng','Hai Ba Trung'],array[]::text[],10,true),
('HN-Hoàn Kiếm','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Hoàn Kiếm','Hoan Kiem'],array[]::text[],10,true),
('HN-Long Biên','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Long Biên','Long Bien'],array[]::text[],10,true),
('HN-Nam Từ Liêm','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Nam Từ Liêm','Nam Tu Liem'],array[]::text[],10,true),
('HN-Thanh Xuân','Hà Nội','Miền Bắc',array['Hà Nội','Ha Noi'],array['Thanh Xuân','Thanh Xuan'],array[]::text[],10,true),
('BN-Từ Sơn','Bắc Ninh','Miền Bắc',array['Bắc Ninh','Bac Ninh'],array['Từ Sơn','Tu Son'],array[]::text[],10,true),
('DN-Hải Châu','Đà Nẵng','Miền Trung',array['Đà Nẵng','Da Nang'],array['Hải Châu','Hai Chau'],array[]::text[],10,true),
('DN-Sơn Trà','Đà Nẵng','Miền Trung',array['Đà Nẵng','Da Nang'],array['Sơn Trà','Son Tra'],array[]::text[],10,true),
('DN-Thanh Khê','Đà Nẵng','Miền Trung',array['Đà Nẵng','Da Nang'],array['Thanh Khê','Thanh Khe'],array[]::text[],10,true),
('HCM-Bình Thạnh','TP. Hồ Chí Minh','Miền Nam',array['TP. Hồ Chí Minh','Hồ Chí Minh','Ho Chi Minh','TPHCM'],array['Bình Thạnh','Binh Thanh'],array[]::text[],10,true),
('HCM-Gò Vấp','TP. Hồ Chí Minh','Miền Nam',array['TP. Hồ Chí Minh','Hồ Chí Minh','Ho Chi Minh','TPHCM'],array['Gò Vấp','Go Vap'],array[]::text[],10,true),
('HCM-Quận 7','TP. Hồ Chí Minh','Miền Nam',array['TP. Hồ Chí Minh','Hồ Chí Minh','Ho Chi Minh','TPHCM'],array['Quận 7','Quan 7','Q7'],array[]::text[],10,true),
('HCM-Thủ Đức','TP. Hồ Chí Minh','Miền Nam',array['TP. Hồ Chí Minh','Hồ Chí Minh','Ho Chi Minh','TPHCM'],array['Thủ Đức','Thu Duc'],array[]::text[],10,true)
on conflict (hub_code) do update set
  area=excluded.area,
  region=excluded.region,
  province_keywords=excluded.province_keywords,
  district_keywords=excluded.district_keywords,
  address_keywords=excluded.address_keywords,
  priority=excluded.priority,
  updated_at=now();
