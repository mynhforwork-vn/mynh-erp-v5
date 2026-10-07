-- Configurable tracking rules + SPX raw-status mapping/direct adapter support.

create table if not exists public.tracking_runtime_settings (
  id text primary key default 'main',
  auto_tracking_enabled boolean not null default true,
  quiet_start time not null default time '02:00',
  quiet_end time not null default time '06:00',
  retry_minutes integer[] not null default array[10,30,60],
  updated_at timestamptz not null default now(),
  constraint tracking_runtime_singleton check (id='main'),
  constraint tracking_runtime_quiet_window check (quiet_start < quiet_end),
  constraint tracking_runtime_retry_nonempty check (cardinality(retry_minutes) between 1 and 10)
);

insert into public.tracking_runtime_settings(id)
values('main')
on conflict(id) do nothing;

create table if not exists public.tracking_rule_configs (
  status_code text primary key,
  label text not null,
  phase text not null,
  interval_minutes integer,
  auto_tracking boolean not null default true,
  terminal boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint tracking_rule_interval_range check (
    interval_minutes is null or interval_minutes between 15 and 1440
  )
);

insert into public.tracking_rule_configs
(status_code,label,phase,interval_minutes,auto_tracking,terminal,sort_order,is_active)
values
('READY_TO_SHIP','Chờ ĐVVC lấy hàng','PRE_SHIP',120,true,false,10,true),
('PICKUP_FAILED','Lấy hàng không thành công','PRE_SHIP',120,true,false,20,true),
('PICKED_UP','ĐVVC lấy hàng thành công','PRE_SHIP',120,true,false,30,true),
('IN_TRANSIT','Đang vận chuyển','TRANSPORT',120,true,false,40,true),
('ARRIVED_TRANSIT_HUB','Đến HUB trung chuyển','TRANSPORT',120,true,false,50,true),
('ARRIVED_DESTINATION_HUB','Đến kho đích','DESTINATION',120,true,false,60,true),
('OUT_FOR_DELIVERY','Đang giao hàng','DELIVERY',60,true,false,70,true),
('DELIVERY_FAILED','Giao hàng không thành công','DELIVERY',120,true,false,80,true),
('RETURNING','Đang hoàn hàng','RETURN',120,true,false,90,true),
('DELIVERED','Giao hàng thành công','FINAL',null,false,true,100,true),
('CANCELLED','Đơn hàng bị huỷ','FINAL',null,false,true,110,true),
('RETURNED','Hoàn hàng thành công','FINAL',null,false,true,120,true),
('UNKNOWN','Chưa nhận diện','UNKNOWN',120,true,false,130,true)
on conflict(status_code) do update set
  label=excluded.label,
  phase=excluded.phase,
  terminal=excluded.terminal,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

create table if not exists public.carrier_status_mappings (
  id uuid primary key default gen_random_uuid(),
  carrier text not null,
  raw_code text not null,
  raw_name text,
  canonical_status text not null,
  note text,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carrier_status_mapping_unique unique(carrier,raw_code),
  constraint carrier_status_mapping_code_not_blank check (length(btrim(raw_code))>0)
);

