-- Fix initial Tracking scheduling and Manual Sync carrier/provider matching.
--
-- 1) First sync for a newly added valid tracking number should be due immediately
--    (shifted out of quiet hours), not after the normal status interval.
-- 2) Manual Sync must resolve carrier display names (e.g. "SPX Express") to the
--    configured provider carrier code (e.g. "SPX"), matching Auto Tracking.
-- 3) Existing eligible shipments that have never been tracked are made due now.

create or replace function public.tracking_provider_available_for_carrier(p_carrier text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.tracking_provider_configs p
    where p.enabled=true
      and (
        lower(p.carrier)=lower(btrim(coalesce(p_carrier,'')))
        or exists(
          select 1
          from public.shipping_carrier_configs c
          where upper(c.carrier_code)=upper(p.carrier)
            and (
              lower(c.carrier_code)=lower(btrim(coalesce(p_carrier,'')))
              or lower(c.display_name)=lower(btrim(coalesce(p_carrier,'')))
            )
        )
      )
  );
$$;

revoke all on function public.tracking_provider_available_for_carrier(text)
from public,anon,authenticated;
grant execute on function public.tracking_provider_available_for_carrier(text) to service_role;

create or replace function public.schedule_initial_tracking()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_interval integer;
begin
  if new.tracking_enabled=true
     and new.is_active=true
     and new.last_track_at is null
     and btrim(coalesce(new.tracking_number,''))<>''
     and upper(btrim(coalesce(new.tracking_number,''))) not in
       ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
     and new.current_tracking_status not in ('DELIVERED','CANCELLED','RETURNED')
     and public.tracking_provider_available_for_carrier(new.carrier)
  then
    select r.interval_minutes
      into v_interval
    from public.tracking_rule_configs r
    where r.status_code=new.current_tracking_status::text
      and r.is_active=true
      and r.auto_tracking=true
      and r.terminal=false
    limit 1;

    if v_interval is not null then
      new.tracking_interval_minutes:=v_interval;
      new.next_track_at:=public.tracking_shift_out_of_quiet(now());
      new.queue_status:='READY';
      new.locked_until:=null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.schedule_initial_tracking()
from public,anon,authenticated;
grant execute on function public.schedule_initial_tracking() to service_role;

create or replace trigger trg_schedule_initial_tracking
before insert or update of tracking_number,carrier,tracking_enabled,is_active,current_tracking_status
on public.shipments
for each row
execute function public.schedule_initial_tracking();

create or replace function public.claim_manual_shipment(p_shipment_id uuid)
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
begin
  return query
  with candidate as (
    select s.id
    from public.shipments s
    join public.orders o
      on o.id=s.order_id
     and o.archived_at is null
     and coalesce(o.shipping_service,'')<>'EXPRESS'
    where s.id=p_shipment_id
      and s.is_active=true
      and btrim(coalesce(s.tracking_number,''))<>''
      and upper(btrim(coalesce(s.tracking_number,''))) not in
        ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
      and s.current_tracking_status not in ('DELIVERED','CANCELLED','RETURNED')
      and public.tracking_provider_available_for_carrier(s.carrier)
      and (s.locked_until is null or s.locked_until<now())
    for update of s skip locked
  ), claimed as (
    update public.shipments s
    set queue_status='PROCESSING',
        locked_until=now()+interval '5 minutes',
        updated_at=now()
    from candidate c
    where s.id=c.id
    returning s.id,s.order_id,s.tracking_number,s.carrier,s.current_tracking_status
  )
  select c.id,c.order_id,c.tracking_number,c.carrier,c.current_tracking_status
  from claimed c;

  if not found then
    raise exception 'Shipment is terminal, busy, inactive, archived, express, invalid, or provider is not configured';
  end if;
end;
$$;

revoke all on function public.claim_manual_shipment(uuid)
from public,anon,authenticated;
grant execute on function public.claim_manual_shipment(uuid) to service_role;

-- Backfill only shipments that have never had a tracking attempt.
update public.shipments s
set tracking_interval_minutes=coalesce(r.interval_minutes,s.tracking_interval_minutes,120),
    next_track_at=public.tracking_shift_out_of_quiet(now()),
    queue_status='READY',
    locked_until=null,
    updated_at=now()
from public.tracking_rule_configs r
where r.status_code=s.current_tracking_status::text
  and r.is_active=true
  and r.auto_tracking=true
  and r.terminal=false
  and s.tracking_enabled=true
  and s.is_active=true
  and s.last_track_at is null
  and btrim(coalesce(s.tracking_number,''))<>''
  and upper(btrim(coalesce(s.tracking_number,''))) not in
    ('CHƯA CÓ MVĐ','CHƯA CÓ MVD','CHUA CO MVD','KHÔNG CÓ','KHONG CO','PENDING')
  and public.tracking_provider_available_for_carrier(s.carrier)
  and exists(
    select 1
    from public.orders o
    where o.id=s.order_id
      and o.archived_at is null
      and coalesce(o.shipping_service,'')<>'EXPRESS'
  );
