-- Apply edited tracking rules immediately to currently active shipments.

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
  v_status text:=upper(btrim(p_status_code));
  v_terminal boolean;
  v_interval integer;
  v_auto boolean;
begin
  perform private.assert_admin();

  select terminal into v_terminal
  from public.tracking_rule_configs
  where status_code=v_status;
  if not found then raise exception 'Trạng thái Tracking không tồn tại'; end if;

  if v_terminal then
    update public.tracking_rule_configs
    set interval_minutes=null,auto_tracking=false,updated_at=now()
    where status_code=v_status;

    update public.shipments
    set tracking_enabled=false,next_track_at=null,locked_until=null,updated_at=now()
    where current_tracking_status::text=v_status;
    return;
  end if;

  if p_interval_minutes is null or p_interval_minutes<15 or p_interval_minutes>1440 then
    raise exception 'Chu kỳ Tracking phải từ 15 đến 1440 phút';
  end if;

  v_interval:=p_interval_minutes;
  v_auto:=coalesce(p_auto_tracking,true);

  update public.tracking_rule_configs
  set interval_minutes=v_interval,auto_tracking=v_auto,updated_at=now()
  where status_code=v_status;

  update public.shipments
  set tracking_enabled=v_auto and is_active,
      tracking_interval_minutes=v_interval,
      next_track_at=case
        when v_auto and is_active then public.tracking_shift_out_of_quiet(now()+make_interval(mins=>v_interval))
        else null
      end,
      locked_until=null,
      updated_at=now()
  where current_tracking_status::text=v_status;
end;
$$;

revoke all on function public.save_tracking_rule_secure(text,integer,boolean) from public,anon;
grant execute on function public.save_tracking_rule_secure(text,integer,boolean) to authenticated;

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
    join public.tracking_rule_configs r
      on r.status_code=s.current_tracking_status::text
     and r.is_active=true
     and r.auto_tracking=true
     and r.terminal=false
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
  if p_new='UNKNOWN' then return false; end if;

  if p_old='PICKED_UP' and p_new in ('READY_TO_SHIP','PICKUP_FAILED') then return false; end if;
  if p_old='PICKUP_FAILED' and p_new='READY_TO_SHIP' then return false; end if;

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

  return v_new_rank>=v_old_rank;
end;
$$;
