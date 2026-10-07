-- Alerts V1.1: independent In-app + Telegram channels and PICKUP_FAILED alert.

alter table public.alert_rule_configs
  add column if not exists in_app_enabled boolean not null default true;

insert into public.alert_rule_configs
(alert_type,label,enabled,in_app_enabled,telegram_enabled,batch_window_minutes,sort_order)
values
('PICKUP_FAILED','Lấy hàng không thành công',true,true,true,1,5)
on conflict(alert_type) do update set
  label=excluded.label,
  sort_order=excluded.sort_order,
  updated_at=now();

update public.alert_rule_configs
set in_app_enabled=true
where in_app_enabled is null;

update public.telegram_alert_settings
set alert_types=(
  select array_agg(distinct x order by x)
  from unnest(coalesce(alert_types,array[]::text[]) || array['PICKUP_FAILED']) x
)
where id='main';

alter table public.alert_events
  add column if not exists telegram_suppressed_at timestamptz,
  add column if not exists telegram_suppressed_reason text;

update public.alert_events
set telegram_suppressed_at=suppressed_at,
    telegram_suppressed_reason=suppressed_reason,
    suppressed_at=null,
    suppressed_reason=null
where suppressed_reason like 'TELEGRAM_%';

create table if not exists public.app_alert_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_event_id uuid not null references public.alert_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(user_id,alert_event_id)
);

create index if not exists app_alert_reads_event_idx
  on public.app_alert_reads(alert_event_id);

alter table public.app_alert_reads enable row level security;

revoke all on public.app_alert_reads from anon;
revoke all on public.app_alert_reads from authenticated;
grant select,insert,update,delete on public.app_alert_reads to authenticated;

drop policy if exists app_alert_reads_select on public.app_alert_reads;
create policy app_alert_reads_select
on public.app_alert_reads
for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists app_alert_reads_insert on public.app_alert_reads;
create policy app_alert_reads_insert
on public.app_alert_reads
for insert to authenticated
with check (user_id=(select auth.uid()));

drop policy if exists app_alert_reads_update on public.app_alert_reads;
create policy app_alert_reads_update
on public.app_alert_reads
for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

drop policy if exists app_alert_reads_delete on public.app_alert_reads;
create policy app_alert_reads_delete
on public.app_alert_reads
for delete to authenticated
using (user_id=(select auth.uid()));

-- Alert events are read-only to signed-in app users. Tracking/dispatch writes stay server-side.
alter table public.alert_events enable row level security;
revoke all on public.alert_events from anon;
revoke insert,update,delete on public.alert_events from authenticated;
grant select on public.alert_events to authenticated;

drop policy if exists alert_events_app_read on public.alert_events;
create policy alert_events_app_read
on public.alert_events
for select to authenticated
using (
  exists(
    select 1
    from public.orders o
    where o.id=alert_events.order_id
      and o.archived_at is null
  )
);

