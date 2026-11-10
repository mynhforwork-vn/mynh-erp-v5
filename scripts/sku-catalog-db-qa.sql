-- Test catalog editing, classification, audited merge, blocking and permissions.
-- Run ONLY on the isolated PostgreSQL service after fixture + 0075..0078.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';

SELECT public.add_catalog_variant(
 'a0000000-0000-4000-8000-000000000001','Xanh',155000);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.product_variants
    WHERE product_id='a0000000-0000-4000-8000-000000000001'
      AND variant_name='Xanh' AND sale_price=155000) THEN
   RAISE EXCEPTION 'FAIL: variant not added';
 END IF;
 IF (SELECT count(*) FROM public.products WHERE sku='SKU-OLD')<>1 THEN
   RAISE EXCEPTION 'FAIL: classification duplicated product';
 END IF;
 BEGIN
  PERFORM public.add_catalog_variant(
   'a0000000-0000-4000-8000-000000000001',' xanh ',159000);
  RAISE EXCEPTION 'FAIL: case-insensitive duplicate variant accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: case-insensitive duplicate variant accepted' THEN RAISE; END IF;
 END;
END $$;

SELECT public.update_catalog_variant(
 'b0000000-0000-4000-8000-000000000001','sku-old',
 'Sản phẩm nguồn sửa','Đỏ',105000);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.products
    WHERE id='a0000000-0000-4000-8000-000000000001'
      AND sku='SKU-OLD' AND name='Sản phẩm nguồn sửa') THEN
   RAISE EXCEPTION 'FAIL: product not edited';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_variants
    WHERE id='b0000000-0000-4000-8000-000000000001'
      AND sale_price=105000) THEN
   RAISE EXCEPTION 'FAIL: price not edited';
 END IF;
END $$;

SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"viewer"}}';
DO $$
BEGIN
 BEGIN
  PERFORM public.update_catalog_variant(
    'b0000000-0000-4000-8000-000000000001','WRONG','WRONG','WRONG',1);
  RAISE EXCEPTION 'FAIL: viewer edited SKU';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: viewer edited SKU' THEN RAISE; END IF;
 END;
END $$;

SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';
DO $$
DECLARE v_snapshot jsonb;
BEGIN
 v_snapshot:=public.preview_sku_merge(
   'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002');
 IF (v_snapshot->>'quantity')::integer<>7 OR
   jsonb_array_length(v_snapshot->'warehouses')<>2 OR
   NOT (v_snapshot->>'can_merge')::boolean THEN
   RAISE EXCEPTION 'FAIL: incorrect merge preview';
 END IF;
 BEGIN
  PERFORM public.merge_catalog_sku(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    v_snapshot->>'fingerprint','SKU-OLD',true,'Gộp mã trùng');
  RAISE EXCEPTION 'FAIL: operator merged SKU';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: operator merged SKU' THEN RAISE; END IF;
 END;
END $$;

SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

-- The unprocessed order must block merging, no writes when preview is blocked.
-- Seed fixture as database owner; only application RPCs run as authenticated.
RESET ROLE;
INSERT INTO public.orders(id,receive_status,warehouse_status) VALUES
 ('d0000000-0000-4000-8000-000000000001','RECEIVED','READY_TO_TRANSFER');
