-- Production tracking provider credentials + Telegram alert delivery.
-- Secrets are stored in Supabase Vault and never exposed to the browser.

alter table public.tracking_provider_configs
  add column if not exists auth_header_name text,
  add column if not exists auth_secret_id uuid;

alter table public.alert_events
  add column if not exists delivery_attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists telegram_message_id text,
  add column if not exists telegram_chat_id text,
  add column if not exists suppressed_at timestamptz,
  add column if not exists suppressed_reason text;

create index if not exists alert_events_telegram_pending_idx
  on public.alert_events(created_at)
  where sent_at is null and suppressed_at is null;

create table if not exists public.telegram_alert_settings (
  id text primary key default 'main',
  enabled boolean not null default false,
  default_chat_id text,
  bot_token_secret_id uuid,
  alert_types text[] not null default array[
    'ARRIVED_DESTINATION_HUB',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED'
  ]::text[],
  updated_at timestamptz not null default now(),
  constraint telegram_alert_settings_singleton check (id='main')
);

insert into public.telegram_alert_settings(id,enabled)
values('main',false)
on conflict(id) do nothing;

create table if not exists public.telegram_alert_destinations (
  id uuid primary key default gen_random_uuid(),
  destination_hub text not null unique,
  chat_id text not null,
  alert_types text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_alert_settings enable row level security;
alter table public.telegram_alert_destinations enable row level security;

drop policy if exists telegram_alert_settings_read on public.telegram_alert_settings;
create policy telegram_alert_settings_read
on public.telegram_alert_settings for select
to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists telegram_alert_settings_write on public.telegram_alert_settings;
create policy telegram_alert_settings_write
on public.telegram_alert_settings for all
to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

drop policy if exists telegram_alert_destinations_read on public.telegram_alert_destinations;
create policy telegram_alert_destinations_read
on public.telegram_alert_destinations for select
to authenticated
using ((select public.current_erp_role()) in ('admin','operator'));

drop policy if exists telegram_alert_destinations_write on public.telegram_alert_destinations;
create policy telegram_alert_destinations_write
on public.telegram_alert_destinations for all
to authenticated
using ((select public.current_erp_role())='admin')
with check ((select public.current_erp_role())='admin');

create or replace function public.save_tracking_provider_config_secure(
  p_carrier text,
  p_enabled boolean,
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
  v_method text:=upper(btrim(coalesce(p_http_method,'GET')));
  v_secret_id uuid;
begin
  perform private.assert_admin();
  if v_carrier='' then raise exception 'Thiếu mã ĐVVC'; end if;
  if p_enabled and (p_endpoint_url is null or btrim(p_endpoint_url) not like 'https://%') then
    raise exception 'Tracking Provider đang bật phải dùng HTTPS endpoint';
  end if;
  if v_method not in ('GET','POST') then raise exception 'HTTP method không hợp lệ'; end if;

  select auth_secret_id into v_secret_id
  from public.tracking_provider_configs
  where upper(carrier)=v_carrier;

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
    v_carrier,coalesce(p_enabled,false),'NORMALIZED_JSON',coalesce(btrim(p_endpoint_url),''),
    v_method,least(greatest(coalesce(p_timeout_ms,8000),1000),30000),
    nullif(btrim(coalesce(p_auth_header_name,'')),''),v_secret_id,now()
  )
  on conflict(carrier) do update set
    enabled=excluded.enabled,
    adapter_type='NORMALIZED_JSON',
    endpoint_url=excluded.endpoint_url,
    http_method=excluded.http_method,
    timeout_ms=excluded.timeout_ms,
    auth_header_name=excluded.auth_header_name,
    auth_secret_id=v_secret_id,
    updated_at=now();
end;
$$;

revoke all on function public.save_tracking_provider_config_secure(text,boolean,text,text,integer,text,text,boolean)
  from public,anon;
grant execute on function public.save_tracking_provider_config_secure(text,boolean,text,text,integer,text,text,boolean)
  to authenticated;

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
  where upper(c.carrier)=upper(btrim(p_carrier))
    and c.enabled=true
  limit 1;
$$;

revoke all on function public.get_tracking_provider_runtime_config(text)
  from public,anon,authenticated;
grant execute on function public.get_tracking_provider_runtime_config(text)
  to service_role;

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
  v_types text[]:=coalesce(p_alert_types,array[]::text[]);
begin
  perform private.assert_admin();

  select bot_token_secret_id into v_secret_id
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
    id,enabled,default_chat_id,bot_token_secret_id,alert_types,updated_at
  )
  values(
    'main',coalesce(p_enabled,false),nullif(btrim(coalesce(p_default_chat_id,'')),''),
    v_secret_id,v_types,now()
  )
  on conflict(id) do update set
    enabled=excluded.enabled,
    default_chat_id=excluded.default_chat_id,
    bot_token_secret_id=v_secret_id,
    alert_types=excluded.alert_types,
    updated_at=now();
end;
$$;

revoke all on function public.save_telegram_alert_settings_secure(boolean,text,text[],text,boolean)
  from public,anon;
grant execute on function public.save_telegram_alert_settings_secure(boolean,text,text[],text,boolean)
  to authenticated;

create or replace function public.get_telegram_alert_runtime_settings()
returns table(
  enabled boolean,
  default_chat_id text,
  alert_types text[],
  bot_token text
)
language sql
security definer
set search_path=''
as $$
  select s.enabled,s.default_chat_id,s.alert_types,v.decrypted_secret
  from public.telegram_alert_settings s
  left join vault.decrypted_secrets v on v.id=s.bot_token_secret_id
  where s.id='main'
  limit 1;
$$;

revoke all on function public.get_telegram_alert_runtime_settings()
  from public,anon,authenticated;
grant execute on function public.get_telegram_alert_runtime_settings()
  to service_role;

create or replace function public.verify_telegram_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from vault.decrypted_secrets
    where name='telegram_cron_secret'
      and decrypted_secret=coalesce(p_secret,'')
  );
$$;

revoke all on function public.verify_telegram_cron_secret(text)
  from public,anon,authenticated;
grant execute on function public.verify_telegram_cron_secret(text)
  to service_role;

do $outer$
begin
  if not exists(select 1 from vault.secrets where name='telegram_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
      'telegram_cron_secret',
      'MYNH ERP Telegram alert dispatcher cron secret'
    );
  end if;
end
$outer$;

do $outer$
begin
  if not exists(select 1 from cron.job where jobname='mynh-v5-telegram-alert-dispatcher') then
    perform cron.schedule(
      'mynh-v5-telegram-alert-dispatcher',
      '* * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/telegram-alert-dispatcher',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='telegram_cron_secret')
          ),
          body := jsonb_build_object('limit',50),
          timeout_milliseconds := 15000
        );
      $job$
    );
  end if;
end
$outer$;
