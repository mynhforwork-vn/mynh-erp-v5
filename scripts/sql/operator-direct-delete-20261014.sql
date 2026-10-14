-- MYNH ERP V5: Operator xóa trực tiếp (14/10/2026).
-- Chỉ chạy khi đã được duyệt thay đổi RPC Supabase; không tự động áp dụng bằng CI.
-- Giữ toàn bộ kiểm tra kho, tài chính, quan hệ đơn và audit trong các hàm private.
BEGIN;
DO $sync$
DECLARE f record; old_def text; new_def text;
BEGIN
 FOR f IN SELECT p.oid,n.nspname,p.proname
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='private' AND p.proname IN ('delete_erp_user_permanent_impl','delete_orders_permanent_safe_impl'))
      OR (n.nspname='public' AND p.proname IN ('delete_erp_user_permanent','delete_orders_permanent_safe'))
 LOOP
   old_def:=pg_get_functiondef(f.oid);
   new_def:=old_def;
   IF f.proname='delete_orders_permanent_safe_impl' THEN
     new_def:=replace(new_def,'perform private.assert_admin();','perform private.assert_operator();');
   ELSIF f.proname='delete_erp_user_permanent_impl' THEN
     new_def:=replace(new_def,'if v_role <> ''admin'' then','if v_role not in (''admin'',''operator'') then');
     new_def:=replace(new_def,
       'if v_user.archived_at is null then raise exception ''Cần lưu trữ User trước khi xóa vĩnh viễn''; end if;',
       '-- Xóa trực tiếp; vẫn giữ kiểm tra User có đơn hàng liên kết.');
   ELSE
     new_def:=replace(new_def,'<> ''admin''','not in (''admin'',''operator'')');
     new_def:=replace(new_def,'<>''admin''','not in (''admin'',''operator'')');
   END IF;
   IF old_def=new_def THEN RAISE EXCEPTION 'Guard không khớp %.%',f.nspname,f.proname; END IF;
   EXECUTE new_def;
 END LOOP;
END;
$sync$;
COMMIT;