create or replace function public.save_alert_rule_secure(
  p_alert_type text,
  p_enabled boolean,
  p_in_app_enabled boolean,
  p_telegram_enabled boolean,
  p_batch_window_minutes integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_type text:=upper(btrim(coalesce(p_alert_type,'')));
begin
  perform private.assert_admin();

  if v_type='' then raise exception 'Thiếu loại cảnh báo'; end if;
  if p_batch_window_minutes is null or p_batch_window_minutes<0 or p_batch_window_minutes>60 then
    raise exception 'Cửa sổ gom cảnh báo phải từ 0 đến 60 phút';
  end if;

  update public.alert_rule_configs
  set enabled=coalesce(p_enabled,false),
      in_app_enabled=coalesce(p_in_app_enabled,false),
      telegram_enabled=coalesce(p_telegram_enabled,false),
      batch_window_minutes=p_batch_window_minutes,
      updated_at=now()
  where alert_type=v_type;

  if not found then raise exception 'Loại cảnh báo không tồn tại'; end if;
end;
$$;

revoke all on function public.save_alert_rule_secure(text,boolean,boolean,boolean,integer)
from public,anon;
grant execute on function public.save_alert_rule_secure(text,boolean,boolean,boolean,integer)
to authenticated;

create or replace function public.tracking_alert_type(p_status public.tracking_status)
returns text
language sql
immutable
set search_path=''
as $$
  select case p_status
    when 'PICKUP_FAILED' then 'PICKUP_FAILED'
    when 'ARRIVED_DESTINATION_HUB' then 'ARRIVED_DESTINATION_HUB'
    when 'OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
    when 'DELIVERY_FAILED' then 'DELIVERY_FAILED'
    when 'DELIVERED' then 'DELIVERED'
    else null
  end;
$$;

create or replace function public.get_in_app_alerts(p_limit integer default 30)
returns table(
  alert_ids uuid[],
  alert_type text,
  label text,
  destination_hub text,
  alert_count bigint,
  order_codes text[],
  tracking_numbers text[],
  primary_order_id uuid,
  reason_summary text,
  created_at timestamptz,
  is_read boolean
)
language sql
security definer
set search_path=''
as $$
  with me as (
    select auth.uid() user_id
  ),
  eligible as (
    select
      a.id,
      a.order_id,
      a.alert_type,
      r.label,
      coalesce(nullif(btrim(a.destination_hub),''),
               nullif(btrim(o.destination_hub),''),'') as destination_hub,
      o.shopee_order_id,
      s.tracking_number,
      te.reason_description,
      a.created_at,
      r.batch_window_minutes,
      case
        when r.batch_window_minutes=0 then
          a.created_at
        else
          date_bin(
            make_interval(mins=>greatest(r.batch_window_minutes,1)),
            a.created_at,
            timestamptz '2000-01-01 00:00:00+00'
          )
      end as bucket_start,
      exists(
        select 1
        from public.app_alert_reads ar,me
        where ar.user_id=me.user_id
          and ar.alert_event_id=a.id
      ) as is_read
    from public.alert_events a
    join public.alert_rule_configs r
      on r.alert_type=a.alert_type
     and r.enabled=true
     and r.in_app_enabled=true
    join public.orders o
      on o.id=a.order_id
     and o.archived_at is null
    join public.shipments s on s.id=a.shipment_id
    left join public.tracking_events te on te.id=a.tracking_event_id
    where auth.uid() is not null
      and (
        a.suppressed_reason is null
        or a.suppressed_reason<>'ALERT_DISABLED_BY_RULE'
      )
      and a.created_at>=now()-interval '30 days'
  ),
  grouped as (
    select
      e.alert_type,
      e.label,
      e.destination_hub,
      e.bucket_start,
      array_agg(e.id order by e.created_at desc) as alert_ids,
      count(*) as alert_count,
      array_agg(e.shopee_order_id order by e.created_at desc) as order_codes,
      array_agg(e.tracking_number order by e.created_at desc) as tracking_numbers,
      (array_agg(e.order_id order by e.created_at desc))[1] as primary_order_id,
      string_agg(distinct nullif(btrim(coalesce(e.reason_description,'')),''),' · ') as reason_summary,
      max(e.created_at) as created_at,
      bool_and(e.is_read) as is_read
    from eligible e
    group by e.alert_type,e.label,e.destination_hub,e.bucket_start
  )
  select
    g.alert_ids,
    g.alert_type,
    g.label,
    g.destination_hub,
    g.alert_count,
    g.order_codes,
    g.tracking_numbers,
    g.primary_order_id,
    g.reason_summary,
    g.created_at,
    g.is_read
  from grouped g
  order by g.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
$$;

revoke all on function public.get_in_app_alerts(integer)
from public,anon;
grant execute on function public.get_in_app_alerts(integer)
to authenticated;

create or replace function public.mark_in_app_alerts_read(p_alert_ids uuid[])
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  insert into public.app_alert_reads(user_id,alert_event_id,read_at)
  select v_user_id,a.id,now()
  from public.alert_events a
  join public.alert_rule_configs r
    on r.alert_type=a.alert_type
   and r.enabled=true
   and r.in_app_enabled=true
  where a.id=any(coalesce(p_alert_ids,array[]::uuid[]))
  on conflict(user_id,alert_event_id)
  do update set read_at=excluded.read_at;
end;
$$;

revoke all on function public.mark_in_app_alerts_read(uuid[])
from public,anon;
grant execute on function public.mark_in_app_alerts_read(uuid[])
to authenticated;

create or replace function public.mark_all_in_app_alerts_read()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  insert into public.app_alert_reads(user_id,alert_event_id,read_at)
  select v_user_id,a.id,now()
  from public.alert_events a
  join public.alert_rule_configs r
    on r.alert_type=a.alert_type
   and r.enabled=true
   and r.in_app_enabled=true
  join public.orders o on o.id=a.order_id and o.archived_at is null
  where a.created_at>=now()-interval '30 days'
  on conflict(user_id,alert_event_id)
  do update set read_at=excluded.read_at;
end;
$$;

revoke all on function public.mark_all_in_app_alerts_read()
from public,anon;
grant execute on function public.mark_all_in_app_alerts_read()
to authenticated;

create or replace function public.claim_due_telegram_alerts(p_limit integer default 100)
returns table(
  id uuid,
  order_id uuid,
  shipment_id uuid,
  alert_type text,
  destination_hub text,
  delivery_attempt_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean;
  v_enabled_at timestamptz;
begin
  select s.enabled,s.enabled_at
    into v_enabled,v_enabled_at
  from public.telegram_alert_settings s
  where s.id='main';

  if coalesce(v_enabled,false)=false then return; end if;

  if v_enabled_at is not null then
    update public.alert_events a
    set telegram_suppressed_at=now(),
        telegram_suppressed_reason='TELEGRAM_DISABLED_WINDOW',
        locked_until=null
    where a.sent_at is null
      and a.telegram_suppressed_at is null
      and a.created_at<v_enabled_at;
  end if;

  update public.alert_events a
  set telegram_suppressed_at=now(),
      telegram_suppressed_reason='TELEGRAM_DISABLED_BY_RULE',
      locked_until=null
  where a.sent_at is null
    and a.telegram_suppressed_at is null
    and not exists(
      select 1
      from public.alert_rule_configs r
      where r.alert_type=a.alert_type
        and r.enabled=true
        and r.telegram_enabled=true
    );

  return query
  with pending as (
    select
      a.id,
      a.alert_type,
      coalesce(nullif(btrim(a.destination_hub),''),
               nullif(btrim(o.destination_hub),''),'') as effective_hub,
      a.created_at,
      r.batch_window_minutes
    from public.alert_events a
    join public.orders o on o.id=a.order_id
    join public.alert_rule_configs r
      on r.alert_type=a.alert_type
     and r.enabled=true
     and r.telegram_enabled=true
    where a.sent_at is null
      and a.telegram_suppressed_at is null
      and (a.next_attempt_at is null or a.next_attempt_at<=now())
      and (a.locked_until is null or a.locked_until<now())
      and (v_enabled_at is null or a.created_at>=v_enabled_at)
  ),
  due_groups as (
    select
      p.alert_type,
      p.effective_hub,
      max(p.batch_window_minutes) as batch_window_minutes,
      min(p.created_at) as oldest_at
    from pending p
    group by p.alert_type,p.effective_hub
    having min(p.created_at)<=now()-make_interval(mins=>max(p.batch_window_minutes))
  ),
  candidates as (
    select a.id,p.effective_hub
    from public.alert_events a
    join pending p on p.id=a.id
    join due_groups g
      on g.alert_type=p.alert_type
     and g.effective_hub=p.effective_hub
    order by a.created_at asc
    for update of a skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  ),
  claimed as (
    update public.alert_events a
    set locked_until=now()+interval '5 minutes',
        last_attempt_at=now()
    from candidates c
    where a.id=c.id
    returning
      a.id,a.order_id,a.shipment_id,a.alert_type,c.effective_hub,
      a.delivery_attempt_count,a.created_at
  )
  select
    c.id,c.order_id,c.shipment_id,c.alert_type,c.effective_hub,
    c.delivery_attempt_count,c.created_at
  from claimed c
  order by c.created_at asc;
end;
$$;

create or replace function public.mark_telegram_alert_failure(
  p_alert_ids uuid[],
  p_error text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_retry integer[];
  v_max integer;
begin
  select retry_minutes,max_attempts into v_retry,v_max
  from public.telegram_alert_settings where id='main';

  v_retry:=coalesce(v_retry,array[5,15,30,60]);
  v_max:=coalesce(v_max,5);

  update public.alert_events a
  set delivery_attempt_count=a.delivery_attempt_count+1,
      last_attempt_at=now(),
      last_error=left(coalesce(p_error,'TELEGRAM_DELIVERY_ERROR'),1000),
      locked_until=null,
      telegram_suppressed_at=case
        when a.delivery_attempt_count+1>=v_max then now()
        else a.telegram_suppressed_at
      end,
      telegram_suppressed_reason=case
        when a.delivery_attempt_count+1>=v_max then 'TELEGRAM_MAX_ATTEMPTS'
        else a.telegram_suppressed_reason
      end,
      next_attempt_at=case
        when a.delivery_attempt_count+1>=v_max then null
        else now()+make_interval(
          mins=>v_retry[least(a.delivery_attempt_count+1,cardinality(v_retry))]
        )
      end
  where a.id=any(coalesce(p_alert_ids,array[]::uuid[]))
    and a.sent_at is null;
end;
$$;

create or replace function public.apply_tracking_event_v2(
  p_shipment_id uuid,
  p_event_time timestamptz,
  p_raw_status text,
  p_raw_description text,
  p_raw_location text,
  p_normalized_status public.tracking_status,
  p_normalized_location text,
  p_destination_hub text,
  p_source text,
  p_fingerprint text,
  p_raw_status_code text default null,
  p_raw_status_name text default null,
  p_reason_code text default null,
  p_reason_description text default null,
  p_raw_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event_id uuid;
  v_order_id uuid;
  v_old_status public.tracking_status;
  v_effective_status public.tracking_status;
  v_alert_type text;
  v_alert_enabled boolean;
  v_interval integer;
  v_next timestamptz;
  v_changed boolean;
  v_allowed boolean;
begin
  select s.order_id,s.current_tracking_status
    into v_order_id,v_old_status
  from public.shipments s
  where s.id=p_shipment_id
  for update;

  if not found then raise exception 'Shipment not found'; end if;

  insert into public.tracking_events(
    shipment_id,event_time,raw_status,raw_description,raw_location,
    normalized_status,normalized_location,destination_hub,source,fingerprint,
    raw_status_code,raw_status_name,reason_code,reason_description,raw_payload
  ) values(
    p_shipment_id,p_event_time,p_raw_status,p_raw_description,p_raw_location,
    p_normalized_status,p_normalized_location,p_destination_hub,p_source,p_fingerprint,
    p_raw_status_code,p_raw_status_name,p_reason_code,p_reason_description,p_raw_payload
  )
  on conflict(shipment_id,fingerprint) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    update public.shipments
    set last_track_at=now(),
        next_track_at=public.next_tracking_at(now(),current_tracking_status),
        queue_status='READY',
        locked_until=null,
        updated_at=now()
    where id=p_shipment_id;
    return jsonb_build_object('duplicate',true,'status_changed',false);
  end if;

  v_allowed:=public.tracking_transition_allowed(v_old_status,p_normalized_status);
  v_effective_status:=case when v_allowed then p_normalized_status else v_old_status end;
  v_changed:=v_allowed and (v_old_status is distinct from p_normalized_status);
  v_interval:=public.tracking_interval_minutes(v_effective_status);
  v_next:=public.next_tracking_at(now(),v_effective_status);

  update public.shipments
  set current_tracking_status=v_effective_status,
      tracking_enabled=(v_interval is not null),
      tracking_interval_minutes=coalesce(v_interval,tracking_interval_minutes),
      last_track_at=now(),
      next_track_at=v_next,
      last_status_change_at=case when v_changed then now() else last_status_change_at end,
      tracking_fail_count=0,
      queue_status='READY',
      locked_until=null,
      updated_at=now()
  where id=p_shipment_id;

  if p_destination_hub is not null and btrim(p_destination_hub)<>'' then
    update public.orders
    set destination_hub=p_destination_hub,updated_at=now()
    where id=v_order_id;
  end if;

  if v_effective_status='DELIVERED' then
    update public.orders
    set receive_status=case
      when receive_status='RECEIVED' then 'RECEIVED'::public.receive_status
      else 'WAITING_RECEIVE'::public.receive_status
    end,
    updated_at=now()
    where id=v_order_id;
  end if;

  if v_changed then
    v_alert_type:=public.tracking_alert_type(v_effective_status);
    if v_alert_type is not null then
      select r.enabled into v_alert_enabled
      from public.alert_rule_configs r
      where r.alert_type=v_alert_type;

      if coalesce(v_alert_enabled,false) then
        insert into public.alert_events(
          order_id,shipment_id,tracking_event_id,alert_type,destination_hub,next_attempt_at
        )
        values(
          v_order_id,p_shipment_id,v_event_id,v_alert_type,p_destination_hub,now()
        )
        on conflict(shipment_id,tracking_event_id,alert_type) do nothing;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'duplicate',false,'event_id',v_event_id,'old_status',v_old_status,
    'normalized_event_status',p_normalized_status,'new_status',v_effective_status,
    'transition_allowed',v_allowed,'status_changed',v_changed,'next_track_at',v_next
  );
end;
$$;
