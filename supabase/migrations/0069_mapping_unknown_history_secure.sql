-- MYNH ERP V5 | PR #75 | 0069
-- SAFETY: additive RPC only. Does not modify any current business row during migration.
-- IMPORTANT: production database migration requires separate approval prior to applying.
-- Mapping save + optional SPX UNKNOWN history backfill are atomic in a single function call.
-- No changes to shipments/order KPIs, tracking poll cycles, providers or notifications.
create or replace function public.save_carrier_status_mapping_with_history_secure(
  p_carrier text,
  p_raw_code text,
  p_raw_name text,
  p_canonical_status text,
  p_is_active boolean
)
returns integer
language plpgsql
security definer
set search_path=''
as $mapping$
declare
  v_carrier text:=upper(btrim(coalesce(p_carrier,'')));
  v_code text:=upper(btrim(coalesce(p_raw_code,'')));
  v_status text:=upper(btrim(coalesce(p_canonical_status,'')));
  v_enabled boolean:=coalesce(p_is_active,true);
  v_updated integer:=0;
begin
  perform private.assert_admin();
  if v_carrier='SPX EXPRESS' then v_carrier:='SPX'; end if;
  if v_carrier='' or v_code='' or v_status='' or v_status='UNKNOWN' then
    raise exception 'Vui lòng chọn hãng, mã raw và trạng thái hợp lệ (khác UNKNOWN)';
  end if;
  if not exists (
    select 1 from public.tracking_rule_configs r
    where r.status_code=v_status and r.is_active=true
  ) then
    raise exception 'Trạng thái MYNH ERP không tồn tại hoặc đã tạm tắt';
  end if;
  -- Do not let editing the F599 catalogue invalidate location-aware HUB resolution.
  if v_carrier='SPX' and v_code='F599' and v_status<>'ARRIVED_TRANSIT_HUB' then
    raise exception 'F599 phải giữ ARRIVED_TRANSIT_HUB; HUB đích xác định bằng vị trí';
  end if;
  insert into public.carrier_status_mappings
    (carrier,raw_code,raw_name,canonical_status,is_active,updated_at)
  values (v_carrier,v_code,nullif(btrim(coalesce(p_raw_name,'')),''),
          v_status,v_enabled,now())
  on conflict (carrier,raw_code) do update set
    raw_name=excluded.raw_name,
    canonical_status=excluded.canonical_status,
    is_active=excluded.is_active,
    updated_at=now();

  -- Only a confirmed active SPX raw mapping may correct UNKNOWN historical events.
  -- Existing known event statuses are immutable here, including location-sensitive F599.
  -- Preserve historical event locations and source payload; never advance live shipments.
  if v_enabled and v_carrier='SPX' and v_code<>'F599' then
    update public.tracking_events e
    set normalized_status=v_status::public.tracking_status
    from public.shipments s
    where s.id=e.shipment_id
      and e.normalized_status='UNKNOWN'
      and upper(btrim(coalesce(e.raw_status_code,'')))=v_code
      and (
        upper(btrim(coalesce(s.carrier,'')))='SPX'
        or exists (
          select 1 from public.shipping_carrier_configs c
          where upper(btrim(c.carrier_code))='SPX'
            and upper(btrim(c.display_name))=upper(btrim(coalesce(s.carrier,'')))
        )
      );
    get diagnostics v_updated=row_count;
  end if;
  return v_updated;
end;
$mapping$;

revoke all on function public.save_carrier_status_mapping_with_history_secure(
  text,text,text,text,boolean) from public,anon;
grant execute on function public.save_carrier_status_mapping_with_history_secure(
  text,text,text,text,boolean) to authenticated;
