-- 0076: allow an UNMAPPED purchase line to be explicitly skipped (no fabricated SKU).
-- IMPORTANT: code prepared for review; do not apply to Supabase without approval.
-- The existing IN SKU-mapping RPC and stock receipt audit stay unchanged.
BEGIN;

ALTER TABLE public.warehouse_item_decisions
  ALTER COLUMN product_variant_id DROP NOT NULL;

ALTER TABLE public.warehouse_item_decisions
  ADD CONSTRAINT warehouse_item_unmapped_skip_only CHECK (
    product_variant_id IS NOT NULL OR
    (decision='SKIP' AND multiplier=1 AND sale_price=0)
  );

-- Dedicated action never creates a sale product, variant or inventory transaction.
-- It shares the existing order FOR UPDATE lock with other warehouse operations.
CREATE OR REPLACE FUNCTION private.skip_warehouse_item_unmapped_impl(
  p_order_item_id uuid,
  p_skip_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_reason text;
BEGIN
  PERFORM private.assert_operator();
  v_reason:=nullif(btrim(coalesce(p_skip_reason,'')),'');
  IF p_order_item_id IS NULL OR v_reason IS NULL OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'Cần nhập lý do bỏ qua kho (tối đa 500 ký tự)';
  END IF;
  SELECT oi.order_id INTO v_order_id FROM public.order_items oi
    WHERE oi.id=p_order_item_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm mua'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.archived_at IS NOT NULL
    OR v_order.receive_status<>'RECEIVED'
    OR v_order.warehouse_status<>'READY_TO_TRANSFER' THEN
    RAISE EXCEPTION 'Đơn không còn ở trạng thái chờ xử lý kho';
  END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  IF v_item.order_id IS DISTINCT FROM v_order_id THEN
    RAISE EXCEPTION 'Sản phẩm không thuộc đơn đã khóa';
  END IF;
  IF v_item.product_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sản phẩm đã ghép SKU, hãy xử lý quyết định kho trên SKU đó';
  END IF;
  IF v_item.quantity IS NULL OR v_item.quantity<=0 THEN
    RAISE EXCEPTION 'Số lượng sản phẩm không hợp lệ';
  END IF;
  IF EXISTS(SELECT 1 FROM public.warehouse_item_decisions d
            WHERE d.order_item_id=p_order_item_id AND d.processing_state='FINALIZED') THEN
    RAISE EXCEPTION 'Sản phẩm đã chốt kho và không thể sửa';
  END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_transactions it
            WHERE it.reference_type='PURCHASE_RECEIPT' AND it.reference_id=v_order_id) THEN
    RAISE EXCEPTION 'Đơn đã có giao dịch nhập kho';
  END IF;

  INSERT INTO public.warehouse_item_decisions(
    order_item_id,order_id,product_variant_id,decision,sale_price,multiplier,
    skip_reason,processing_state,created_by,updated_by,updated_at
  ) VALUES(
    p_order_item_id,v_order_id,NULL,'SKIP',0,1,v_reason,'DRAFT',v_actor,v_actor,now()
  )
  ON CONFLICT (order_item_id) DO UPDATE SET
    product_variant_id=NULL,decision='SKIP',sale_price=0,multiplier=1,
    skip_reason=excluded.skip_reason,updated_by=excluded.updated_by,updated_at=now()
  WHERE public.warehouse_item_decisions.processing_state='DRAFT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm đã xử lý, hãy tải lại'; END IF;

  INSERT INTO public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  ) VALUES(
    v_actor,'WAREHOUSE','SAVE_ITEM_DECISION','ORDER',v_order_id::text,
    jsonb_build_object('order_item_id',p_order_item_id,'product_variant_id',NULL,
      'decision','SKIP','sale_price',0,'inventory_multiplier',1,
      'skip_reason',v_reason,'status','DRAFT'),'USER'
  );
  RETURN jsonb_build_object('order_item_id',p_order_item_id,'order_id',v_order_id,
    'product_variant_id',NULL,'decision','SKIP','sale_price',0,'multiplier',1,
    'quantity',0,'skip_reason',v_reason,'status','DRAFT');
END;
$function$;

