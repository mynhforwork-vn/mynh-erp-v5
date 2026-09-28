-- Internal tracking RPCs must only be callable by backend service_role.
revoke all on function public.claim_due_shipments(integer) from public, anon, authenticated;
grant execute on function public.claim_due_shipments(integer) to service_role;
revoke all on function public.claim_manual_shipment(uuid) from public, anon, authenticated;
grant execute on function public.claim_manual_shipment(uuid) to service_role;
revoke all on function public.complete_tracking_no_change(uuid) from public, anon, authenticated;
grant execute on function public.complete_tracking_no_change(uuid) to service_role;
revoke all on function public.mark_tracking_failure(uuid,text,text) from public, anon, authenticated;
grant execute on function public.mark_tracking_failure(uuid,text,text) to service_role;
revoke all on function public.verify_tracking_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_tracking_cron_secret(text) to service_role;
revoke all on function public.apply_tracking_event(uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_tracking_event(uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text) to service_role;
