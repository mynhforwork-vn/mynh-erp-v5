create table if not exists public.destination_shippers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_destination_shippers_name_phone
on public.destination_shippers(lower(name),coalesce(phone,''));

alter table public.destination_shippers enable row level security;

drop policy if exists destination_shippers_select on public.destination_shippers;
create policy destination_shippers_select
on public.destination_shippers
for select to authenticated
using (public.current_erp_role() in ('admin','operator','viewer'));

drop policy if exists destination_shippers_write on public.destination_shippers;
create policy destination_shippers_write
on public.destination_shippers
for all to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));

alter table public.destination_hub_configs
  add column if not exists shipper_id uuid references public.destination_shippers(id) on delete set null;

insert into public.destination_shippers(name,phone)
select distinct trim(shipper_name),nullif(trim(shipper_phone),'')
from public.destination_hub_configs
where nullif(trim(coalesce(shipper_name,'')),'') is not null
on conflict do nothing;

update public.destination_hub_configs h
set shipper_id=s.id,
    updated_at=now()
from public.destination_shippers s
where h.shipper_id is null
  and nullif(trim(coalesce(h.shipper_name,'')),'') is not null
  and lower(s.name)=lower(trim(h.shipper_name))
  and coalesce(s.phone,'')=coalesce(nullif(trim(h.shipper_phone),''),'');

create table if not exists public.destination_hub_shipper_assignments (
  id uuid primary key default gen_random_uuid(),
  hub_config_id uuid not null references public.destination_hub_configs(id) on delete cascade,
  shipper_id uuid not null references public.destination_shippers(id) on delete cascade,
  priority integer not null default 100,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hub_config_id,shipper_id)
);

create index if not exists idx_destination_hub_shipper_assignments_hub
  on public.destination_hub_shipper_assignments(hub_config_id,is_active,priority);

create index if not exists idx_destination_hub_shipper_assignments_shipper
  on public.destination_hub_shipper_assignments(shipper_id,is_active);

alter table public.destination_hub_shipper_assignments enable row level security;

drop policy if exists destination_hub_shipper_assignments_select
on public.destination_hub_shipper_assignments;
create policy destination_hub_shipper_assignments_select
on public.destination_hub_shipper_assignments
for select to authenticated
using (public.current_erp_role() in ('admin','operator','viewer'));

drop policy if exists destination_hub_shipper_assignments_write
on public.destination_hub_shipper_assignments;
create policy destination_hub_shipper_assignments_write
on public.destination_hub_shipper_assignments
for all to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));

insert into public.destination_hub_shipper_assignments(hub_config_id,shipper_id,priority,is_active)
select h.id,h.shipper_id,10,true
from public.destination_hub_configs h
where h.shipper_id is not null
on conflict (hub_config_id,shipper_id) do nothing;

alter table public.shipper_payments
  add column if not exists shipper_id uuid references public.destination_shippers(id) on delete set null;

create index if not exists idx_shipper_payments_shipper_id
  on public.shipper_payments(shipper_id,transferred_at desc);
