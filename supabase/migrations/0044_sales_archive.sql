alter table public.sales
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists sales_archived_at_idx
  on public.sales(archived_at desc) where archived_at is not null;

create or replace function public.archive_pos_sales(p_sale_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_count integer;
begin
  perform private.assert_operator();
  if coalesce(array_length(p_sale_ids,1),0)=0 then raise exception 'Chưa chọn hóa đơn'; end if;
  if array_length(p_sale_ids,1)>200 then raise exception 'Tối đa 200 hóa đơn mỗi lần'; end if;

  select count(*) into v_count from public.sales where id=any(p_sale_ids);
  if v_count<>array_length(p_sale_ids,1) then raise exception 'Có hóa đơn không tồn tại'; end if;

  update public.sales
  set archived_at=now(),archived_by=v_actor,updated_at=now()
  where id=any(p_sale_ids) and archived_at is null;

  get diagnostics v_count=row_count;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  select v_actor,'SALES','ARCHIVE_SALE','SALE',id::text,
         jsonb_build_object('archived_at',archived_at),'USER'
  from public.sales where id=any(p_sale_ids);

  return v_count;
end;
$$;

create or replace function public.restore_pos_sales(p_sale_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_count integer;
begin
  perform private.assert_operator();
  if coalesce(array_length(p_sale_ids,1),0)=0 then raise exception 'Chưa chọn hóa đơn'; end if;
  if array_length(p_sale_ids,1)>200 then raise exception 'Tối đa 200 hóa đơn mỗi lần'; end if;

  select count(*) into v_count from public.sales where id=any(p_sale_ids);
  if v_count<>array_length(p_sale_ids,1) then raise exception 'Có hóa đơn không tồn tại'; end if;

  update public.sales
  set archived_at=null,archived_by=null,updated_at=now()
  where id=any(p_sale_ids) and archived_at is not null;

  get diagnostics v_count=row_count;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  select v_actor,'SALES','RESTORE_SALE','SALE',id::text,
         jsonb_build_object('archived_at',null),'USER'
  from public.sales where id=any(p_sale_ids);

  return v_count;
end;
$$;

revoke execute on function public.archive_pos_sales(uuid[]) from public,anon;
revoke execute on function public.restore_pos_sales(uuid[]) from public,anon;
grant execute on function public.archive_pos_sales(uuid[]) to authenticated;
grant execute on function public.restore_pos_sales(uuid[]) to authenticated;
