-- Alerts V1: separate alert rules from Telegram transport and add batching/retry locks.

create table if not exists public.alert_rule_configs (
  alert_type text primary key,
  label text not null,
  enabled boolean not null default true,
  telegram_enabled boolean not null default true,
  batch_window_minutes integer not null default 2,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  constraint alert_rule_batch_window_check check (batch_window_minutes between 0 and 60)
);

insert into public.alert_rule_configs
(alert_type,label,enabled,telegram_enabled,batch_window_minutes,sort_order)
values
('ARRIVED_DESTINATION_HUB','Đến kho đích',true,true,2,10),
('OUT_FOR_DELIVERY','Đang giao hàng',true,true,1,20),
('DELIVERY_FAILED','Giao hàng không thành công',true,true,1,30),
('DELIVERED','Giao hàng thành công',true,true,2,40)
on conflict(alert_type) do update set
  label=excluded.label,
  sort_order=excluded.sort_order,
  updated_at=now();

alter table public.alert_rule_configs enable row level security;

revoke all on public.alert_rule_configs from anon;
revoke all on public.alert_rule_configs from authenticated;
grant select,insert,update,delete on public.alert_rule_configs to authenticated;

drop policy if exists alert_rule_configs_read on public.alert_rule_configs;
create policy alert_rule_configs_read
on public.alert_rule_configs
for select to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists alert_rule_configs_insert on public.alert_rule_configs;
create policy alert_rule_configs_insert
on public.alert_rule_configs
for insert to authenticated
with check ((select public.current_erp_role())='admin');

drop policy if exists alert_rule_configs_update on public.alert_rule_configs;
create policy alert_rule_configs_update
on public.alert_rule_configs
for update to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

drop policy if exists alert_rule_configs_delete on public.alert_rule_configs;
create policy alert_rule_configs_delete
on public.alert_rule_configs
for delete to authenticated
using ((select public.current_erp_role())='admin');

alter table public.telegram_alert_settings
  add column if not exists retry_minutes integer[] not null default array[5,15,30,60],
  add column if not exists max_attempts integer not null default 5,
  add column if not exists enabled_at timestamptz;

alter table public.telegram_alert_settings
  drop constraint if exists telegram_alert_retry_nonempty,
  add constraint telegram_alert_retry_nonempty check (cardinality(retry_minutes) between 1 and 10),
  drop constraint if exists telegram_alert_max_attempts_check,
  add constraint telegram_alert_max_attempts_check check (max_attempts between 1 and 20);

update public.telegram_alert_settings
set enabled_at=case when enabled then coalesce(enabled_at,now()) else null end
where id='main';

alter table public.alert_events
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_until timestamptz;

update public.alert_events
set next_attempt_at=coalesce(next_attempt_at,created_at)
where sent_at is null and suppressed_at is null;

create index if not exists alert_events_delivery_due_idx
on public.alert_events(next_attempt_at,created_at)
where sent_at is null and suppressed_at is null;

