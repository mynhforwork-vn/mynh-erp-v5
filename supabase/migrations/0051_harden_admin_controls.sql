-- Harden admin controls: privileged implementations live in private schema;
-- public RPCs are security-invoker wrappers only.

create or replace function private.admin_list_system_users_impl()
returns table(
  user_id uuid,
  email text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  is_anonymous boolean
)
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_admin();
  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_app_meta_data->>'role','viewer')::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    coalesce(u.is_anonymous,false)
  from auth.users u
  where coalesce(u.is_anonymous,false)=false
  order by u.created_at asc;
end;
$$;

create or replace function private.admin_set_system_user_role_impl(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_old_role text;
  v_email text;
begin
  perform private.assert_admin();
  if v_role not in ('admin','operator','viewer') then raise exception 'Vai trò không hợp lệ'; end if;

  select coalesce(raw_app_meta_data->>'role','viewer'),email::text
  into v_old_role,v_email
  from auth.users
  where id=p_user_id and coalesce(is_anonymous,false)=false
  for update;

  if not found then raise exception 'Tài khoản hệ thống không tồn tại'; end if;
  if p_user_id=v_actor and v_role<>'admin' then
    raise exception 'Không thể tự hạ quyền tài khoản Admin đang đăng nhập';
  end if;

  update auth.users
  set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',v_role),
      updated_at=now()
  where id=p_user_id;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  values(
    v_actor,'SETTINGS','CHANGE_SYSTEM_ROLE','AUTH_USER',p_user_id::text,
    jsonb_build_object('email',v_email,'role',v_old_role),
    jsonb_build_object('email',v_email,'role',v_role),
    'USER'
  );

  return jsonb_build_object('user_id',p_user_id,'email',v_email,'old_role',v_old_role,'role',v_role);
end;
$$;

create or replace function private.admin_reset_erp_data_impl(
  p_scope text,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_scope text:=upper(btrim(coalesce(p_scope,'')));
  v_deleted_secrets integer:=0;
begin
  perform private.assert_admin();

  if v_scope not in ('DATA','ALL') then raise exception 'Phạm vi reset không hợp lệ'; end if;
  if (v_scope='DATA' and p_confirm<>'RESET DU LIEU')
     or (v_scope='ALL' and p_confirm<>'RESET TOAN HE THONG') then
    raise exception 'Chuỗi xác nhận chưa đúng';
  end if;

  with secret_ids as (
    select password_secret_id id from public.erp_users where password_secret_id is not null
    union select spc_st_secret_id from public.erp_users where spc_st_secret_id is not null
    union select spc_f_secret_id from public.erp_users where spc_f_secret_id is not null
  )
  delete from vault.secrets s using secret_ids x where s.id=x.id;
  get diagnostics v_deleted_secrets=row_count;

  truncate table
    public.alert_events,
    public.customer_payment_allocations,
    public.customer_payments,
    public.debt_ledger,
    public.finance_document_lines,
    public.finance_documents,
    public.finance_transactions,
    public.inventory_transactions,
    public.order_items,
    public.order_vouchers,
    public.shipments,
    public.tracking_events,
    public.tracking_sync_logs,
    public.receive_batch_details,
    public.receive_batches,
    public.sale_return_items,
    public.sale_returns,
    public.sale_items,
    public.sale_payments,
    public.sales,
    public.shipper_payment_details,
    public.shipper_payments,
    public.transfer_items,
    public.transfer_batches,
    public.orders,
    public.customers,
    public.purchase_account_devices,
    public.erp_users,
    public.audit_logs
  restart identity cascade;

  if v_scope='ALL' then
    truncate table
      public.bank_transfer_configs,
      public.destination_hub_shipper_assignments,
      public.destination_hub_configs,
      public.destination_shippers,
      public.sales_product_categories,
      public.product_variants,
      public.products,
      public.shipping_carrier_configs,
      public.tracking_provider_configs,
      public.warehouse_settings
    restart identity cascade;

    delete from public.warehouses
    where id not in (
      '50000000-0000-0000-0000-000000000001'::uuid,
      '50000000-0000-0000-0000-000000000002'::uuid
    );

    insert into public.warehouses(id,code,name,address,is_active)
    values
      ('50000000-0000-0000-0000-000000000001'::uuid,'HN','Kho HN','164 Hồng Mai',true),
      ('50000000-0000-0000-0000-000000000002'::uuid,'BG','Kho BG','320 Nguyễn Công Hãng',true)
    on conflict(id) do update set
      code=excluded.code,
      name=excluded.name,
      address=excluded.address,
      is_active=true;

    insert into public.warehouse_settings(id,default_receiving_warehouse_id,updated_at)
    values('main',null,now())
    on conflict(id) do update
      set default_receiving_warehouse_id=null,updated_at=excluded.updated_at;
  end if;

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  values(
    v_actor,'SETTINGS',
    case when v_scope='ALL' then 'RESET_ALL_SYSTEM_DATA' else 'RESET_OPERATIONAL_DATA' end,
    'SYSTEM','GLOBAL',
    jsonb_build_object('scope',v_scope,'vault_secrets_deleted',v_deleted_secrets,'reset_at',now()),
    'USER'
  );

  return jsonb_build_object('ok',true,'scope',v_scope,'vault_secrets_deleted',v_deleted_secrets);
end;
$$;

revoke execute on function private.admin_list_system_users_impl() from public,anon;
revoke execute on function private.admin_set_system_user_role_impl(uuid,text) from public,anon;
revoke execute on function private.admin_reset_erp_data_impl(text,text) from public,anon;
grant execute on function private.admin_list_system_users_impl() to authenticated;
grant execute on function private.admin_set_system_user_role_impl(uuid,text) to authenticated;
grant execute on function private.admin_reset_erp_data_impl(text,text) to authenticated;

create or replace function public.admin_list_system_users()
returns table(
  user_id uuid,email text,role text,created_at timestamptz,last_sign_in_at timestamptz,email_confirmed_at timestamptz,is_anonymous boolean
)
language sql
security invoker
set search_path=''
as $$ select * from private.admin_list_system_users_impl(); $$;

create or replace function public.admin_set_system_user_role(p_user_id uuid,p_role text)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.admin_set_system_user_role_impl(p_user_id,p_role); $$;

create or replace function public.admin_reset_erp_data(p_scope text,p_confirm text)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.admin_reset_erp_data_impl(p_scope,p_confirm); $$;

revoke execute on function public.admin_list_system_users() from public,anon;
revoke execute on function public.admin_set_system_user_role(uuid,text) from public,anon;
revoke execute on function public.admin_reset_erp_data(text,text) from public,anon;
grant execute on function public.admin_list_system_users() to authenticated;
grant execute on function public.admin_set_system_user_role(uuid,text) to authenticated;
grant execute on function public.admin_reset_erp_data(text,text) to authenticated;
