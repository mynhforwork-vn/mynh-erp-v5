-- Align production Telegram RLS with the clean policy layout in 0054.
drop policy if exists telegram_alert_settings_write on public.telegram_alert_settings;
drop policy if exists telegram_alert_settings_insert on public.telegram_alert_settings;
drop policy if exists telegram_alert_settings_update on public.telegram_alert_settings;
drop policy if exists telegram_alert_settings_delete on public.telegram_alert_settings;

create policy telegram_alert_settings_insert
on public.telegram_alert_settings for insert to authenticated
with check ((select public.current_erp_role())='admin');

create policy telegram_alert_settings_update
on public.telegram_alert_settings for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

create policy telegram_alert_settings_delete
on public.telegram_alert_settings for delete to authenticated
using ((select public.current_erp_role())='admin');

drop policy if exists telegram_alert_destinations_write on public.telegram_alert_destinations;
drop policy if exists telegram_alert_destinations_insert on public.telegram_alert_destinations;
drop policy if exists telegram_alert_destinations_update on public.telegram_alert_destinations;
drop policy if exists telegram_alert_destinations_delete on public.telegram_alert_destinations;

create policy telegram_alert_destinations_insert
on public.telegram_alert_destinations for insert to authenticated
with check ((select public.current_erp_role())='admin');

create policy telegram_alert_destinations_update
on public.telegram_alert_destinations for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

create policy telegram_alert_destinations_delete
on public.telegram_alert_destinations for delete to authenticated
using ((select public.current_erp_role())='admin');