insert into public.carrier_status_mappings
(carrier,raw_code,raw_name,canonical_status,note,priority,is_active)
values
('SPX','A000','SLSTN Created','READY_TO_SHIP',null,10,true),
('SPX','F000','Manifested','READY_TO_SHIP',null,10,true),
('SPX','F001','Unsuccessful Pickup Attempt','PICKUP_FAILED','Giữ reason_code/reason_desc để phân biệt nguyên nhân',10,true),
('SPX','F440','Enter Domestic First Mile Hub','ARRIVED_TRANSIT_HUB',null,20,true),
('SPX','F445','Packed in First Mile Hub','IN_TRANSIT',null,20,true),
('SPX','F441','Loaded to Truck in First Mile Hub','IN_TRANSIT',null,20,true),
('SPX','F450','Left Domestic First Mile Hub','IN_TRANSIT',null,20,true),
('SPX','F510','Enter Domestic Sorting Center','ARRIVED_TRANSIT_HUB',null,20,true),
('SPX','F515','Packed in Domestic Sorting Centre','IN_TRANSIT',null,20,true),
('SPX','F541','Loaded to Truck in Sorting Centre','IN_TRANSIT',null,20,true),
('SPX','F540','Left Domestic Sorting Center','IN_TRANSIT',null,20,true),
('SPX','F580','Domestic Line Haul End','IN_TRANSIT',null,20,true),
('SPX','F598','Delivery Driver Assigned','IN_TRANSIT','Không tự coi là kho đích; transition guard giữ phase nếu đã xác nhận kho đích',30,true),
('SPX','F599','Enter Last Mile Hub','ARRIVED_TRANSIT_HUB','Chỉ nâng thành ARRIVED_DESTINATION_HUB khi location match HUB/alias đã cấu hình',30,true),
('SPX','F600','Out For Delivery','OUT_FOR_DELIVERY',null,40,true),
('SPX','F650','Delivery Attempt Failed','DELIVERY_FAILED',null,40,true),
('SPX','F668','Return Initiated','RETURNING',null,50,true),
('SPX','F585','Intercepted','RETURNING','Không map CANCELLED vì vẫn tiếp tục RTS',50,true),
('SPX','F677','RTS Line Haul Transportation','RETURNING',null,50,true),
('SPX','F671','Enter RTS Sorting Centre','RETURNING',null,50,true),
('SPX','F950','Pickup Request Canceled','CANCELLED',null,60,true),
('SPX','F980','Delivered','DELIVERED',null,60,true),
('SPX','F999','Returned to Sender','RETURNED',null,60,true)
on conflict(carrier,raw_code) do update set
  raw_name=excluded.raw_name,
  canonical_status=excluded.canonical_status,
  note=excluded.note,
  priority=excluded.priority,
  is_active=true,
  updated_at=now();

alter table public.destination_hub_configs
  add column if not exists carrier_code text not null default 'SPX',
  add column if not exists tracking_location_aliases text[] not null default '{}';

alter table public.tracking_events
  add column if not exists raw_status_code text,
  add column if not exists raw_status_name text,
  add column if not exists reason_code text,
  add column if not exists reason_description text,
  add column if not exists raw_payload jsonb;

alter table public.tracking_runtime_settings enable row level security;
alter table public.tracking_rule_configs enable row level security;
alter table public.carrier_status_mappings enable row level security;

revoke all on public.tracking_runtime_settings from anon;
revoke all on public.tracking_rule_configs from anon;
revoke all on public.carrier_status_mappings from anon;
grant select,update on public.tracking_runtime_settings to authenticated;
grant select,update on public.tracking_rule_configs to authenticated;
grant select,insert,update,delete on public.carrier_status_mappings to authenticated;

drop policy if exists tracking_runtime_read on public.tracking_runtime_settings;
create policy tracking_runtime_read
on public.tracking_runtime_settings for select to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists tracking_runtime_update on public.tracking_runtime_settings;
create policy tracking_runtime_update
on public.tracking_runtime_settings for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

drop policy if exists tracking_rules_read on public.tracking_rule_configs;
create policy tracking_rules_read
on public.tracking_rule_configs for select to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists tracking_rules_update on public.tracking_rule_configs;
create policy tracking_rules_update
on public.tracking_rule_configs for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

drop policy if exists carrier_status_mappings_read on public.carrier_status_mappings;
create policy carrier_status_mappings_read
on public.carrier_status_mappings for select to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists carrier_status_mappings_write on public.carrier_status_mappings;
create policy carrier_status_mappings_write
on public.carrier_status_mappings for all to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

