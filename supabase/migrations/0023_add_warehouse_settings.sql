create table if not exists public.warehouse_settings (
  id text primary key,
  default_receiving_warehouse_id uuid null references public.warehouses(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint warehouse_settings_singleton_check check (id = 'main')
);

insert into public.warehouse_settings(id)
values ('main')
on conflict (id) do nothing;

alter table public.warehouse_settings enable row level security;

drop policy if exists warehouse_settings_read on public.warehouse_settings;
create policy warehouse_settings_read
on public.warehouse_settings
for select
to authenticated
using ((select current_erp_role()) = any (array['admin'::text,'operator'::text,'viewer'::text]));

drop policy if exists warehouse_settings_update on public.warehouse_settings;
create policy warehouse_settings_update
on public.warehouse_settings
for update
to authenticated
using ((select current_erp_role()) = any (array['admin'::text,'operator'::text]))
with check ((select current_erp_role()) = any (array['admin'::text,'operator'::text]));

grant select, update on public.warehouse_settings to authenticated;
revoke all on public.warehouse_settings from anon;

create index if not exists warehouse_settings_default_receiving_warehouse_id_idx
  on public.warehouse_settings(default_receiving_warehouse_id);
