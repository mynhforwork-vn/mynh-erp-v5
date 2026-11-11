-- Disposable PostgreSQL only. Run after fixture, migrations 0075, 0076, 0077,
-- and warehouse-sku-remap-db-qa.sql (which seeds CORRECT-SKU).
\set ON_ERROR_STOP on
RESET ROLE;
INSERT INTO public.orders(id,receive_status,warehouse_status) VALUES
('10000000-0000-4000-8000-000000000003','RECEIVED','READY_TO_TRANSFER'),
('10000000-0000-4000-8000-000000000004','RECEIVED','READY_TO_TRANSFER');
INSERT INTO public.receive_batch_details(order_id,receive_batch_id)
SELECT id,'50000000-0000-4000-8000-000000000001'
FROM public.orders WHERE id IN (
'10000000-0000-4000-8000-000000000003',
'10000000-0000-4000-8000-000000000004');
INSERT INTO public.order_items(id,order_id,product_name,quantity) VALUES
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Phân loại mới của SKU cũ',2),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Trùng phân loại',1);

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';

SELECT public.add_warehouse_variant_and_map(
'20000000-0000-4000-8000-000000000003',
'30000000-0000-4000-8000-000000000002',
'Màu đỏ',145000,2,'IN',NULL);

DO $$
DECLARE v_variant_id uuid;
BEGIN
 SELECT pv.id INTO v_variant_id FROM public.product_variants pv
 WHERE pv.product_id='30000000-0000-4000-8000-000000000002'
 AND pv.variant_name='Màu đỏ' AND pv.sale_price=145000;
 IF v_variant_id IS NULL THEN
   RAISE EXCEPTION 'FAIL: new priced variant missing';
 END IF;
 IF (SELECT count(*) FROM public.products WHERE sku='CORRECT-SKU')<>1 THEN
   RAISE EXCEPTION 'FAIL: creating a classification cloned the parent SKU';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.product_variants
 WHERE id='31000000-0000-4000-8000-000000000002'
 AND product_id='30000000-0000-4000-8000-000000000002'
 AND variant_name='Mặc định' AND sale_price=120000) THEN
   RAISE EXCEPTION 'FAIL: original classification/price was overwritten';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.warehouse_item_decisions d
 JOIN public.order_items oi ON oi.id=d.order_item_id
 WHERE d.order_item_id='20000000-0000-4000-8000-000000000003'
 AND d.product_variant_id=v_variant_id AND oi.product_variant_id=v_variant_id
 AND d.sale_price=145000 AND d.multiplier=2
 AND oi.inventory_multiplier=2 AND d.processing_state='DRAFT') THEN
   RAISE EXCEPTION 'FAIL: new variant mapping not saved atomically';
 END IF;
 IF EXISTS (SELECT 1 FROM public.inventory_transactions
 WHERE reference_id='10000000-0000-4000-8000-000000000003') THEN
   RAISE EXCEPTION 'FAIL: mapping a new classification created stock early';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action='SAVE_ITEM_DECISION'
 AND entity_id='10000000-0000-4000-8000-000000000003') THEN
   RAISE EXCEPTION 'FAIL: audit history missing for added classification';
 END IF;
END $$;

DO $$
BEGIN
 BEGIN
  PERFORM public.add_warehouse_variant_and_map(
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000002',
    ' màu ĐỎ ',149000,1,'IN',NULL);
  RAISE EXCEPTION 'FAIL: case-insensitive duplicate variant was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: case-insensitive duplicate variant was accepted' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.warehouse_item_decisions
 WHERE order_item_id='20000000-0000-4000-8000-000000000004') THEN
   RAISE EXCEPTION 'FAIL: rejected duplicate still saved an item decision';
 END IF;
END $$;

DO $$
BEGIN
 BEGIN
  PERFORM public.add_warehouse_variant_and_map(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'Màu xanh',100000,1,'IN',NULL);
  RAISE EXCEPTION 'FAIL: finalized order created a classification';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: finalized order created a classification' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.product_variants
 WHERE product_id='30000000-0000-4000-8000-000000000002'
 AND variant_name='Màu xanh') THEN
   RAISE EXCEPTION 'FAIL: finalized order left an orphan new variant';
 END IF;
END $$;

SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"viewer"}}';
DO $$
BEGIN
 BEGIN
  PERFORM public.add_warehouse_variant_and_map(
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000002',
    'Màu vàng',151000,1,'IN',NULL);
  RAISE EXCEPTION 'FAIL: viewer created a sale classification';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: viewer created a sale classification' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.product_variants
 WHERE product_id='30000000-0000-4000-8000-000000000002'
 AND variant_name='Màu vàng') THEN
   RAISE EXCEPTION 'FAIL: unauthorized variant inserted';
 END IF;
END $$;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';
SELECT public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000003');

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.inventory_transactions it
 JOIN public.product_variants pv ON pv.id=it.product_variant_id
 WHERE it.reference_id='10000000-0000-4000-8000-000000000003'
 AND it.quantity=4 AND it.tx_type='IN'
 AND pv.product_id='30000000-0000-4000-8000-000000000002'
 AND pv.variant_name='Màu đỏ') THEN
   RAISE EXCEPTION 'FAIL: final stock used wrong SKU classification/quantity';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions
 WHERE reference_id='10000000-0000-4000-8000-000000000003')<>1 THEN
   RAISE EXCEPTION 'FAIL: duplicate stock receipt for classification';
 END IF;
 IF has_function_privilege('anon','public.add_warehouse_variant_and_map(uuid,uuid,text,numeric,integer,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL: anonymous users can call new variant RPC';
 END IF;
 RAISE NOTICE 'PASS: one SKU two classifications two prices, duplicate guard, role, audit, atomic mapping and final stock';
END $$;
