-- MYNH ERP — Notification Center V1.
-- Additive only: existing orders, alerts, tracking and Telegram are untouched.
create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 1 and 250),
  category text not null check(category in ('purchase','warehouse','sales','finance','system')),
  severity text not null default 'info' check(severity in ('info','warning','critical')),
  title text not null check(length(title) between 1 and 180),
  message text not null default '' check(length(message)<=2000),
  target_path text check(
    target_path is null or (
      left(target_path,1)='/' and left(target_path,2)<>'//'
      and position(chr(92) in target_path)=0
    )
  ),
  entity_type text,
  entity_id text,
  requires_action boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists system_notifications_created_idx on public.system_notifications(created_at desc,id);
create table if not exists public.notification_recipients (
  notification_id uuid not null references public.system_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(notification_id,user_id)
);
create index if not exists notification_recipients_user_idx
 on public.notification_recipients(user_id,notification_id,read_at,resolved_at);
create table if not exists public.notification_rules (
  event_code text primary key,
  category text not null check(category in ('purchase','warehouse','sales','finance','system')),
  enabled boolean not null default true,
  severity text not null default 'info' check(severity in ('info','warning','critical')),
  recipient_roles text[] not null default array['admin']::text[],
  dedupe_minutes integer not null default 5 check(dedupe_minutes between 0 and 1440),
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.system_notifications(id) on delete cascade,
  channel text not null check(channel in ('in_app','telegram')),
  destination text,
  status text not null check(status in ('pending','sent','failed','suppressed')),
  attempts integer not null default 0 check(attempts>=0),
  last_error text,
  updated_at timestamptz not null default now()
);
create index if not exists notification_deliveries_event_idx
 on public.notification_deliveries(notification_id,updated_at desc);

alter table public.system_notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.system_notifications,public.notification_recipients,
 public.notification_rules,public.notification_deliveries from anon,authenticated;
grant select on public.system_notifications,public.notification_recipients to authenticated;
grant select on public.notification_rules to authenticated;

drop policy if exists system_notification_assigned_read on public.system_notifications;
create policy system_notification_assigned_read on public.system_notifications
 for select to authenticated using (
   exists(select 1 from public.notification_recipients r
    where r.notification_id=id and r.user_id=(select auth.uid()))
 );
drop policy if exists notification_recipient_owner_read on public.notification_recipients;
create policy notification_recipient_owner_read on public.notification_recipients
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists notification_rules_admin_read on public.notification_rules;
create policy notification_rules_admin_read on public.notification_rules
 for select to authenticated using((select public.current_erp_role())='admin');

-- Single combined feed: preserve the existing 30-day transportation grouping
-- while adding recipient-scoped, separately paginated system notifications.
create or replace function public.get_notification_feed(
 p_limit integer default 20,p_offset integer default 0,
 p_view text default 'all',p_category text default 'all'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_json jsonb;
begin
 if v_user is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>40 or p_offset is null or p_offset<0 or p_offset>500 then
   raise exception 'Phân trang không hợp lệ';
 end if;
 if p_view not in ('all','unread','action') or
    p_category not in ('all','tracking','purchase','warehouse','sales','finance','system') then
   raise exception 'Bộ lọc thông báo không hợp lệ';
 end if;
 with tracking_feed as (
   select
     ('tracking:'||md5(array_to_string(g.alert_ids,',')))::text as id,
     'tracking'::text as source,'tracking'::text as category,
     (case when g.alert_type in ('PICKUP_FAILED','DELIVERY_FAILED') then 'critical'
            when g.alert_type='DELIVERED' then 'info'
            else 'warning' end)::text as severity,
     g.label::text as title,
     concat_ws(' · ',nullif(array_to_string(g.order_codes[1:2],' · '),''),
       nullif(g.destination_hub,''),g.reason_summary)::text as message,
     g.alert_type::text as event_type,
     g.created_at,g.is_read,
     false::boolean as requires_action,false::boolean as is_resolved,
     g.alert_ids as legacy_ids,null::uuid as notification_id,
     g.primary_order_id as order_id,
     g.destination_hub::text as destination_hub,
     g.alert_count::bigint as group_count,
     null::text as target_path
   from public.get_in_app_alerts(100) g
 ),
 system_feed as (
   select
     ('system:'||n.id::text)::text as id,
     'system'::text as source,n.category,n.severity,n.title,n.message,
     n.event_key::text as event_type,
     n.created_at,(r.read_at is not null) as is_read,
     n.requires_action,(r.resolved_at is not null) as is_resolved,
     array[]::uuid[] as legacy_ids,n.id as notification_id,
     null::uuid as order_id,''::text as destination_hub,
     1::bigint as group_count,n.target_path
   from public.notification_recipients r
   join public.system_notifications n on n.id=r.notification_id
   where r.user_id=v_user and (n.expires_at is null or n.expires_at>now())
 ),
 combined as (
   select * from tracking_feed
   union all
   select * from system_feed
 ),
 filtered as (
   select * from combined x where (p_category='all' or x.category=p_category)
     and (p_view='all' or (p_view='unread' and not x.is_read)
       or (p_view='action' and x.requires_action and not x.is_resolved))
 ),
 page as (
   select * from filtered order by created_at desc,id desc
   limit p_limit offset p_offset
 )
 select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from page q),'[]'::jsonb),
   'total',(select count(*) from filtered),
   'unread_total',(select count(*) from combined where not is_read),
   'action_total',(select count(*) from combined where requires_action and not is_resolved)
 ) into v_json;
 return v_json;
