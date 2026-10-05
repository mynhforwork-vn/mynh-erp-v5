create or replace function public.bulk_create_erp_users(p_rows jsonb)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_count integer;
  v_duplicate text;
  v_row jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
begin
  perform private.assert_operator();

  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'Dữ liệu import phải là danh sách';
  end if;

  v_count := jsonb_array_length(p_rows);
  if v_count=0 then raise exception 'Không có dòng dữ liệu để import'; end if;
  if v_count>200 then raise exception 'Tối đa 200 User mỗi lần import'; end if;

  select lower(btrim(x->>'username')) into v_duplicate
  from jsonb_array_elements(p_rows) x
  group by lower(btrim(x->>'username'))
  having count(*)>1
  limit 1;
  if v_duplicate is not null then
    raise exception 'Username bị trùng trong dữ liệu import: %',v_duplicate;
  end if;

  select btrim(x->>'username') into v_duplicate
  from jsonb_array_elements(p_rows) x
  where nullif(btrim(coalesce(x->>'username','')),'') is null
  limit 1;
  if found then raise exception 'Có dòng thiếu Username'; end if;

  select btrim(x->>'username') into v_duplicate
  from jsonb_array_elements(p_rows) x
  where exists(
    select 1 from public.erp_users u
    where lower(u.username)=lower(btrim(x->>'username'))
  )
  limit 1;
  if v_duplicate is not null then
    raise exception 'Username đã tồn tại: %',v_duplicate;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_id := public.create_erp_user_full(
      p_username => btrim(v_row->>'username'),
      p_phone => nullif(btrim(coalesce(v_row->>'phone','')),''),
      p_email => nullif(btrim(coalesce(v_row->>'email','')),''),
      p_status => coalesce(nullif(btrim(coalesce(v_row->>'status','')),''),'Active'),
      p_mobile => coalesce((v_row->>'mobile')::boolean,false),
      p_web => coalesce((v_row->>'web')::boolean,false),
      p_voucher_summary => null,
      p_note => nullif(btrim(coalesce(v_row->>'note','')),''),
      p_password => null,
      p_spc_st => nullif(btrim(coalesce(v_row->>'spc_st','')),''),
      p_spc_f => nullif(btrim(coalesce(v_row->>'spc_f','')),'')
    );
    v_ids := v_ids || jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object('count',v_count,'ids',v_ids);
end;
$$;

revoke execute on function public.bulk_create_erp_users(jsonb) from public,anon;
grant execute on function public.bulk_create_erp_users(jsonb) to authenticated;