create or replace function public.save_alert_rule_secure(
  p_alert_type text,
  p_enabled boolean,
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
      telegram_enabled=coalesce(p_telegram_enabled,false),
      batch_window_minutes=p_batch_window_minutes,
      updated_at=now()
  where alert_type=v_type;

  if not found then raise exception 'Loại cảnh báo không tồn tại'; end if;
end;
$$;

revoke all on function public.save_alert_rule_secure(text,boolean,boolean,integer)
from public,anon;
grant execute on function public.save_alert_rule_secure(text,boolean,boolean,integer)
to authenticated;

create or replace function public.save_telegram_delivery_policy_secure(
  p_retry_minutes integer[],
  p_max_attempts integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_retry integer[]:=coalesce(p_retry_minutes,array[5,15,30,60]);
  v_max integer:=coalesce(p_max_attempts,5);
begin
  perform private.assert_admin();

  if cardinality(v_retry)<1 or cardinality(v_retry)>10 then
    raise exception 'Retry Telegram phải có từ 1 đến 10 mốc';
  end if;
  if exists(select 1 from unnest(v_retry) x where x<1 or x>1440) then
    raise exception 'Mốc retry Telegram phải từ 1 đến 1440 phút';
  end if;
  if v_max<1 or v_max>20 then
    raise exception 'Số lần thử Telegram phải từ 1 đến 20';
  end if;

  update public.telegram_alert_settings
  set retry_minutes=v_retry,max_attempts=v_max,updated_at=now()
  where id='main';
end;
$$;

revoke all on function public.save_telegram_delivery_policy_secure(integer[],integer)
from public,anon;
grant execute on function public.save_telegram_delivery_policy_secure(integer[],integer)
to authenticated;

create or replace function public.save_telegram_alert_settings_secure(
  p_enabled boolean,
  p_default_chat_id text,
  p_alert_types text[],
  p_bot_token text default null,
  p_clear_token boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret_id uuid;
  v_types text[]:=coalesce(p_alert_types,array[
    'ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED'
  ]::text[]);
  v_was_enabled boolean:=false;
  v_enabled_at timestamptz;
begin
  perform private.assert_admin();

  select bot_token_secret_id,enabled,enabled_at
    into v_secret_id,v_was_enabled,v_enabled_at
  from public.telegram_alert_settings
  where id='main';

  if p_clear_token and v_secret_id is not null then
    delete from vault.secrets where id=v_secret_id;
    v_secret_id:=null;
  elsif nullif(btrim(coalesce(p_bot_token,'')),'') is not null then
    if v_secret_id is null then
      select vault.create_secret(
        btrim(p_bot_token),
        'mynh_telegram_bot_token',
        'MYNH ERP Telegram Bot token'
      ) into v_secret_id;
    else
      perform vault.update_secret(v_secret_id,btrim(p_bot_token));
    end if;
  end if;

  insert into public.telegram_alert_settings(
    id,enabled,default_chat_id,bot_token_secret_id,alert_types,enabled_at,updated_at
  )
  values(
    'main',coalesce(p_enabled,false),nullif(btrim(coalesce(p_default_chat_id,'')),''),
    v_secret_id,v_types,
    case when coalesce(p_enabled,false) then now() else null end,
    now()
  )
  on conflict(id) do update set
    enabled=excluded.enabled,
    default_chat_id=excluded.default_chat_id,
    bot_token_secret_id=v_secret_id,
    alert_types=excluded.alert_types,
    enabled_at=case
      when excluded.enabled and not coalesce(v_was_enabled,false) then now()
      when excluded.enabled then coalesce(v_enabled_at,now())
      else null
    end,
    updated_at=now();
end;
$$;

revoke all on function public.save_telegram_alert_settings_secure(boolean,text,text[],text,boolean)
from public,anon;
grant execute on function public.save_telegram_alert_settings_secure(boolean,text,text[],text,boolean)
to authenticated;

drop function if exists public.get_telegram_alert_runtime_settings();

create function public.get_telegram_alert_runtime_settings()
returns table(
  enabled boolean,
  default_chat_id text,
  bot_token text,
  retry_minutes integer[],
  max_attempts integer,
  enabled_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select
    s.enabled,
    s.default_chat_id,
    v.decrypted_secret,
    s.retry_minutes,
    s.max_attempts,
    s.enabled_at
  from public.telegram_alert_settings s
  left join vault.decrypted_secrets v on v.id=s.bot_token_secret_id
  where s.id='main'
  limit 1;
$$;

revoke all on function public.get_telegram_alert_runtime_settings()
from public,anon,authenticated;
grant execute on function public.get_telegram_alert_runtime_settings()
to service_role;

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
    set suppressed_at=now(),
        suppressed_reason='TELEGRAM_DISABLED_WINDOW',
        locked_until=null
    where a.sent_at is null
      and a.suppressed_at is null
      and a.created_at<v_enabled_at;
  end if;

  update public.alert_events a
  set suppressed_at=now(),
      suppressed_reason='TELEGRAM_DISABLED_BY_RULE',
      locked_until=null
  where a.sent_at is null
    and a.suppressed_at is null
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
      and a.suppressed_at is null
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

revoke all on function public.claim_due_telegram_alerts(integer)
from public,anon,authenticated;
grant execute on function public.claim_due_telegram_alerts(integer)
to service_role;

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
      suppressed_at=case
        when a.delivery_attempt_count+1>=v_max then now()
        else a.suppressed_at
      end,
      suppressed_reason=case
        when a.delivery_attempt_count+1>=v_max then 'TELEGRAM_MAX_ATTEMPTS'
        else a.suppressed_reason
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

revoke all on function public.mark_telegram_alert_failure(uuid[],text)
from public,anon,authenticated;
grant execute on function public.mark_telegram_alert_failure(uuid[],text)
to service_role;

create or replace function public.complete_telegram_alert_delivery(
  p_alert_ids uuid[],
  p_chat_id text,
  p_message_ids text
)
returns void
language sql
security definer
set search_path=''
as $$
  update public.alert_events
  set sent_at=now(),
      last_attempt_at=now(),
      last_error=null,
      telegram_chat_id=nullif(btrim(coalesce(p_chat_id,'')),''),
      telegram_message_id=nullif(btrim(coalesce(p_message_ids,'')),''),
      locked_until=null,
      next_attempt_at=null
  where id=any(coalesce(p_alert_ids,array[]::uuid[]));
$$;

revoke all on function public.complete_telegram_alert_delivery(uuid[],text,text)
from public,anon,authenticated;
grant execute on function public.complete_telegram_alert_delivery(uuid[],text,text)
to service_role;

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

      insert into public.alert_events(
        order_id,shipment_id,tracking_event_id,alert_type,destination_hub,
        next_attempt_at,suppressed_at,suppressed_reason
      )
      values(
        v_order_id,p_shipment_id,v_event_id,v_alert_type,p_destination_hub,
        now(),
        case when coalesce(v_alert_enabled,false) then null else now() end,
        case when coalesce(v_alert_enabled,false) then null else 'ALERT_DISABLED_BY_RULE' end
      )
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

revoke all on function public.apply_tracking_event_v2(
  uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text,
  text,text,text,text,jsonb
)
from public,anon,authenticated;
grant execute on function public.apply_tracking_event_v2(
  uuid,timestamptz,text,text,text,public.tracking_status,text,text,text,text,
  text,text,text,text,jsonb
) to service_role;