end;
$$;
revoke all on function public.get_notification_feed(integer,integer,text,text) from public,anon;
grant execute on function public.get_notification_feed(integer,integer,text,text) to authenticated;

create or replace function public.mark_system_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
 update public.notification_recipients
 set read_at=coalesce(read_at,now()) where notification_id=p_id and user_id=auth.uid();
end;
$$;
revoke all on function public.mark_system_notification_read(uuid) from public,anon;
grant execute on function public.mark_system_notification_read(uuid) to authenticated;

create or replace function public.mark_all_system_notifications_read()
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
 update public.notification_recipients
 set read_at=coalesce(read_at,now()) where user_id=auth.uid() and read_at is null;
end;
$$;
revoke all on function public.mark_all_system_notifications_read() from public,anon;
grant execute on function public.mark_all_system_notifications_read() to authenticated;

create or replace function public.resolve_system_notification(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or (select public.current_erp_role()) not in ('admin','operator') then
   raise exception 'Không có quyền xử lý thông báo' using errcode='42501';
 end if;
 update public.notification_recipients r
 set resolved_at=coalesce(r.resolved_at,now()),read_at=coalesce(r.read_at,now())
 from public.system_notifications n
 where r.notification_id=p_id and r.user_id=auth.uid()
   and n.id=r.notification_id and n.requires_action;
end;
$$;
revoke all on function public.resolve_system_notification(uuid) from public,anon;
grant execute on function public.resolve_system_notification(uuid) to authenticated;

-- Future emitters must use service-role, never browser/admin client RPC.
create or replace function private.enqueue_system_notification(
 p_event_key text,p_category text,p_severity text,
 p_title text,p_message text,p_target_path text,
 p_user_ids uuid[],p_requires_action boolean default false
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'Chỉ hệ thống được gửi thông báo' using errcode='42501';
 end if;
 insert into public.system_notifications(
   event_key,category,severity,title,message,target_path,requires_action
 ) values (
   p_event_key,p_category,p_severity,p_title,p_message,p_target_path,coalesce(p_requires_action,false)
 ) on conflict(event_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.system_notifications where event_key=p_event_key; end if;
 insert into public.notification_recipients(notification_id,user_id)
 select v_id,u from unnest(coalesce(p_user_ids,array[]::uuid[])) u
 on conflict(notification_id,user_id) do nothing;
 return v_id;
end;
$$;
revoke all on function private.enqueue_system_notification(text,text,text,text,text,text,uuid[],boolean)
 from public,anon,authenticated;
grant execute on function private.enqueue_system_notification(text,text,text,text,text,text,uuid[],boolean)
 to service_role;
notify pgrst,'reload schema';
