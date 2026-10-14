-- MYNH ERP V5 / PR #79 — operational system notifications.
-- STAGED ONLY. Requires separate approval before applying to Production Supabase.
-- Keep tracking polling, provider adapters, Telegram and existing order alerts unchanged.
-- All notification delivery remains IN-APP and uses the existing 5-minute GET.
BEGIN;

create table if not exists public.system_notification_reads(
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null,
  read_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key(user_id,notification_id)
);
alter table public.system_notification_reads enable row level security;
revoke all on public.system_notification_reads from public,anon,authenticated;
grant select,insert,update on public.system_notification_reads to authenticated;
drop policy if exists system_notice_own_select on public.system_notification_reads;
create policy system_notice_own_select on public.system_notification_reads
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists system_notice_own_insert on public.system_notification_reads;
create policy system_notice_own_insert on public.system_notification_reads
  for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists system_notice_own_update on public.system_notification_reads;
create policy system_notice_own_update on public.system_notification_reads
  for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));

-- One bounded, live operational feed: it requires neither a new cron nor
-- additional provider requests. A later successful sync clears provider errors;
-- recognized statuses clear mapping errors; a successful cron run clears cron errors.
create or replace function private.active_system_notifications()
returns table(
  notification_id uuid,event_type text,category text,severity text,
  title text,message text,created_at timestamptz,order_id uuid,
  order_code text,target_path text
)
language sql stable security definer set search_path=''
as $system$
with latest_sync as(
  select distinct on(l.shipment_id)
    l.id,l.shipment_id,l.started_at,l.result
  from public.tracking_sync_logs l
  where l.completed_at is not null and l.started_at>=now()-interval '30 days'
  order by l.shipment_id,l.started_at desc,l.id desc
),latest_tracking as(
  select distinct on(e.shipment_id)
    e.id,e.shipment_id,e.created_at,e.normalized_status
  from public.tracking_events e
  where e.created_at>=now()-interval '30 days'
  order by e.shipment_id,e.event_time desc,e.created_at desc,e.id desc
),cron_latest as(
  select distinct on(j.jobid)
    j.jobid,d.runid,d.start_time,d.status
  from cron.job j
  join cron.job_run_details d on d.jobid=j.jobid
  where j.jobname='mynh-v5-tracking-dispatcher' and j.active=true
  order by j.jobid,d.start_time desc,d.runid desc
)
select l.id,'TRACKING_SYNC_FAILED'::text,'system'::text,'critical'::text,
  'Đồng bộ vận chuyển thất bại'::text,
  ('Đơn '||coalesce(o.shopee_order_id,'chưa có mã')||' không đồng bộ được vận chuyển. Cần kiểm tra nhà vận chuyển.')::text,
  l.started_at,o.id,o.shopee_order_id,
  ('/purchase/orders?range=all&order='||o.id::text)::text
from latest_sync l
join public.shipments s on s.id=l.shipment_id and s.is_active
join public.orders o on o.id=s.order_id and o.archived_at is null
where l.result='FAILED'
  and coalesce(o.order_status,'') not in ('CANCELLED','CANCELED')
  and s.current_tracking_status::text not in ('DELIVERED','CANCELLED','RETURNED')
  and upper(btrim(coalesce(s.tracking_number,''))) not in ('KHÔNG CÓ','KHONG CO')
union all
select e.id,'TRACKING_UNMAPPED_STATUS'::text,'system'::text,'warning'::text,
  'Trạng thái vận chuyển chưa nhận diện'::text,
  ('Đơn '||coalesce(o.shopee_order_id,'chưa có mã')||' có trạng thái nhà vận chuyển chưa được ánh xạ. Cần rà soát cấu hình.')::text,
  e.created_at,o.id,o.shopee_order_id,
  ('/purchase/orders?range=all&order='||o.id::text)::text
from latest_tracking e
join public.shipments s on s.id=e.shipment_id and s.is_active
join public.orders o on o.id=s.order_id and o.archived_at is null
where e.normalized_status::text='UNKNOWN'
  and coalesce(o.order_status,'') not in ('CANCELLED','CANCELED')
  and s.current_tracking_status::text not in ('DELIVERED','CANCELLED','RETURNED')
  and upper(btrim(coalesce(s.tracking_number,''))) not in ('KHÔNG CÓ','KHONG CO')
union all
select (md5('tracking-cron-failure:'||c.runid::text))::uuid,
  'TRACKING_CRON_FAILED'::text,'system'::text,'critical'::text,
  'Lịch đồng bộ Tracking gặp lỗi'::text,
  'Lần chạy gần nhất của lịch đồng bộ Tracking thất bại. Cần kiểm tra lịch và Edge Function.'::text,
  c.start_time,null::uuid,null::text,'/settings?section=tracking'::text
