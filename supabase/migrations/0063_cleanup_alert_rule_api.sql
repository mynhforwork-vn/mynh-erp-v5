-- Remove the pre-In-app overload so Alert rules have one canonical write API.

drop function if exists public.save_alert_rule_secure(text,boolean,boolean,integer);

revoke all on function public.tracking_alert_type(public.tracking_status) from anon;
grant execute on function public.tracking_alert_type(public.tracking_status) to authenticated,service_role;