create or replace function public.tracking_interval_minutes(p_status public.tracking_status)
returns integer
language sql
stable
set search_path=''
as $$
  select case
    when coalesce(r.terminal,false) or not coalesce(r.auto_tracking,true) then null
    else coalesce(r.interval_minutes,120)
  end
  from (select 1) seed
  left join public.tracking_rule_configs r
    on r.status_code=p_status::text
  limit 1;
$$;

create or replace function public.tracking_shift_out_of_quiet(p_candidate timestamptz)
returns timestamptz
language plpgsql
stable
set search_path=''
as $$
declare
  v_start time;
  v_end time;
  v_local timestamp;
begin
  select quiet_start,quiet_end into v_start,v_end
  from public.tracking_runtime_settings where id='main';

  v_start:=coalesce(v_start,time '02:00');
  v_end:=coalesce(v_end,time '06:00');
  v_local:=p_candidate at time zone 'Asia/Bangkok';

  if v_local::time >= v_start and v_local::time < v_end then
    return (date_trunc('day',v_local)+v_end) at time zone 'Asia/Bangkok';
  end if;
  return p_candidate;
end;
$$;

create or replace function public.next_tracking_at(p_from timestamptz,p_status public.tracking_status)
returns timestamptz
language plpgsql
stable
set search_path=''
as $$
declare
  v_minutes integer;
  v_enabled boolean;
begin
  select auto_tracking_enabled into v_enabled
  from public.tracking_runtime_settings where id='main';
  if coalesce(v_enabled,true)=false then return null; end if;

  v_minutes:=public.tracking_interval_minutes(p_status);
  if v_minutes is null then return null; end if;
  return public.tracking_shift_out_of_quiet(p_from+make_interval(mins=>v_minutes));
end;
$$;

create or replace function public.tracking_transition_allowed(
  p_old public.tracking_status,
  p_new public.tracking_status
)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare
  v_old_phase text;
  v_new_phase text;
  v_old_rank integer;
  v_new_rank integer;
begin
  if p_old is null or p_old=p_new then return true; end if;
  if p_old in ('DELIVERED','CANCELLED','RETURNED') then return false; end if;
  if p_new in ('DELIVERED','CANCELLED','RETURNED') then return true; end if;

  select phase into v_old_phase from public.tracking_rule_configs where status_code=p_old::text;
  select phase into v_new_phase from public.tracking_rule_configs where status_code=p_new::text;

  v_old_rank:=case v_old_phase
    when 'PRE_SHIP' then 1 when 'TRANSPORT' then 2 when 'DESTINATION' then 3
    when 'DELIVERY' then 4 when 'RETURN' then 5 when 'FINAL' then 6 else 0 end;
  v_new_rank:=case v_new_phase
    when 'PRE_SHIP' then 1 when 'TRANSPORT' then 2 when 'DESTINATION' then 3
    when 'DELIVERY' then 4 when 'RETURN' then 5 when 'FINAL' then 6 else 0 end;

  if p_old in ('OUT_FOR_DELIVERY','DELIVERY_FAILED') and p_new='ARRIVED_DESTINATION_HUB' then
    return true;
  end if;
  if p_old='ARRIVED_DESTINATION_HUB' and p_new='IN_TRANSIT' then
    return false;
  end if;

  return v_new_rank>=v_old_rank;
end;
$$;

create or replace function public.resolve_tracking_status(
  p_carrier text,
  p_raw_code text,
  p_raw_name text,
  p_raw_description text,
  p_raw_location text
)
returns table(
  normalized_status public.tracking_status,
  destination_hub text,
  mapping_source text
)
language plpgsql
stable
set search_path=''
as $$
declare
  v_carrier text;
  v_status text;
  v_loc text:=btrim(coalesce(p_raw_location,''));
  v_hub text;
