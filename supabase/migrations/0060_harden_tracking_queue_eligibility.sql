-- Keep dynamic rule edits from re-enabling ineligible shipments,
-- and make the due queue explicitly exclude archived/express/invalid-MVD orders.

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

  update public.shipments s
  set tracking_enabled=(
        v_auto
        and s.is_active
        and btrim(coalesce(s.tracking_number,''))<>''
        and upper(btrim(coalesce(s.tracking_number,''))) not in
          ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
        and exists(
          select 1
          from public.orders o
          where o.id=s.order_id
            and o.archived_at is null
            and coalesce(o.shipping_service,'')<>'EXPRESS'
        )
      ),
      tracking_interval_minutes=v_interval,
      next_track_at=case
        when v_auto
          and s.is_active
          and btrim(coalesce(s.tracking_number,''))<>''
          and upper(btrim(coalesce(s.tracking_number,''))) not in
            ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
          and exists(
            select 1
            from public.orders o
            where o.id=s.order_id
              and o.archived_at is null
              and coalesce(o.shipping_service,'')<>'EXPRESS'
          )
        then public.tracking_shift_out_of_quiet(now()+make_interval(mins=>v_interval))
        else null
      end,
      locked_until=null,
      updated_at=now()
  where s.current_tracking_status::text=v_status;
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
  if v_local_time>=coalesce(v_start,time '02:00')
     and v_local_time<coalesce(v_end,time '06:00') then
    return;
  end if;

  return query
  with candidates as (
    select s.id
    from public.shipments s
    join public.orders o
      on o.id=s.order_id
     and o.archived_at is null
     and coalesce(o.shipping_service,'')<>'EXPRESS'
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
         select 1
         from public.shipping_carrier_configs c
         where upper(c.carrier_code)=upper(p.carrier)
           and (
             lower(c.carrier_code)=lower(coalesce(s.carrier,''))
             or lower(c.display_name)=lower(coalesce(s.carrier,''))
           )
       )
     )
    where s.tracking_enabled=true
      and s.is_active=true
      and btrim(coalesce(s.tracking_number,''))<>''
      and upper(btrim(coalesce(s.tracking_number,''))) not in
        ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
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
        when 'ARRIVED_TRANSIT_HUB' then 6
        when 'PICKED_UP' then 7
        when 'READY_TO_SHIP' then 8
        when 'RETURNING' then 9
        else 10
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