from cron_latest c where c.status='failed';
$system$;
revoke all on function private.active_system_notifications() from public,anon,authenticated;

create or replace function public.get_notification_feed(
  p_limit integer default 40,p_offset integer default 0,
  p_view text default 'all',p_category text default 'all'
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $feed$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>40
    or p_offset is null or p_offset<0 or p_offset>500
    or coalesce(p_view,'') not in ('all','unread','action')
    or coalesce(p_category,'') not in ('all','tracking','purchase','warehouse','sales','finance','system')
  then raise exception 'Bộ lọc thông báo không hợp lệ' using errcode='22023'; end if;
  -- Operational error details are restricted to Admin/Operator.
  if coalesce(public.current_erp_role(),'') not in ('admin','operator') then
    return jsonb_build_object('items','[]'::jsonb,'total',0,'unread_total',0,'action_total',0);
  end if;

  with notices as (
    select n.*,r.read_at,r.resolved_at
    from private.active_system_notifications() n
    left join public.system_notification_reads r
      on r.user_id=auth.uid() and r.notification_id=n.notification_id
  ),filtered as(
    select * from notices n
    where (p_view='all' or (p_view='unread' and n.read_at is null)
      or (p_view='action' and n.resolved_at is null))
      and (p_category='all' or n.category=p_category)
  ),page as(
    select * from filtered order by created_at desc,notification_id desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','system:'||p.notification_id::text,
        'notification_id',p.notification_id,
        'source','system','category',p.category,
        'severity',p.severity,'title',p.title,'message',p.message,
        'event_type',p.event_type,'created_at',p.created_at,
        'is_read',p.read_at is not null,'requires_action',true,
        'is_resolved',p.resolved_at is not null,
        'legacy_ids','[]'::jsonb,'order_id',p.order_id,
        'order_code',p.order_code,'destination_hub','',
        'group_count',1,'target_path',p.target_path
      ) order by p.created_at desc,p.notification_id desc) from page p
    ),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'unread_total',(select count(*) from notices where read_at is null),
    'action_total',(select count(*) from notices where resolved_at is null)
  ) into v_result;
  return v_result;
end;
$feed$;

create or replace function public.mark_system_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $read$
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
  if coalesce(public.current_erp_role(),'') not in ('admin','operator') then
    raise exception 'Không có quyền' using errcode='42501';
  end if;
  if not exists(select 1 from private.active_system_notifications() a where a.notification_id=p_id) then
    raise exception 'Thông báo không tồn tại hoặc đã tự xử lý' using errcode='22023';
  end if;
  insert into public.system_notification_reads(user_id,notification_id,read_at)
  values(auth.uid(),p_id,now())
  on conflict(user_id,notification_id) do update set read_at=excluded.read_at;
end;
$read$;

create or replace function public.mark_all_system_notifications_read()
returns void language plpgsql security definer set search_path=''
as $readall$
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
  if coalesce(public.current_erp_role(),'') not in ('admin','operator') then
    raise exception 'Không có quyền' using errcode='42501';
  end if;
  insert into public.system_notification_reads(user_id,notification_id,read_at)
  select auth.uid(),a.notification_id,now()
  from private.active_system_notifications() a
  on conflict(user_id,notification_id) do update set read_at=excluded.read_at;
end;
$readall$;

create or replace function public.resolve_system_notification(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $resolve$
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode='42501'; end if;
  if coalesce(public.current_erp_role(),'') not in ('admin','operator') then
    raise exception 'Không có quyền' using errcode='42501';
  end if;
  -- Technical incident alerts cannot be dismissed while the source is failing.
  if exists(select 1 from private.active_system_notifications() a where a.notification_id=p_id) then
    raise exception 'Lỗi vẫn tồn tại; cần xử lý nguồn lỗi trước' using errcode='23514';
  end if;
  update public.system_notification_reads set resolved_at=now(),read_at=now()
  where user_id=auth.uid() and notification_id=p_id;
end;
$resolve$;

revoke all on function public.get_notification_feed(integer,integer,text,text) from public,anon;
grant execute on function public.get_notification_feed(integer,integer,text,text) to authenticated;
revoke all on function public.mark_system_notification_read(uuid) from public,anon;
grant execute on function public.mark_system_notification_read(uuid) to authenticated;
revoke all on function public.mark_all_system_notifications_read() from public,anon;
grant execute on function public.mark_all_system_notifications_read() to authenticated;
revoke all on function public.resolve_system_notification(uuid) from public,anon;
grant execute on function public.resolve_system_notification(uuid) to authenticated;
COMMIT;
