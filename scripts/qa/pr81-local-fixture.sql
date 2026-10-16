-- PR #81: disposable local-only fixture. Not a production migration.
-- Minimal dependencies for public.get_in_app_alerts and system notice RPCs.
create schema if not exists private;
create schema if not exists cron;
create table if not exists public.orders(
  id uuid primary key,
  shopee_order_id text,
  destination_hub text,
  order_status text,
  archived_at timestamptz
);
create table if not exists public.shipments(
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  is_active boolean not null default true,
  tracking_number text,
  current_tracking_status text
);
create table if not exists public.tracking_events(
  id uuid primary key,
  shipment_id uuid not null references public.shipments(id),
  normalized_status text,
  created_at timestamptz,
  event_time timestamptz,
  reason_description text
);
create table if not exists public.tracking_sync_logs(
  id uuid primary key,
  shipment_id uuid not null references public.shipments(id),
  started_at timestamptz,
  completed_at timestamptz,
  result text
);
create table if not exists public.alert_rule_configs(
  alert_type text primary key,
  label text,
  enabled boolean default true,
  in_app_enabled boolean default true,
  telegram_enabled boolean default false,
  batch_window_minutes integer default 0,
  sort_order integer default 0
);
create table if not exists public.alert_events(
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  shipment_id uuid not null references public.shipments(id),
  tracking_event_id uuid references public.tracking_events(id),
  alert_type text not null,
  destination_hub text,
  created_at timestamptz not null,
  suppressed_reason text
);
create table if not exists public.app_alert_reads(
  user_id uuid not null references auth.users(id),
  alert_event_id uuid not null references public.alert_events(id),
  read_at timestamptz default now(),
  primary key(user_id,alert_event_id)
);
-- Use real local Auth JWT claims, never user_metadata.
create or replace function public.current_erp_role()
returns text language sql stable set search_path=''
as $role$
  select (select auth.jwt())->'app_metadata'->>'role';
$role$;
-- cron is provided by pg_cron in some local stacks; fixture defines the
-- compatible subset only when those relations are absent.
create table if not exists cron.job(
  jobid bigint primary key,
  jobname text not null,
  active boolean not null default true
);
create table if not exists cron.job_run_details(
  runid bigint primary key,
  jobid bigint not null,
  start_time timestamptz,
  status text
);
insert into public.alert_rule_configs
(alert_type,label,enabled,in_app_enabled,telegram_enabled,batch_window_minutes,sort_order)
values ('DELIVERY_FAILED','Giao hàng không thành công',true,true,false,0,50)
on conflict(alert_type) do nothing;
insert into public.orders(id,shopee_order_id,destination_hub,order_status)
values ('11111111-1111-4111-8111-111111111111','QA-LOCAL-ORDER','QA-HUB','PROCESSING');
insert into public.shipments(id,order_id,is_active,tracking_number,current_tracking_status)
values ('22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',true,'QA-LOCAL-MVD','DELIVERY_FAILED');
insert into public.tracking_events(id,shipment_id,normalized_status,created_at,event_time,reason_description)
values ('33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222','UNKNOWN',now(),now(),'Kiểm thử trạng thái chưa ánh xạ');
insert into public.tracking_sync_logs(id,shipment_id,started_at,completed_at,result)
values ('44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',now(),now(),'FAILED');
insert into public.alert_events(id,order_id,shipment_id,alert_type,destination_hub,created_at,tracking_event_id)
values ('55555555-5555-4555-8555-555555555555',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'DELIVERY_FAILED','QA-HUB',now()-interval '40 days',null);
-- Explicitly permit the locally-authenticated JWT to call the legacy RPC.
-- Real Production grants must be independently reviewed.