begin
  select coalesce(c.carrier_code,upper(btrim(coalesce(p_carrier,''))))
    into v_carrier
  from (select 1) s
  left join public.shipping_carrier_configs c
    on lower(c.carrier_code)=lower(btrim(coalesce(p_carrier,'')))
    or lower(c.display_name)=lower(btrim(coalesce(p_carrier,'')))
  order by c.priority nulls last
  limit 1;

  select m.canonical_status into v_status
  from public.carrier_status_mappings m
  where upper(m.carrier)=upper(coalesce(v_carrier,p_carrier,''))
    and upper(m.raw_code)=upper(btrim(coalesce(p_raw_code,'')))
    and m.is_active=true
  order by m.priority asc
  limit 1;

  if v_status is null then
    case
      when lower(coalesce(p_raw_name,'')) ~ '(pickup done|picked up|pickup success)' then v_status:='PICKED_UP';
      when lower(coalesce(p_raw_name,'')) like '%unsuccessful pickup%' then v_status:='PICKUP_FAILED';
      when lower(coalesce(p_raw_name,'')) like '%out for delivery%' then v_status:='OUT_FOR_DELIVERY';
      when lower(coalesce(p_raw_name,'')) like '%delivery attempt failed%' then v_status:='DELIVERY_FAILED';
      when lower(coalesce(p_raw_name,''))='delivered' then v_status:='DELIVERED';
      when lower(coalesce(p_raw_name,'')) like '%returned to sender%' then v_status:='RETURNED';
      else v_status:='UNKNOWN';
    end case;
    mapping_source:='FALLBACK';
  else
    mapping_source:='RAW_CODE';
  end if;

  if upper(coalesce(v_carrier,''))='SPX'
     and upper(btrim(coalesce(p_raw_code,'')))='F599'
     and v_loc<>'' then
    select h.hub_code into v_hub
    from public.destination_hub_configs h
    where h.is_active=true
      and upper(coalesce(h.carrier_code,'SPX'))='SPX'
      and (
        lower(btrim(h.hub_code))=lower(v_loc)
        or exists(
          select 1 from unnest(coalesce(h.tracking_location_aliases,'{}'::text[])) a
          where lower(btrim(a))=lower(v_loc)
        )
      )
    order by h.priority asc,h.hub_code asc
    limit 1;

    if v_hub is not null then
      v_status:='ARRIVED_DESTINATION_HUB';
      mapping_source:='DESTINATION_HUB_MATCH';
    else
      v_status:='ARRIVED_TRANSIT_HUB';
    end if;
  end if;

  begin
    normalized_status:=v_status::public.tracking_status;
  exception when invalid_text_representation then
    normalized_status:='UNKNOWN'::public.tracking_status;
    mapping_source:='UNKNOWN_CANONICAL';
  end;
  destination_hub:=v_hub;
  return next;
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
    set receive_status=case when receive_status='RECEIVED' then 'RECEIVED'::public.receive_status else 'WAITING_RECEIVE'::public.receive_status end,
        updated_at=now()
    where id=v_order_id;
  end if;

  if v_changed then
    v_alert_type:=public.tracking_alert_type(v_effective_status);
    if v_alert_type is not null then
      insert into public.alert_events(order_id,shipment_id,tracking_event_id,alert_type,destination_hub)
      values(v_order_id,p_shipment_id,v_event_id,v_alert_type,p_destination_hub)
      on conflict(shipment_id,tracking_event_id,alert_type) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'duplicate',false,'event_id',v_event_id,'old_status',v_old_status,
    'normalized_event_status',p_normalized_status,'new_status',v_effective_status,
    'transition_allowed',v_allowed,'status_changed',v_changed,'next_track_at',v_next
  );
end;
$$;

