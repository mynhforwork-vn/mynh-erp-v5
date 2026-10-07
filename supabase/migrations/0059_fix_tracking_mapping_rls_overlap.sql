-- Avoid overlapping permissive SELECT policies on carrier status mappings.

drop policy if exists carrier_status_mappings_write on public.carrier_status_mappings;
drop policy if exists carrier_status_mappings_insert on public.carrier_status_mappings;
drop policy if exists carrier_status_mappings_update on public.carrier_status_mappings;
drop policy if exists carrier_status_mappings_delete on public.carrier_status_mappings;

create policy carrier_status_mappings_insert
on public.carrier_status_mappings
for insert to authenticated
with check ((select public.current_erp_role())='admin');

create policy carrier_status_mappings_update
on public.carrier_status_mappings
for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

create policy carrier_status_mappings_delete
on public.carrier_status_mappings
for delete to authenticated
using ((select public.current_erp_role())='admin');
