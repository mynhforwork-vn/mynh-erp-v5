-- 0080 isolated RLS, batch marking and audit tests.
\set ON_ERROR_STOP on
INSERT INTO public.orders(id,receive_status,warehouse_status)
VALUES ('e2000000-0000-4000-8000-000000000001','RECEIVED','WAREHOUSE_RECEIVED'),
       ('e2000000-0000-4000-8000-000000000002','RECEIVED','WAREHOUSE_SKIPPED');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
INSERT INTO public.user_table_row_marks(scope,row_key,pinned,color)
VALUES ('warehouse_receive','e2000000-0000-4000-8000-000000000001',true,'yellow'),
       ('warehouse_receive','e2000000-0000-4000-8000-000000000002',false,'blue');
INSERT INTO public.user_table_highlight_rules(scope,title,enabled,priority,match_mode,conditions,color)
VALUES('warehouse_receive','Đơn chưa ghép',true,2,'all',
 '[{"field":"sku_mapped","operator":"eq","value":false}]','pink');
SELECT public.save_table_row_flags('warehouse_receive',
 ARRAY['e2000000-0000-4000-8000-000000000001']::uuid[],
 'attention','Đơn cần kiểm tra SKU nhập kho');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.user_table_row_marks)<>2 OR
    (SELECT count(*) FROM public.user_table_highlight_rules)<>1 OR
    (SELECT count(*) FROM public.table_row_flags)<>1 OR
    (SELECT count(*) FROM public.audit_logs WHERE action='FLAG_ROW')<>1
 THEN RAISE EXCEPTION 'FAIL: failed to save personal markings or shared audit flag'; END IF;
 BEGIN
   INSERT INTO public.user_table_highlight_rules(scope,title,match_mode,conditions,color)
   VALUES('warehouse_receive','Điều kiện không hợp lệ','any',
     '[{"field":"sql_input","operator":"contains","value":"DROP"}]','blue');
   RAISE EXCEPTION 'FAIL: unapproved field accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
   INSERT INTO public.user_table_highlight_rules(scope,title,match_mode,conditions,color)
   VALUES('warehouse_receive','Quá nhiều điều kiện','any',
     '[{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"},{"field":"warehouse","operator":"eq","value":"BG"}]','blue');
   RAISE EXCEPTION 'FAIL: >6 rule conditions accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
-- A second authenticated user must not access the first user's personal marks or rules.
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"viewer"}}';
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.user_table_row_marks) OR
    EXISTS(SELECT 1 FROM public.user_table_highlight_rules) OR
    (SELECT count(*) FROM public.table_row_flags)<>1 THEN
   RAISE EXCEPTION 'FAIL: per-user RLS data leakage or missing shared flag';
 END IF;
 BEGIN
   UPDATE public.table_row_flags SET created_by=
      '60000000-0000-4000-8000-000000000002';
   RAISE EXCEPTION 'FAIL: shared flag direct edit granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.save_table_row_flags('warehouse_receive',
     ARRAY['e2000000-0000-4000-8000-000000000002']::uuid[],
     'urgent','Không có quyền gắn cờ');
   RAISE EXCEPTION 'FAIL: viewer can write flag';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';
DO $$
BEGIN
 IF (SELECT count(*) FROM public.user_table_row_marks)<>2 THEN
   RAISE EXCEPTION 'FAIL: original user lost personal marks';
 END IF;
 IF public.clear_table_row_flags('warehouse_receive',
   ARRAY['e2000000-0000-4000-8000-000000000001']::uuid[])<>1 THEN
   RAISE EXCEPTION 'FAIL: shared flag delete';
 END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action='UNFLAG_ROW')<>1 THEN
   RAISE EXCEPTION 'FAIL: missing flag removal audit';
 END IF;
END $$;
DO $$
BEGIN
 RAISE NOTICE 'PASS: personal pin/color RLS, safe field allowlist, shared flag RPC, audit, Admin/Operator/Viewer';
END $$;
