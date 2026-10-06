alter table public.customers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists customers_archived_at_idx
  on public.customers(archived_at desc) where archived_at is not null;

create or replace function public.update_sales_customer(
  p_customer_id uuid,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.customers%rowtype;
  v_name text:=btrim(coalesce(p_name,''));
begin
  perform private.assert_operator();
  if v_name='' then raise exception 'Tên khách hàng là bắt buộc'; end if;

  select * into v_old from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Khách hàng không tồn tại'; end if;
  if v_old.archived_at is not null then raise exception 'Khách hàng đang lưu trữ'; end if;

  update public.customers
  set name=v_name,
      phone=nullif(btrim(coalesce(p_phone,'')),''),
      address=nullif(btrim(coalesce(p_address,'')),''),
      note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_customer_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SALES','UPDATE_CUSTOMER','CUSTOMER',p_customer_id::text,
    jsonb_build_object('name',v_old.name,'phone',v_old.phone,'address',v_old.address,'note',v_old.note),
    jsonb_build_object('name',v_name,'phone',nullif(btrim(coalesce(p_phone,'')),''),
      'address',nullif(btrim(coalesce(p_address,'')),''),'note',nullif(btrim(coalesce(p_note,'')),'')),
    'USER'
  );
  return p_customer_id;
end;
$$;

create or replace function public.archive_sales_customer(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.customers%rowtype;
  v_balance numeric;
begin
  perform private.assert_operator();
  select * into v_old from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Khách hàng không tồn tại'; end if;
  if v_old.archived_at is not null then raise exception 'Khách hàng đã được lưu trữ'; end if;

  select coalesce(sum(debit-credit),0) into v_balance
  from public.debt_ledger where customer_id=p_customer_id;
  if v_balance>0 then raise exception 'Khách hàng còn công nợ; chưa thể lưu trữ'; end if;

  update public.customers set archived_at=now(),archived_by=v_actor,updated_at=now()
  where id=p_customer_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SALES','ARCHIVE_CUSTOMER','CUSTOMER',p_customer_id::text,
    jsonb_build_object('archived_at',v_old.archived_at,'name',v_old.name),
    jsonb_build_object('archived_at',now(),'name',v_old.name),'USER'
  );
  return p_customer_id;
end;
$$;

create or replace function public.restore_sales_customer(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.customers%rowtype;
begin
  perform private.assert_operator();
  select * into v_old from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Khách hàng không tồn tại'; end if;
  if v_old.archived_at is null then raise exception 'Khách hàng chưa được lưu trữ'; end if;

  update public.customers set archived_at=null,archived_by=null,updated_at=now()
  where id=p_customer_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SALES','RESTORE_CUSTOMER','CUSTOMER',p_customer_id::text,
    jsonb_build_object('archived_at',v_old.archived_at,'name',v_old.name),
    jsonb_build_object('archived_at',null,'name',v_old.name),'USER'
  );
  return p_customer_id;
end;
$$;

revoke execute on function public.update_sales_customer(uuid,text,text,text,text) from public,anon;
revoke execute on function public.archive_sales_customer(uuid) from public,anon;
revoke execute on function public.restore_sales_customer(uuid) from public,anon;
grant execute on function public.update_sales_customer(uuid,text,text,text,text) to authenticated;
grant execute on function public.archive_sales_customer(uuid) to authenticated;
grant execute on function public.restore_sales_customer(uuid) to authenticated;