CREATE OR REPLACE FUNCTION public.skip_warehouse_item_without_sku(
  p_order_item_id uuid,
  p_skip_reason text
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.skip_warehouse_item_unmapped_impl(p_order_item_id,p_skip_reason);
$function$;

REVOKE ALL ON FUNCTION public.skip_warehouse_item_without_sku(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.skip_warehouse_item_without_sku(uuid,text)
  TO authenticated;
REVOKE ALL ON FUNCTION private.skip_warehouse_item_unmapped_impl(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.skip_warehouse_item_unmapped_impl(uuid,text)
  TO authenticated;

-- The V2 finalizer must accept a saved SKIP without a sale SKU,
-- while every IN line still requires a valid, matching SKU. Stock writes
-- continue to SELECT only decisions marked IN.
CREATE OR REPLACE FUNCTION private.finalize_warehouse_item_decisions_impl(
  p_order_id uuid, p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_order public.orders%ROWTYPE;
  v_warehouse_id uuid;
  v_receipt_count integer;
  v_items integer;
  v_ready integer;
  v_in integer;
  v_skip integer;
  v_tx integer:=0;
  v_status public.warehouse_order_status;
BEGIN
  PERFORM private.assert_operator();
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Chưa chọn đơn nhập kho'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.archived_at IS NOT NULL
    OR v_order.receive_status<>'RECEIVED'
    OR v_order.warehouse_status<>'READY_TO_TRANSFER' THEN
    RAISE EXCEPTION 'Đơn không còn ở trạng thái chờ xử lý kho';
  END IF;

  SELECT count(*),min(rb.warehouse_id::text)::uuid
  INTO v_receipt_count,v_warehouse_id
  FROM public.receive_batch_details d
  JOIN public.receive_batches rb ON rb.id=d.receive_batch_id
  JOIN public.warehouses w ON w.id=rb.warehouse_id
  WHERE d.order_id=p_order_id AND w.is_active=true AND w.code IN ('BG','HN');
  IF v_receipt_count<>1 OR v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Đơn cần đúng một Kho nhận thực tế BG/HN đã xác nhận';
  END IF;

  SELECT count(*),
    count(*) FILTER (WHERE d.order_item_id IS NOT NULL
      AND d.processing_state='DRAFT'
      AND oi.quantity>0
      AND (
        (d.decision='IN'
         AND d.product_variant_id IS NOT NULL
         AND d.product_variant_id=oi.product_variant_id
         AND d.multiplier=oi.inventory_multiplier
         AND d.sale_price>=0
         AND oi.quantity::bigint*d.multiplier::bigint BETWEEN 1 AND 2147483647)
        OR
        (d.decision='SKIP'
         AND nullif(btrim(d.skip_reason),'') IS NOT NULL
         AND length(btrim(d.skip_reason))<=500
         AND (
           (d.product_variant_id IS NULL AND oi.product_variant_id IS NULL
            AND d.multiplier=1 AND d.sale_price=0)
           OR
           (d.product_variant_id IS NOT NULL
            AND d.product_variant_id=oi.product_variant_id
            AND d.multiplier=oi.inventory_multiplier
            AND d.sale_price>=0
            AND oi.quantity::bigint*d.multiplier::bigint BETWEEN 1 AND 2147483647)
         ))
      )),
    count(*) FILTER (WHERE d.decision='IN'),
    count(*) FILTER (WHERE d.decision='SKIP')
  INTO v_items,v_ready,v_in,v_skip
  FROM public.order_items oi
  LEFT JOIN public.warehouse_item_decisions d ON d.order_item_id=oi.id
  WHERE oi.order_id=p_order_id;
  IF v_items=0 OR v_ready<>v_items OR v_in+v_skip<>v_items THEN
    RAISE EXCEPTION 'Cần xác nhận SKU cho sản phẩm nhập và lý do cho sản phẩm bỏ qua kho';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.inventory_transactions it
    WHERE it.reference_type='PURCHASE_RECEIPT' AND it.reference_id=p_order_id
  ) THEN RAISE EXCEPTION 'Đơn đã phát sinh giao dịch nhập kho, không thể ghi lại'; END IF;

  -- Transaction is atomic. Preserve the existing receipt reference convention
  -- and group repeated SKUs to respect the existing unique inventory index.
  UPDATE public.warehouse_item_decisions
  SET processing_state='FINALIZED',finalized_at=now(),updated_by=v_actor,updated_at=now()
  WHERE order_id=p_order_id AND processing_state='DRAFT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có quyết định kho cần chốt'; END IF;

  IF v_in>0 THEN
    INSERT INTO public.inventory_transactions(
      warehouse_id,product_variant_id,tx_type,quantity,
      reference_type,reference_id,created_by
    )
    SELECT v_warehouse_id,d.product_variant_id,'IN'::public.inventory_tx_type,
      sum(oi.quantity::bigint*d.multiplier::bigint)::integer,
      'PURCHASE_RECEIPT',p_order_id,v_actor
    FROM public.warehouse_item_decisions d
    JOIN public.order_items oi ON oi.id=d.order_item_id
    WHERE d.order_id=p_order_id AND d.decision='IN'
    GROUP BY d.product_variant_id;
    GET DIAGNOSTICS v_tx=ROW_COUNT;
  END IF;

  v_status:=CASE
    WHEN v_in>0 AND v_skip>0 THEN 'WAREHOUSE_MIXED'
    WHEN v_in>0 THEN 'WAREHOUSE_RECEIVED'
    ELSE 'WAREHOUSE_SKIPPED'
  END::public.warehouse_order_status;
  UPDATE public.orders SET warehouse_status=v_status,updated_at=now()
  WHERE id=p_order_id;

  INSERT INTO public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  )
  SELECT v_actor,'WAREHOUSE','FINALIZE_ITEM_DECISION','ORDER',p_order_id::text,
    jsonb_build_object('order_item_id',oi.id,'decision',d.decision,
      'product_variant_id',d.product_variant_id,'multiplier',d.multiplier,
      'sale_price',d.sale_price,'quantity',oi.quantity*d.multiplier,
      'skip_reason',d.skip_reason,'warehouse_id',v_warehouse_id),
    'USER'
  FROM public.warehouse_item_decisions d
  JOIN public.order_items oi ON oi.id=d.order_item_id
  WHERE d.order_id=p_order_id;

  INSERT INTO public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,new_value,source
  ) VALUES(v_actor,'WAREHOUSE','FINALIZE_ORDER_WAREHOUSE','ORDER',p_order_id::text,
    jsonb_build_object('warehouse_status',v_status,'warehouse_id',v_warehouse_id,
      'in_items',v_in,'skip_items',v_skip,'transaction_count',v_tx,
      'note',nullif(btrim(coalesce(p_note,'')),''))
    ,'USER');

  RETURN jsonb_build_object('order_id',p_order_id,'warehouse_status',v_status,
    'warehouse_id',v_warehouse_id,'in_items',v_in,'skip_items',v_skip,
    'transaction_count',v_tx);
END;
$function$;

COMMIT;
