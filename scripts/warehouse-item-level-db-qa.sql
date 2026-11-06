-- PostgreSQL integration QA: run after fixture and migration, NEVER in Prod.
\set ON_ERROR_STOP on
INSERT INTO public.warehouses(id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000001','BG','BG - 320 Nguyễn Công Hãng'),
 ('40000000-0000-4000-8000-000000000002','HN','HN - 164 Hồng Mai');
INSERT INTO public.receive_batches(id,warehouse_id) VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
INSERT INTO public.products(id,sku,name) VALUES
 ('30000000-0000-4000-8000-000000000001','SKU-EXISTING','Sản phẩm bán có sẵn');
INSERT INTO public.product_variants(id,product_id,variant_name,sale_price) VALUES
 ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Mặc định',99000);
INSERT INTO public.orders(id,receive_status,warehouse_status) VALUES
 ('10000000-0000-4000-8000-000000000001','RECEIVED','READY_TO_TRANSFER'),
 ('10000000-0000-4000-8000-000000000002','RECEIVED','READY_TO_TRANSFER'),
 ('10000000-0000-4000-8000-000000000003','RECEIVED','READY_TO_TRANSFER'),
 ('10000000-0000-4000-8000-000000000004','RECEIVED','READY_TO_TRANSFER');
INSERT INTO public.receive_batch_details(order_id,receive_batch_id)
SELECT id,'50000000-0000-4000-8000-000000000001' FROM public.orders;
INSERT INTO public.order_items(id,order_id,product_name,quantity) VALUES
 ('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','Nhập kho',2),
 ('20000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','Bỏ qua kho',1),
 ('20000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000002','Cùng SKU A',2),
 ('20000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000002','Cùng SKU B',3),
 ('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000003','Bỏ qua toàn bộ',1),
 ('20000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000004','Chưa chốt',1);

-- Authenticate using the same app_metadata role model as Production.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"role":"operator"}}';

SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000011',
 '31000000-0000-4000-8000-000000000001',
 null,null,null,155000,1,'IN',null);
DO $$
BEGIN
  BEGIN
    PERFORM public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL: incomplete decision finalized';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL: incomplete decision finalized' THEN RAISE; END IF;
  END;
END $$;

SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000012',
 null,'SKU-NEW-SKIP','Sản phẩm mới','Mặc định',20000,1,'SKIP','Không cần nhập');
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.warehouse_item_decisions
  WHERE order_id='10000000-0000-4000-8000-000000000001';
  IF v_count<>2 THEN RAISE EXCEPTION 'FAIL: drafts not persisted, count=%',v_count; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products p
    JOIN public.product_variants pv ON pv.product_id=p.id
    WHERE p.sku='SKU-NEW-SKIP' AND pv.sale_price=20000) THEN
    RAISE EXCEPTION 'FAIL: SKU/new price not created';
  END IF;
  IF (SELECT sale_price FROM public.warehouse_item_decisions
     WHERE order_item_id='20000000-0000-4000-8000-000000000011')<>155000 THEN
    RAISE EXCEPTION 'FAIL: order item price override not persisted';
  END IF;
  IF (SELECT sale_price FROM public.product_variants
    WHERE id='31000000-0000-4000-8000-000000000001')<>99000 THEN
    RAISE EXCEPTION 'FAIL: shared catalog price overwritten';
  END IF;
END $$;

-- Legacy order-level action must not bypass a per-item SKIP decision.
DO $$
BEGIN
  BEGIN
    UPDATE public.orders SET warehouse_status='WAREHOUSE_RECEIVED'
      WHERE id='10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL: legacy transition succeeded on draft order';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL: legacy transition succeeded on draft order' THEN RAISE; END IF;
  END;
END $$;

