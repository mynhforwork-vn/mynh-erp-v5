-- Harden public order/debt RPC execution for the Cloudflare 76aed41c baseline.
-- These functions are intentionally callable by authenticated users because
-- application-level admin/operator checks run inside the RPC call chain.
-- They must never inherit EXECUTE through PUBLIC/anon.

revoke execute on function public.create_order_full_v2(
  text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) from public;
revoke execute on function public.create_order_full_v2(
  text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) from anon;
grant execute on function public.create_order_full_v2(
  text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) to authenticated;

revoke execute on function public.update_order_full_v2(
  uuid,text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) from public;
revoke execute on function public.update_order_full_v2(
  uuid,text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) from anon;
grant execute on function public.update_order_full_v2(
  uuid,text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) to authenticated;

revoke execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) from public;
revoke execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) from anon;
grant execute on function public.register_customer_payment_v2(
  uuid,numeric,text,numeric,numeric,text,text,jsonb
) to authenticated;
