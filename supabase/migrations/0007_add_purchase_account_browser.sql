-- MYNH ERP V5
-- Add explicit browser metadata for purchase accounts.

alter table public.erp_users
  add column if not exists browser_name text;

update public.erp_users set browser_name='Chrome'
where username in ('demo_active_full','demo_m01','demo_m02','demo_captcha') and browser_name is null;

update public.erp_users set browser_name='Safari'
where username in ('demo_active_web','demo_m03','demo_unknown') and browser_name is null;

update public.erp_users set browser_name='Edge'
where username in ('demo_m04','demo_auto_huy','demo_blocked') and browser_name is null;
