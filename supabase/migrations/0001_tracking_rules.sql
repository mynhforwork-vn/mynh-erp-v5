-- Version-controlled copy of the V5 tracking scheduling rules.
create or replace function public.tracking_interval_minutes(p_status public.tracking_status)
returns integer language sql immutable set search_path='' as $$
  select case
    when p_status in ('DELIVERED','CANCELLED','RETURNED') then null
    when p_status = 'OUT_FOR_DELIVERY' then 60
    else 120
  end;
$$;

create or replace function public.next_tracking_at(p_from timestamptz,p_status public.tracking_status)
returns timestamptz language plpgsql stable set search_path='' as $$
declare v_minutes integer; v_candidate timestamptz; v_local timestamp;
begin
  v_minutes:=public.tracking_interval_minutes(p_status);
  if v_minutes is null then return null; end if;
  v_candidate:=p_from+make_interval(mins=>v_minutes);
  v_local:=v_candidate at time zone 'Asia/Bangkok';
  if extract(hour from v_local)>=2 and extract(hour from v_local)<6 then
    return (date_trunc('day',v_local)+interval '6 hours') at time zone 'Asia/Bangkok';
  end if;
  return v_candidate;
end;
$$;
