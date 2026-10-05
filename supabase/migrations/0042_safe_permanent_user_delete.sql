create or replace function private.delete_erp_user_permanent_impl(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (select auth.jwt())->'app_metadata'->>'role';
  v_user public.erp_users%rowtype;
  v_order_count integer;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_role <> 'admin' then raise exception 'Chỉ Admin được xóa vĩnh viễn User' using errcode='42501'; end if;

  select * into v_user from public.erp_users where id=p_user_id for update;
  if not found then raise exception 'User không tồn tại'; end if;
  if v_user.archived_at is null then raise exception 'Cần lưu trữ User trước khi xóa vĩnh viễn'; end if;

  select count(*) into v_order_count from public.orders where erp_user_id=p_user_id;
  if v_order_count>0 then
    raise exception 'User có đơn hàng liên kết; chỉ được lưu trữ';
  end if;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'USERS','DELETE_USER_PERMANENT','ERP_USER',p_user_id::text,
    jsonb_build_object('username',v_user.username,'phone',v_user.phone,'email',v_user.email,'archived_at',v_user.archived_at),
    jsonb_build_object('deleted',true),
    'USER'
  );

  delete from public.erp_users where id=p_user_id;

  delete from vault.secrets
  where id in (v_user.password_secret_id,v_user.spc_st_secret_id,v_user.spc_f_secret_id);

  return jsonb_build_object('deleted',true,'user_id',p_user_id,'username',v_user.username);
end;
$$;

revoke execute on function private.delete_erp_user_permanent_impl(uuid) from public,anon,authenticated;

create or replace function public.delete_erp_user_permanent(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (select auth.jwt())->'app_metadata'->>'role' <> 'admin' then
    raise exception 'Chỉ Admin được xóa vĩnh viễn User' using errcode='42501';
  end if;
  return private.delete_erp_user_permanent_impl(p_user_id);
end;
$$;

revoke execute on function public.delete_erp_user_permanent(uuid) from public,anon;
grant execute on function public.delete_erp_user_permanent(uuid) to authenticated;