INSERT INTO public.order_items(id,order_id,product_name,quantity,product_variant_id) VALUES
 ('e0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'Chưa nhập kho',1,'b0000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
DO $$
BEGIN
 IF (public.preview_sku_merge(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002')->>'can_merge')::boolean THEN
   RAISE EXCEPTION 'FAIL: open order did not block merge';
 END IF;
END $$;
RESET ROLE;
DELETE FROM public.order_items WHERE id='e0000000-0000-4000-8000-000000000001';
DELETE FROM public.orders WHERE id='d0000000-0000-4000-8000-000000000001';

-- Even a pre-receipt mapped order can later become a warehouse receipt.
INSERT INTO public.orders(id,receive_status,warehouse_status) VALUES
 ('d0000000-0000-4000-8000-000000000003','NOT_READY','NOT_READY');
INSERT INTO public.order_items(id,order_id,product_name,quantity,product_variant_id) VALUES
 ('e0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000003',
  'Đã ghép trước nhận hàng',1,'b0000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
DO $$
BEGIN
 IF (public.preview_sku_merge(
   'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002')->>'can_merge')::boolean THEN
   RAISE EXCEPTION 'FAIL: mapped order before receiving did not block merge';
 END IF;
END $$;
RESET ROLE;
DELETE FROM public.order_items WHERE id='e0000000-0000-4000-8000-000000000003';
DELETE FROM public.orders WHERE id='d0000000-0000-4000-8000-000000000003';

-- Completed historical sale may be returned later: block source merge.
INSERT INTO public.sale_items(id,product_variant_id) VALUES
 ('e0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';
DO $$
BEGIN
 IF (public.preview_sku_merge(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002')->>'can_merge')::boolean THEN
   RAISE EXCEPTION 'FAIL: sale history did not block merge';
 END IF;
END $$;
RESET ROLE;
DELETE FROM public.sale_items WHERE id='e0000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}';

-- Wrong confirmed source code and stale preview must be rejected.
DO $$
DECLARE v_snapshot jsonb;
BEGIN
 v_snapshot:=public.preview_sku_merge(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002');
 BEGIN
  PERFORM public.merge_catalog_sku(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    v_snapshot->>'fingerprint','WRONG',true,'Gộp mã trùng');
  RAISE EXCEPTION 'FAIL: incorrect confirmation passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: incorrect confirmation passed' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.merge_catalog_sku(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    md5('old'),'SKU-OLD',true,'Gộp mã trùng');
  RAISE EXCEPTION 'FAIL: stale preview passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: stale preview passed' THEN RAISE; END IF;
 END;
END $$;

SELECT public.merge_catalog_sku(
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  public.preview_sku_merge(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002')->>'fingerprint',
  'SKU-OLD',true,'Gộp hai SKU trùng đơn vị');

DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_balances
   WHERE product_variant_id='b0000000-0000-4000-8000-000000000001'
     AND quantity<>0) THEN
  RAISE EXCEPTION 'FAIL: source still has stock';
 END IF;
 IF (SELECT sum(quantity) FROM public.inventory_balances
   WHERE product_variant_id='b0000000-0000-4000-8000-000000000002')<>9 THEN
  RAISE EXCEPTION 'FAIL: target balance not conserved';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions
  WHERE reference_type='SKU_MERGE')<>4 THEN
  RAISE EXCEPTION 'FAIL: not exactly two balanced pairs per warehouse';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_variants
  WHERE id='b0000000-0000-4000-8000-000000000001'
    AND is_active=false
    AND merged_into_variant_id='b0000000-0000-4000-8000-000000000002') THEN
  RAISE EXCEPTION 'FAIL: source not retired';
 END IF;
 IF (SELECT count(*) FROM public.sku_merge_events)<>1 THEN
  RAISE EXCEPTION 'FAIL: merge event missing or duplicated';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='CATALOG_MERGE_SKU') THEN
  RAISE EXCEPTION 'FAIL: merge audit missing';
 END IF;
 BEGIN
  INSERT INTO public.inventory_transactions(warehouse_id,product_variant_id,tx_type,quantity)
  VALUES('90000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001','IN',1);
  RAISE EXCEPTION 'FAIL: transaction allowed on retired SKU';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: transaction allowed on retired SKU' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.preview_sku_merge(
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'FAIL: retired SKU was accepted again';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: retired SKU was accepted again' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PASS: SKU edit, independent classification, ABC catalog contract, role checks, guarded merge, balanced two-warehouse inventory, audit, retry prevention';
END $$;
