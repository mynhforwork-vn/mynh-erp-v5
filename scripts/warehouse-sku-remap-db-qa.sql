-- Isolated PostgreSQL test, NEVER execute on MYNH ERP Production.
-- Prerequisites: warehouse-item-level-db-fixture.sql, migration 0075 + 0076.
\set ON_ERROR_STOP on

INSERT INTO public.warehouses(id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000001','BG','BG - 320 Nguyễn Công Hãng');
INSERT INTO public.receive_batches(id,warehouse_id) VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
INSERT INTO public.products(id,sku,name) VALUES
 ('30000000-0000-4000-8000-000000000001','WRONG-SKU','SKU bị ghép nhầm'),
 ('30000000-0000-4000-8000-000000000002','CORRECT-SKU','SKU bán cần sửa lại');
INSERT INTO public.product_variants(id,product_id,variant_name,sale_price) VALUES
 ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Mặc định',99000),
 ('31000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Mặc định',120000);
INSERT INTO public.orders(id,receive_status,warehouse_status) VALUES
 ('10000000-0000-4000-8000-000000000001','RECEIVED','READY_TO_TRANSFER'),
 ('10000000-0000-4000-8000-000000000002','RECEIVED','READY_TO_TRANSFER');
INSERT INTO public.receive_batch_details(order_id,receive_batch_id)
SELECT id,'50000000-0000-4000-8000-000000000001' FROM public.orders;
INSERT INTO public.order_items(id,order_id,product_name,quantity) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Dòng mua ghép sai',2),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Dòng mua bỏ qua nhầm',1);

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';

-- (1) Mapping the wrong sale SKU saves only a draft.
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000001',null,null,null,99000,1,'IN',null);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_transactions) THEN
   RAISE EXCEPTION 'FAIL: saving an initial SKU draft created stock';
 END IF;
END $$;

-- (2) Correcting mapping rewrites BOTH order_items and the same DRAFT,
-- and records audit history. No new order item or inventory transaction.
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000002',null,null,null,120000,3,'IN',null);
DO $$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM public.order_items oi JOIN public.warehouse_item_decisions d ON d.order_item_id=oi.id
   WHERE oi.id='20000000-0000-4000-8000-000000000001'
     AND oi.product_variant_id='31000000-0000-4000-8000-000000000002'
     AND oi.inventory_multiplier=3
     AND d.product_variant_id=oi.product_variant_id
     AND d.sale_price=120000 AND d.multiplier=3
     AND d.decision='IN' AND d.processing_state='DRAFT'
 ) THEN RAISE EXCEPTION 'FAIL: corrected SKU draft not persisted consistently'; END IF;
 IF (SELECT count(*) FROM public.warehouse_item_decisions WHERE order_item_id='20000000-0000-4000-8000-000000000001')<>1 THEN
   RAISE EXCEPTION 'FAIL: remapping produced duplicate draft records';
 END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action='SAVE_ITEM_DECISION'
     AND entity_id='10000000-0000-4000-8000-000000000001')<>2 THEN
   RAISE EXCEPTION 'FAIL: wrong and corrected mapping not separately audited';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_transactions) THEN
   RAISE EXCEPTION 'FAIL: correcting a SKU draft generated stock';
 END IF;
END $$;

-- (3) A saved SKIP can also be revised back to IN before finalization.
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000002',null,null,null,120000,3,'SKIP','Chờ kiểm tra');
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000002',null,null,null,120000,3,'IN',null);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.warehouse_item_decisions
   WHERE order_item_id='20000000-0000-4000-8000-000000000001'
   AND (decision<>'IN' OR skip_reason IS NOT NULL)) THEN
   RAISE EXCEPTION 'FAIL: changed warehouse choice was not persisted';
 END IF;
END $$;

-- (4) A no-SKU SKIP may be corrected to a normal mapped IN.
SELECT public.skip_warehouse_item_without_sku(
 '20000000-0000-4000-8000-000000000002','Không quản lý tồn kho lúc đầu');
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000002',
 '31000000-0000-4000-8000-000000000002',null,null,null,120000,1,'IN',null);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.order_items oi
   JOIN public.warehouse_item_decisions d ON d.order_item_id=oi.id
   WHERE oi.id='20000000-0000-4000-8000-000000000002'
   AND oi.product_variant_id='31000000-0000-4000-8000-000000000002'
   AND d.product_variant_id=oi.product_variant_id AND d.decision='IN'
   AND d.skip_reason IS NULL AND d.processing_state='DRAFT') THEN
   RAISE EXCEPTION 'FAIL: unmapped SKIP could not be corrected to IN';
 END IF;
END $$;

-- (5) Viewer role must not remap a saved DRAFT.
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"viewer"}}';
DO $$
BEGIN
 BEGIN
  PERFORM public.save_warehouse_item_decision(
   '20000000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',null,null,null,99000,1,'IN',null);
  RAISE EXCEPTION 'FAIL: viewer corrected a saved SKU';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: viewer corrected a saved SKU' THEN RAISE; END IF;
 END;
END $$;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';

-- (6) Finalize only the CORRECT SKU. A second edit after finalization must
-- be rejected, and exactly one correct inventory transaction must remain.
SELECT public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000001');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.inventory_transactions
   WHERE reference_type='PURCHASE_RECEIPT'
    AND reference_id='10000000-0000-4000-8000-000000000001'
    AND product_variant_id='31000000-0000-4000-8000-000000000002'
    AND quantity=6) THEN
   RAISE EXCEPTION 'FAIL: final receipt did not use corrected SKU x3';
 END IF;
 IF (SELECT count(*) FROM public.inventory_transactions
   WHERE reference_id='10000000-0000-4000-8000-000000000001')<>1 THEN
   RAISE EXCEPTION 'FAIL: finalized remap created duplicate stock';
 END IF;
 BEGIN
  PERFORM public.save_warehouse_item_decision(
   '20000000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',null,null,null,99000,1,'IN',null);
  RAISE EXCEPTION 'FAIL: editing a finalized item succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: editing a finalized item succeeded' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.inventory_transactions
   WHERE reference_id='10000000-0000-4000-8000-000000000001')<>1 THEN
   RAISE EXCEPTION 'FAIL: blocked edit changed the stock transaction count';
 END IF;
 RAISE NOTICE 'PASS: draft SKU remapping, persistence, audit, SKIP correction, permission, finalized lock, no duplicate inventory';
END $$;