SELECT public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  IF (SELECT warehouse_status::text FROM public.orders
     WHERE id='10000000-0000-4000-8000-000000000001')<>'WAREHOUSE_MIXED' THEN
    RAISE EXCEPTION 'FAIL: mixed order status incorrect';
  END IF;
  IF (SELECT count(*) FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'FAIL: mixed receipt should create exactly one stock transaction';
  END IF;
  IF (SELECT sum(quantity) FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000001')<>2 THEN
    RAISE EXCEPTION 'FAIL: skipped product leaked into stock';
  END IF;
  IF (SELECT count(*) FROM public.warehouse_item_decisions
    WHERE order_id='10000000-0000-4000-8000-000000000001'
      AND processing_state='FINALIZED')<>2 THEN
    RAISE EXCEPTION 'FAIL: item-level decisions not finalized';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs
    WHERE entity_id='10000000-0000-4000-8000-000000000001'
      AND action='FINALIZE_ITEM_DECISION')<>2 THEN
    RAISE EXCEPTION 'FAIL: per-item audit rows missing';
  END IF;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL: duplicate receipt was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL: duplicate receipt was accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'FAIL: duplicate stock changed after retry';
  END IF;
END $$;

-- Multiple purchased rows mapping to the SAME SKU must aggregate to a single
-- receipt transaction because the legacy unique reference index is unchanged.
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000021',
 '31000000-0000-4000-8000-000000000001',null,null,null,99000,2,'IN',null);
SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000022',
 '31000000-0000-4000-8000-000000000001',null,null,null,99000,1,'IN',null);
SELECT public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000002');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000002')<>1 THEN
    RAISE EXCEPTION 'FAIL: repeated SKU created multiple receipt transactions';
  END IF;
  IF (SELECT sum(quantity) FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000002')<>7 THEN
    RAISE EXCEPTION 'FAIL: repeated SKU quantity was not aggregated';
  END IF;
END $$;

SELECT public.save_warehouse_item_decision(
 '20000000-0000-4000-8000-000000000031',
 '31000000-0000-4000-8000-000000000001',
 null,null,null,99000,1,'SKIP','Đã chuyển sang xử lý riêng');
SELECT public.finalize_warehouse_item_decisions('10000000-0000-4000-8000-000000000003');
DO $$
BEGIN
 IF (SELECT warehouse_status::text FROM public.orders
    WHERE id='10000000-0000-4000-8000-000000000003')<>'WAREHOUSE_SKIPPED' THEN
   RAISE EXCEPTION 'FAIL: all-SKIP status incorrect';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_transactions
    WHERE reference_id='10000000-0000-4000-8000-000000000003') THEN
   RAISE EXCEPTION 'FAIL: all-SKIP inserted stock';
 END IF;
END $$;

-- Viewer cannot write even by calling RPC directly.
SET request.jwt.claims='{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"role":"viewer"}}';
DO $$
BEGIN
 BEGIN
  PERFORM public.save_warehouse_item_decision(
   '20000000-0000-4000-8000-000000000041',
   '31000000-0000-4000-8000-000000000001',
   null,null,null,99000,1,'IN',null);
  RAISE EXCEPTION 'FAIL: Viewer saved a decision';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FAIL: Viewer saved a decision' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;

-- Verify audit, stored decisions, and stock in an independent session scope.
DO $$
BEGIN
 IF (SELECT count(*) FROM public.inventory_transactions WHERE reference_type='PURCHASE_RECEIPT')<>2 THEN
   RAISE EXCEPTION 'FAIL: unexpected total receipt transaction count';
 END IF;
 IF (SELECT count(*) FROM public.warehouse_item_decisions WHERE processing_state='FINALIZED')<>5 THEN
   RAISE EXCEPTION 'FAIL: finalized count incorrect';
 END IF;
 IF (SELECT count(*) FROM public.orders WHERE warehouse_status='READY_TO_TRANSFER')<>1 THEN
   RAISE EXCEPTION 'FAIL: partial test rollback did not preserve pending order';
 END IF;
 RAISE NOTICE 'PASS: 0075 persistence, mixed, skip, duplicate, aggregation, audit, permissions';
END $$;
