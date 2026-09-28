-- MYNH ERP V5
-- Store Shopee Password / SPC_ST / SPC_F in Supabase Vault.
-- User create/update is atomic and writes audit history.

alter table public.erp_users
  add column if not exists password_secret_id uuid,
  add column if not exists spc_st_secret_id uuid,
  add column if not exists spc_f_secret_id uuid;

create or replace function public.create_erp_user_full(
  p_username text,
  p_phone text default null,
  p_email text default null,
  p_status text default 'Active',
  p_mobile boolean default false,
  p_web boolean default false,
  p_voucher_summary text default null,
  p_note text default null,
  p_password text default null,
  p_spc_st text default null,
  p_spc_f text default null
) returns uuid
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_id uuid := gen_random_uuid();
  v_password_id uuid;
  v_spc_st_id uuid;
  v_spc_f_id uuid;
begin
  if public.current_erp_role() not in ('admin','operator') then
    raise exception 'Không có quyền thực hiện thao tác này';
  end if;

  p_username := btrim(coalesce(p_username,''));
  if p_username = '' then raise exception 'Tên đăng nhập là bắt buộc'; end if;
  if p_status not in ('Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định') then
    raise exception 'Trạng thái tài khoản không hợp lệ';
  end if;

  if nullif(btrim(coalesce(p_password,'')),'') is not null then
    v_password_id := vault.create_secret(p_password, 'erp_user_'||v_id||'_password', 'MYNH ERP Shopee user password');
  end if;
  if nullif(btrim(coalesce(p_spc_st,'')),'') is not null then
    v_spc_st_id := vault.create_secret(p_spc_st, 'erp_user_'||v_id||'_spc_st', 'MYNH ERP Shopee SPC_ST');
  end if;
  if nullif(btrim(coalesce(p_spc_f,'')),'') is not null then
    v_spc_f_id := vault.create_secret(p_spc_f, 'erp_user_'||v_id||'_spc_f', 'MYNH ERP Shopee SPC_F');
  end if;

  insert into public.erp_users(
    id,username,phone,email,status,note,mobile,web,voucher_summary,order_count,created_at_source,
    password_secret_id,spc_st_secret_id,spc_f_secret_id
  ) values (
    v_id,p_username,nullif(btrim(coalesce(p_phone,'')),''),nullif(btrim(coalesce(p_email,'')),''),
    p_status,nullif(btrim(coalesce(p_note,'')),''),coalesce(p_mobile,false),coalesce(p_web,false),
    nullif(btrim(coalesce(p_voucher_summary,'')),''),0,'MANUAL',
    v_password_id,v_spc_st_id,v_spc_f_id
  );

  insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,new_value,source)
  values (
    auth.uid(),'USERS','CREATE','ERP_USER',v_id::text,
    jsonb_build_object('username',p_username,'phone',p_phone,'email',p_email,'status',p_status,'mobile',p_mobile,'web',p_web),
    'USER'
  );

  return v_id;
end $$;

create or replace function public.update_erp_user_full(
  p_user_id uuid,
  p_username text,
  p_phone text default null,
  p_email text default null,
  p_status text default 'Active',
  p_mobile boolean default false,
  p_web boolean default false,
  p_voucher_summary text default null,
  p_note text default null,
  p_password text default null,
  p_spc_st text default null,
  p_spc_f text default null
) returns uuid
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_old public.erp_users%rowtype;
  v_password_id uuid;
  v_spc_st_id uuid;
  v_spc_f_id uuid;
