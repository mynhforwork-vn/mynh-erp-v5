drop policy if exists shipping_carrier_configs_write on public.shipping_carrier_configs;

drop policy if exists shipping_carrier_configs_insert on public.shipping_carrier_configs;
create policy shipping_carrier_configs_insert
on public.shipping_carrier_configs
for insert to authenticated
with check (public.current_erp_role() in ('admin','operator'));

drop policy if exists shipping_carrier_configs_update on public.shipping_carrier_configs;
create policy shipping_carrier_configs_update
on public.shipping_carrier_configs
for update to authenticated
using (public.current_erp_role() in ('admin','operator'))
with check (public.current_erp_role() in ('admin','operator'));

drop policy if exists shipping_carrier_configs_delete on public.shipping_carrier_configs;
create policy shipping_carrier_configs_delete
on public.shipping_carrier_configs
for delete to authenticated
using (public.current_erp_role() in ('admin','operator'));