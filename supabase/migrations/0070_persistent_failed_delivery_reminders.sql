-- MYNH ERP V5: preserve failed delivery history, but keep a failed
-- delivery reminder active only while the shipment is currently DELIVERY_FAILED.
-- A reshipment or return must not pin an old failed-delivery attempt.
-- Keep existing alert batching, existing 5-minute client polling, and RBAC.
-- Requires a separate, approved Supabase release. Do NOT auto-run on merge.
-- This replaces ONLY get_in_app_alerts; no data rewrite, cron or polling change.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_in_app_alerts(p_limit integer DEFAULT 30)
 RETURNS TABLE(alert_ids uuid[], alert_type text, label text, destination_hub text, alert_count bigint, order_codes text[], tracking_numbers text[], primary_order_id uuid, reason_summary text, created_at timestamp with time zone, is_read boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (a.alert_type='DELIVERY_FAILED'
        and o.order_status::text not in ('CANCELLED','CANCELED')
        and exists(
          select 1 from public.shipments active_s
          where active_s.order_id=o.id and active_s.is_active
            and active_s.current_tracking_status::text='DELIVERY_FAILED'
            and upper(btrim(coalesce(active_s.tracking_number,''))) not in ('KHÔNG CÓ','KHONG CO')
        )
        and not exists(
          select 1 from public.shipments active_s
          where active_s.order_id=o.id and active_s.is_active
            and active_s.current_tracking_status::text in ('DELIVERED','CANCELLED')
        )) as persistent_failure,
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
      and (a.created_at>=now()-interval '30 days'
        or (a.alert_type='DELIVERY_FAILED'
        and o.order_status::text not in ('CANCELLED','CANCELED')
        and exists(
          select 1 from public.shipments active_s
          where active_s.order_id=o.id and active_s.is_active
            and active_s.current_tracking_status::text='DELIVERY_FAILED'
            and upper(btrim(coalesce(active_s.tracking_number,''))) not in ('KHÔNG CÓ','KHONG CO')
        )
        and not exists(
          select 1 from public.shipments active_s
          where active_s.order_id=o.id and active_s.is_active
            and active_s.current_tracking_status::text in ('DELIVERED','CANCELLED')
        )))
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
      bool_or(e.persistent_failure) as persistent_failure,
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
  order by g.persistent_failure desc,g.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
$function$;
COMMIT;