revoke all on function public.apply_tracking_event_v2(uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text,text,text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.apply_tracking_event_v2(uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text,text,text,text,text,jsonb)
to service_role;

create or replace function public.mark_tracking_failure(
  p_shipment_id uuid,
  p_error_code text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fail integer;
  v_retries integer[];
  v_retry integer;
begin
  select tracking_fail_count+1 into v_fail
  from public.shipments where id=p_shipment_id for update;
  if not found then raise exception 'Shipment not found'; end if;

  select retry_minutes into v_retries
  from public.tracking_runtime_settings where id='main';
  v_retries:=coalesce(v_retries,array[10,30,60]);
  v_retry:=v_retries[least(v_fail,cardinality(v_retries))];

  update public.shipments
  set tracking_fail_count=v_fail,
      next_track_at=public.tracking_shift_out_of_quiet(now()+make_interval(mins=>coalesce(v_retry,60))),
      queue_status='FAILED',
      locked_until=null,
      updated_at=now()
  where id=p_shipment_id;
end;
$$;

create or replace function public.claim_due_shipments(p_limit integer default 100)
returns table(
  shipment_id uuid,
  order_id uuid,
  tracking_number text,
  carrier text,
  current_tracking_status public.tracking_status
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean;
  v_local_time time;
  v_start time;
  v_end time;
begin
  select auto_tracking_enabled,quiet_start,quiet_end
    into v_enabled,v_start,v_end
  from public.tracking_runtime_settings where id='main';

  if coalesce(v_enabled,true)=false then return; end if;
  v_local_time:=(now() at time zone 'Asia/Bangkok')::time;
  if v_local_time>=coalesce(v_start,time '02:00') and v_local_time<coalesce(v_end,time '06:00') then return; end if;

  return query
  with candidates as (
    select s.id
    from public.shipments s
    join public.tracking_provider_configs p
      on p.enabled=true
     and (
       lower(p.carrier)=lower(coalesce(s.carrier,''))
       or exists(
         select 1 from public.shipping_carrier_configs c
         where upper(c.carrier_code)=upper(p.carrier)
           and (
             lower(c.carrier_code)=lower(coalesce(s.carrier,''))
             or lower(c.display_name)=lower(coalesce(s.carrier,''))
           )
       )
     )
    where s.tracking_enabled=true
      and s.is_active=true
      and s.next_track_at is not null
      and s.next_track_at<=now()
      and (s.locked_until is null or s.locked_until<now())
      and s.current_tracking_status not in ('DELIVERED','CANCELLED','RETURNED')
    order by
      case s.current_tracking_status
        when 'OUT_FOR_DELIVERY' then 1
        when 'DELIVERY_FAILED' then 2
        when 'ARRIVED_DESTINATION_HUB' then 3
        when 'PICKUP_FAILED' then 4
        when 'IN_TRANSIT' then 5
        when 'PICKED_UP' then 6
        when 'READY_TO_SHIP' then 7
        else 8
      end,
      s.next_track_at asc
    for update of s skip locked
    limit greatest(1,least(p_limit,500))
  ),
  claimed as (
    update public.shipments s
    set queue_status='PROCESSING',
        locked_until=now()+interval '5 minutes',
        updated_at=now()
    from candidates c
    where s.id=c.id
    returning s.id,s.order_id,s.tracking_number,s.carrier,s.current_tracking_status
  )
  select c.id,c.order_id,c.tracking_number,c.carrier,c.current_tracking_status
  from claimed c;
end;
$$;

create or replace function public.get_tracking_provider_runtime_config(p_carrier text)
returns table(
  carrier text,
  enabled boolean,
  adapter_type text,
  endpoint_url text,
  http_method text,
  timeout_ms integer,
  auth_header_name text,
  auth_secret text
)
language sql
security definer
set search_path=''
as $$
  select
    c.carrier,c.enabled,c.adapter_type,c.endpoint_url,c.http_method,c.timeout_ms,
    c.auth_header_name,v.decrypted_secret
  from public.tracking_provider_configs c
  left join vault.decrypted_secrets v on v.id=c.auth_secret_id
  where c.enabled=true
    and (
      upper(c.carrier)=upper(btrim(p_carrier))
      or exists(
        select 1 from public.shipping_carrier_configs sc
        where upper(sc.carrier_code)=upper(c.carrier)
          and (
            lower(sc.carrier_code)=lower(btrim(p_carrier))
            or lower(sc.display_name)=lower(btrim(p_carrier))
          )
      )
    )
  limit 1;
$$;

revoke all on function public.get_tracking_provider_runtime_config(text)
from public,anon,authenticated;
grant execute on function public.get_tracking_provider_runtime_config(text) to service_role;

create or replace function public.save_tracking_runtime_settings_secure(
  p_enabled boolean,
  p_quiet_start time,
  p_quiet_end time,
  p_retry_minutes integer[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_retry integer[]:=coalesce(p_retry_minutes,array[10,30,60]);
begin
  perform private.assert_admin();
  if p_quiet_start>=p_quiet_end then raise exception 'Giờ nghỉ Tracking phải có giờ bắt đầu nhỏ hơn giờ kết thúc'; end if;
  if cardinality(v_retry)<1 or cardinality(v_retry)>10 then raise exception 'Retry phải có từ 1 đến 10 mốc'; end if;
  if exists(select 1 from unnest(v_retry) x where x<1 or x>1440) then raise exception 'Retry phải trong khoảng 1-1440 phút'; end if;

  update public.tracking_runtime_settings
  set auto_tracking_enabled=coalesce(p_enabled,false),
      quiet_start=p_quiet_start,
      quiet_end=p_quiet_end,
      retry_minutes=v_retry,
      updated_at=now()
  where id='main';
end;
$$;

revoke all on function public.save_tracking_runtime_settings_secure(boolean,time,time,integer[]) from public,anon;
grant execute on function public.save_tracking_runtime_settings_secure(boolean,time,time,integer[]) to authenticated;

create or replace function public.save_tracking_rule_secure(
  p_status_code text,
  p_interval_minutes integer,
  p_auto_tracking boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_terminal boolean;
begin
  perform private.assert_admin();
  select terminal into v_terminal
  from public.tracking_rule_configs where status_code=upper(btrim(p_status_code));
  if not found then raise exception 'Trạng thái Tracking không tồn tại'; end if;
  if v_terminal then
    update public.tracking_rule_configs
    set interval_minutes=null,auto_tracking=false,updated_at=now()
    where status_code=upper(btrim(p_status_code));
    return;
  end if;
  if p_interval_minutes is null or p_interval_minutes<15 or p_interval_minutes>1440 then
    raise exception 'Chu kỳ Tracking phải từ 15 đến 1440 phút';
  end if;

  update public.tracking_rule_configs
  set interval_minutes=p_interval_minutes,
      auto_tracking=coalesce(p_auto_tracking,true),
      updated_at=now()
  where status_code=upper(btrim(p_status_code));
end;
$$;

revoke all on function public.save_tracking_rule_secure(text,integer,boolean) from public,anon;
grant execute on function public.save_tracking_rule_secure(text,integer,boolean) to authenticated;

create or replace function public.save_carrier_status_mapping_secure(
  p_carrier text,
  p_raw_code text,
  p_raw_name text,
  p_canonical_status text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_admin();
  if not exists(select 1 from public.tracking_rule_configs where status_code=upper(btrim(p_canonical_status))) then
    raise exception 'Canonical status không tồn tại';
  end if;
  insert into public.carrier_status_mappings(carrier,raw_code,raw_name,canonical_status,is_active,updated_at)
  values(
    upper(btrim(p_carrier)),upper(btrim(p_raw_code)),nullif(btrim(coalesce(p_raw_name,'')),''),
    upper(btrim(p_canonical_status)),coalesce(p_is_active,true),now()
  )
  on conflict(carrier,raw_code) do update set
    raw_name=excluded.raw_name,
    canonical_status=excluded.canonical_status,
    is_active=excluded.is_active,
    updated_at=now();
end;
$$;

revoke all on function public.save_carrier_status_mapping_secure(text,text,text,text,boolean) from public,anon;
grant execute on function public.save_carrier_status_mapping_secure(text,text,text,text,boolean) to authenticated;

create or replace function public.save_tracking_provider_config_secure_v2(
  p_carrier text,
  p_enabled boolean,
  p_adapter_type text,
  p_endpoint_url text,
  p_http_method text,
  p_timeout_ms integer,
  p_auth_header_name text default null,
  p_auth_secret text default null,
  p_clear_secret boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_carrier text:=upper(btrim(coalesce(p_carrier,'')));
  v_adapter text:=upper(btrim(coalesce(p_adapter_type,'NORMALIZED_JSON')));
  v_method text:=upper(btrim(coalesce(p_http_method,'GET')));
  v_secret_id uuid;
begin
  perform private.assert_admin();
  if v_carrier='' then raise exception 'Thiếu mã ĐVVC'; end if;
  if v_adapter not in ('NORMALIZED_JSON','SPX_PUBLIC') then raise exception 'Adapter Tracking không hợp lệ'; end if;
  if v_method not in ('GET','POST') then raise exception 'HTTP method không hợp lệ'; end if;
  if p_enabled and v_adapter='NORMALIZED_JSON' and (p_endpoint_url is null or btrim(p_endpoint_url) not like 'https://%') then
    raise exception 'Tracking Provider đang bật phải dùng HTTPS endpoint';
  end if;

  select auth_secret_id into v_secret_id
  from public.tracking_provider_configs where upper(carrier)=v_carrier;

  if p_clear_secret and v_secret_id is not null then
    delete from vault.secrets where id=v_secret_id;
    v_secret_id:=null;
  elsif nullif(btrim(coalesce(p_auth_secret,'')),'') is not null then
    if v_secret_id is null then
      select vault.create_secret(
        btrim(p_auth_secret),
        'tracking_provider_'||lower(v_carrier)||'_auth',
        'MYNH ERP tracking provider auth for '||v_carrier
      ) into v_secret_id;
    else
      perform vault.update_secret(v_secret_id,btrim(p_auth_secret));
    end if;
  end if;

  insert into public.tracking_provider_configs(
    carrier,enabled,adapter_type,endpoint_url,http_method,timeout_ms,
    auth_header_name,auth_secret_id,updated_at
  )
  values(
    v_carrier,coalesce(p_enabled,false),v_adapter,
    case when v_adapter='SPX_PUBLIC' then 'https://spx.vn/shipment/order/open/order/get_order_info' else coalesce(btrim(p_endpoint_url),'') end,
    v_method,least(greatest(coalesce(p_timeout_ms,8000),1000),30000),
    nullif(btrim(coalesce(p_auth_header_name,'')),''),v_secret_id,now()
  )
  on conflict(carrier) do update set
    enabled=excluded.enabled,
    adapter_type=excluded.adapter_type,
    endpoint_url=excluded.endpoint_url,
    http_method=excluded.http_method,
    timeout_ms=excluded.timeout_ms,
    auth_header_name=excluded.auth_header_name,
    auth_secret_id=v_secret_id,
    updated_at=now();
end;
$$;

revoke all on function public.save_tracking_provider_config_secure_v2(text,boolean,text,text,text,integer,text,text,boolean)
from public,anon;
grant execute on function public.save_tracking_provider_config_secure_v2(text,boolean,text,text,text,integer,text,text,boolean)
to authenticated;

insert into public.tracking_provider_configs(
  carrier,enabled,adapter_type,endpoint_url,http_method,timeout_ms,updated_at
)
values(
  'SPX',true,'SPX_PUBLIC','https://spx.vn/shipment/order/open/order/get_order_info','GET',10000,now()
)
on conflict(carrier) do update set
  enabled=true,
  adapter_type='SPX_PUBLIC',
  endpoint_url='https://spx.vn/shipment/order/open/order/get_order_info',
  http_method='GET',
  timeout_ms=10000,
  updated_at=now();
