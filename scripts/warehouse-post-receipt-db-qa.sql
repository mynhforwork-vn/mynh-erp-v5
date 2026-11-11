-- Use ONLY isolated PostgreSQL with warehouse fixture + 0075..0079.
\set ON_ERROR_STOP on
INSERT INTO public.orders(id,receive_status,warehouse_status)
 VALUES ('d1000000-0000-4000-8000-000000000001','RECEIVED','WAREHOUSE_MIXED');
INSERT INTO public.order_items(id,order_id,product_name,quantity,product_variant_id,inventory_multiplier)
 VALUES
 ('e1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001','SKU đã nhập kho',2,
  'b0000000-0000-4000-8000-000000000001',1),
 ('e1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001','Hàng trước đây bỏ kho',1,NULL,1);
INSERT INTO public.receive_batches(id,warehouse_id)
 VALUES ('a1000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001');
INSERT INTO public.receive_batch_details(id,order_id,receive_batch_id)
 VALUES ('a1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001');
INSERT INTO public.warehouse_item_decisions(
 order_item_id,order_id,product_variant_id,decision,sale_price,multiplier,
 skip_reason,processing_state,created_by,updated_by,finalized_at
) VALUES
 ('e1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001','IN',100000,1,
  NULL,'FINALIZED','60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',now()),
 ('e1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  NULL,'SKIP',0,1,'Không quản lý tồn','FINALIZED',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',now());
INSERT INTO public.inventory_transactions(
 warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id
) VALUES (
 '90000000-0000-4000-8000-000000000001',
 'b0000000-0000-4000-8000-000000000001','IN',2,'PURCHASE_RECEIPT',
 'd1000000-0000-4000-8000-000000000001');

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"operator"}}';
DO $$
BEGIN
 BEGIN
  PERFORM public.preview_received_sku_correction(
   'e1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002',1);
  RAISE EXCEPTION 'FAIL operator preview must be forbidden';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL operator preview must be forbidden' THEN RAISE; END IF;
 END;
END $$;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
DO $$
DECLARE snapshot jsonb;
BEGIN
 snapshot:=public.preview_received_sku_correction(
   'e1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002',1);
 IF NOT (snapshot->>'can_correct')::boolean
  OR snapshot->>'warehouse_code'<>'BG'
  OR (snapshot->>'old_quantity')::integer<>2
  OR (snapshot->>'new_quantity')::integer<>2
  OR (snapshot->>'source_balance')::integer<>6
  OR snapshot->>'new_sku'<>'SKU-NEW' THEN
   RAISE EXCEPTION 'FAIL incorrect receipt correction preview %',snapshot;
 END IF;
 BEGIN
   PERFORM public.preview_received_sku_correction(
    'e1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',1);
   RAISE EXCEPTION 'FAIL same SKU and factor accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='FAIL same SKU and factor accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.confirm_received_sku_correction(
   'e1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002',1,
   '00000000000000000000000000000000','Đối chiếu xác nhận SKU mới');
  RAISE EXCEPTION 'FAIL accepted stale preview';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL accepted stale preview' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.confirm_received_sku_correction(
   'e1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002',1,
   snapshot->>'fingerprint','');
  RAISE EXCEPTION 'FAIL accepted missing correction reason';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL accepted missing correction reason' THEN RAISE; END IF;
 END;
 PERFORM public.confirm_received_sku_correction(
   'e1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002',1,
   snapshot->>'fingerprint','Sai phân loại, chuyển sang SKU đúng');
END $$;
DO $$
BEGIN
 IF (SELECT quantity FROM public.inventory_balances WHERE
  warehouse_id='90000000-0000-4000-8000-000000000001' AND
  product_variant_id='b0000000-0000-4000-8000-000000000001')<>4 THEN
  RAISE EXCEPTION 'FAIL source balance after correction';
 END IF;
 IF (SELECT quantity FROM public.inventory_balances WHERE
  warehouse_id='90000000-0000-4000-8000-000000000001' AND
  product_variant_id='b0000000-0000-4000-8000-000000000002')<>4 THEN
  RAISE EXCEPTION 'FAIL target balance after correction';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions WHERE
  reference_type='WAREHOUSE_SKU_CORRECTION')<>2 THEN
  RAISE EXCEPTION 'FAIL exactly two delta ledger entries expected';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions WHERE
  reference_type='PURCHASE_RECEIPT' AND
  reference_id='d1000000-0000-4000-8000-000000000001')<>1 THEN
  RAISE EXCEPTION 'FAIL original purchase receipt rewritten';
 END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action='CORRECT_RECEIVED_SKU')<>1
  OR (SELECT count(*) FROM public.warehouse_sku_corrections)<>1 THEN
  RAISE EXCEPTION 'FAIL missing audited correction';
 END IF;
 IF (SELECT warehouse_status::text FROM public.orders WHERE
  id='d1000000-0000-4000-8000-000000000001')<>'WAREHOUSE_MIXED' THEN
  RAISE EXCEPTION 'FAIL mixed receipt status changed prematurely';
 END IF;
END $$;
DO $$
DECLARE snap jsonb;
BEGIN
 -- Repeat the same correction with stale old snapshot must reject.
 snap:=public.preview_received_sku_correction(
  'e1000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000002',1);
 IF NOT (snap->>'can_correct')::boolean OR (snap->>'old_quantity')::integer<>0 THEN
  RAISE EXCEPTION 'FAIL SKIP-to-IN preview';
 END IF;
 PERFORM public.confirm_received_sku_correction(
  'e1000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000002',1,
  snap->>'fingerprint','Xác nhận hàng đã nhận, chuyển từ Bỏ qua kho');
END $$;
DO $$
BEGIN
 IF (SELECT warehouse_status::text FROM public.orders WHERE
   id='d1000000-0000-4000-8000-000000000001')<>'WAREHOUSE_RECEIVED' THEN
   RAISE EXCEPTION 'FAIL SKIP-to-IN status should become received';
 END IF;
 IF (SELECT quantity FROM public.inventory_balances WHERE
  warehouse_id='90000000-0000-4000-8000-000000000001' AND
  product_variant_id='b0000000-0000-4000-8000-000000000002')<>5 THEN
  RAISE EXCEPTION 'FAIL SKIP-to-IN stock';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions WHERE
  reference_type='WAREHOUSE_SKU_CORRECTION')<>3 THEN
  RAISE EXCEPTION 'FAIL SKIP-to-IN must insert exactly one stock line';
 END IF;
 IF (SELECT count(*) FROM public.warehouse_sku_corrections)<>2 THEN
  RAISE EXCEPTION 'FAIL exactly two journal records';
 END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action='CORRECT_RECEIVED_SKU')<>2 THEN
  RAISE EXCEPTION 'FAIL missing audit';
 END IF;
END $$;
-- A real sale/return source SKU blocks correction rather than rewriting history.
RESET ROLE;
INSERT INTO public.sale_items(id,product_variant_id) VALUES(
 'e1000000-0000-4000-8000-000000000003',
 'b0000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
DO $$
DECLARE snap jsonb;
BEGIN
 snap:=public.preview_received_sku_correction(
  'e1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',1);
 IF (snap->>'can_correct')::boolean OR (snap->>'sale_history')::integer=0 THEN
  RAISE EXCEPTION 'FAIL source with sale history was not blocked';
 END IF;
END $$;
DO $qa$
BEGIN
 RAISE NOTICE 'PASS: finalized SKU correction, immutable receipts, SKIP-to-IN, stale fingerprint, admin, audit and sale safety';
END $qa$;