begin
  if public.current_erp_role() not in ('admin','operator') then
    raise exception 'Không có quyền thực hiện thao tác này';
  end if;

  select * into v_old from public.erp_users where id=p_user_id for update;
  if not found then raise exception 'Không tìm thấy tài khoản'; end if;

  p_username := btrim(coalesce(p_username,''));
  if p_username = '' then raise exception 'Tên đăng nhập là bắt buộc'; end if;
  if p_status not in ('Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định') then
    raise exception 'Trạng thái tài khoản không hợp lệ';
  end if;

  v_password_id := v_old.password_secret_id;
  v_spc_st_id := v_old.spc_st_secret_id;
  v_spc_f_id := v_old.spc_f_secret_id;

  if nullif(btrim(coalesce(p_password,'')),'') is not null then
    if v_password_id is null then
      v_password_id := vault.create_secret(p_password, 'erp_user_'||p_user_id||'_password', 'MYNH ERP Shopee user password');
    else
      perform vault.update_secret(v_password_id,p_password);
    end if;
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,source)
    values(auth.uid(),'USERS','UPDATE_PASSWORD','ERP_USER',p_user_id::text,'USER');
  end if;

  if nullif(btrim(coalesce(p_spc_st,'')),'') is not null then
    if v_spc_st_id is null then
      v_spc_st_id := vault.create_secret(p_spc_st, 'erp_user_'||p_user_id||'_spc_st', 'MYNH ERP Shopee SPC_ST');
    else
      perform vault.update_secret(v_spc_st_id,p_spc_st);
    end if;
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,source)
    values(auth.uid(),'USERS','UPDATE_SPC_ST','ERP_USER',p_user_id::text,'USER');
  end if;

  if nullif(btrim(coalesce(p_spc_f,'')),'') is not null then
    if v_spc_f_id is null then
      v_spc_f_id := vault.create_secret(p_spc_f, 'erp_user_'||p_user_id||'_spc_f', 'MYNH ERP Shopee SPC_F');
    else
      perform vault.update_secret(v_spc_f_id,p_spc_f);
    end if;
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,source)
    values(auth.uid(),'USERS','UPDATE_SPC_F','ERP_USER',p_user_id::text,'USER');
  end if;

  if v_old.username is distinct from p_username then
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    values(auth.uid(),'USERS','UPDATE_USERNAME','ERP_USER',p_user_id::text,jsonb_build_object('username',v_old.username),jsonb_build_object('username',p_username),'USER');
  end if;
  if v_old.phone is distinct from nullif(btrim(coalesce(p_phone,'')),'') then
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    values(auth.uid(),'USERS','UPDATE_PHONE','ERP_USER',p_user_id::text,jsonb_build_object('phone',v_old.phone),jsonb_build_object('phone',nullif(btrim(coalesce(p_phone,'')),'')),'USER');
  end if;
  if v_old.email is distinct from nullif(btrim(coalesce(p_email,'')),'') then
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    values(auth.uid(),'USERS','UPDATE_EMAIL','ERP_USER',p_user_id::text,jsonb_build_object('email',v_old.email),jsonb_build_object('email',nullif(btrim(coalesce(p_email,'')),'')),'USER');
  end if;
  if v_old.status is distinct from p_status then
    insert into public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    values(auth.uid(),'USERS','UPDATE_STATUS','ERP_USER',p_user_id::text,jsonb_build_object('status',v_old.status),jsonb_build_object('status',p_status),'USER');
  end if;

  update public.erp_users set
    username=p_username,
    phone=nullif(btrim(coalesce(p_phone,'')),''),
    email=nullif(btrim(coalesce(p_email,'')),''),
    status=p_status,
    note=nullif(btrim(coalesce(p_note,'')),''),
    mobile=coalesce(p_mobile,false),
    web=coalesce(p_web,false),
    voucher_summary=nullif(btrim(coalesce(p_voucher_summary,'')),''),
    password_secret_id=v_password_id,
    spc_st_secret_id=v_spc_st_id,
    spc_f_secret_id=v_spc_f_id,
    updated_at=now()
  where id=p_user_id;

  return p_user_id;
end $$;

revoke all on function public.create_erp_user_full(text,text,text,text,boolean,boolean,text,text,text,text,text) from public, anon;
grant execute on function public.create_erp_user_full(text,text,text,text,boolean,boolean,text,text,text,text,text) to authenticated;

revoke all on function public.update_erp_user_full(uuid,text,text,text,text,boolean,boolean,text,text,text,text,text) from public, anon;
grant execute on function public.update_erp_user_full(uuid,text,text,text,text,boolean,boolean,text,text,text,text,text) to authenticated;
