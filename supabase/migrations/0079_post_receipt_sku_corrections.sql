-- 0079: Correct a SKU mapping after warehouse receipt without rewriting receipt
-- ledger entries. Proposed schema; run in disposable DB before any Production migration.
-- Depends on migration 0078: active SKU guards and admin identity helpers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.warehouse_sku_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  previous_variant_id uuid NULL REFERENCES public.product_variants(id),
  target_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  previous_decision text NOT NULL CHECK (previous_decision IN ('IN','SKIP')),
  previous_multiplier integer NOT NULL CHECK (previous_multiplier > 0),
  target_multiplier integer NOT NULL CHECK (target_multiplier > 0),
  quantity_removed integer NOT NULL CHECK (quantity_removed >= 0),
  quantity_added integer NOT NULL CHECK (quantity_added > 0),
  previous_snapshot jsonb NOT NULL,
  updated_snapshot jsonb NOT NULL,
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouse_sku_corrections_order_item_idx
  ON public.warehouse_sku_corrections(order_item_id,created_at DESC);
ALTER TABLE public.warehouse_sku_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_sku_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.warehouse_sku_corrections TO authenticated;
DROP POLICY IF EXISTS warehouse_sku_corrections_read ON public.warehouse_sku_corrections;
CREATE POLICY warehouse_sku_corrections_read ON public.warehouse_sku_corrections
  FOR SELECT TO authenticated
  USING ((select public.current_erp_role()) IN ('admin','operator'));

-- Snapshot is VOLATILE. The confirm RPC locks order, finalized line and both
-- SKU rows BEFORE recomputing this snapshot to reject stale inventory data.
CREATE OR REPLACE FUNCTION private.received_sku_correction_snapshot(
  p_order_item_id uuid,p_target_variant_id uuid,p_multiplier integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_order record;
  v_item record;
  v_decision record;
  v_warehouse_id uuid;
  v_receipt_count integer;
  v_target record;
  v_source record;
  v_old_qty bigint:=0;
  v_new_qty bigint:=0;
  v_balance bigint:=0;
  v_sales bigint:=0;
  v_transfers bigint:=0;
  v_receipt_exists boolean:=false;
  v_payload jsonb;
  v_can_correct boolean:=false;
BEGIN
  PERFORM private.assert_admin();
  IF p_order_item_id IS NULL OR p_target_variant_id IS NULL
     OR p_multiplier IS NULL OR p_multiplier NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Thiếu sản phẩm, SKU đích hoặc hệ số quy đổi hợp lệ';
  END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id=p_order_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm trong đơn'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=v_item.order_id;
  IF NOT FOUND OR v_order.archived_at IS NOT NULL
    OR v_order.receive_status::text <> 'RECEIVED'
    OR v_order.warehouse_status::text NOT IN
      ('WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED','WAREHOUSE_MIXED') THEN
    RAISE EXCEPTION 'Chỉ điều chỉnh đơn đã chốt xử lý kho và chưa lưu trữ';
  END IF;
  SELECT * INTO v_decision FROM public.warehouse_item_decisions
    WHERE order_item_id=p_order_item_id AND order_id=v_order.id
      AND processing_state='FINALIZED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Đơn nhập kho lịch sử chưa có quyết định từng sản phẩm; cần đối soát riêng';
  END IF;
  IF (SELECT count(*) FROM public.order_items WHERE order_id=v_order.id)<>
     (SELECT count(*) FROM public.warehouse_item_decisions
      WHERE order_id=v_order.id AND processing_state='FINALIZED') THEN
    RAISE EXCEPTION 'Đơn còn dòng không có quyết định kho đã chốt; cần đối soát riêng';
  END IF;
  SELECT count(*),min(rb.warehouse_id::text)::uuid
    INTO v_receipt_count,v_warehouse_id
    FROM public.receive_batch_details d
    JOIN public.receive_batches rb ON rb.id=d.receive_batch_id
    JOIN public.warehouses w ON w.id=rb.warehouse_id
    WHERE d.order_id=v_order.id AND w.code IN ('BG','HN');
  IF v_receipt_count<>1 OR v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Không xác định duy nhất kho nhận thực tế đã xác nhận';
  END IF;
  SELECT pv.id,pv.is_active,pv.sale_price,p.sku,p.name,pv.variant_name
    INTO v_target FROM public.product_variants pv
    JOIN public.products p ON p.id=pv.product_id
    WHERE pv.id=p_target_variant_id;
  IF NOT FOUND OR NOT v_target.is_active OR v_target.sale_price IS NULL
    OR v_target.sale_price<0 OR v_target.sale_price>999999999
    OR v_target.sale_price<>round(v_target.sale_price,2) THEN
    RAISE EXCEPTION 'SKU đích không hoạt động hoặc chưa có giá bán hợp lệ';
  END IF;
  IF v_decision.decision='IN' THEN
    IF v_decision.product_variant_id IS NULL
      OR v_item.product_variant_id IS DISTINCT FROM v_decision.product_variant_id THEN
      RAISE EXCEPTION 'Liên kết SKU cũ không nhất quán; cần đối soát riêng';
    END IF;
    SELECT pv.id,pv.is_active,p.sku,pv.variant_name
      INTO v_source FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id
      WHERE pv.id=v_decision.product_variant_id;
    IF NOT FOUND OR NOT v_source.is_active THEN
      RAISE EXCEPTION 'SKU đã gộp hoặc ngừng sử dụng; cần đối soát trước khi sửa';
    END IF;
    v_old_qty:=v_item.quantity::bigint*v_decision.multiplier::bigint;
    SELECT coalesce(sum(quantity),0)::bigint INTO v_balance
      FROM public.inventory_balances
      WHERE warehouse_id=v_warehouse_id AND
        product_variant_id=v_decision.product_variant_id;
    -- Historical sale/return/transfer references must remain immutable.
    SELECT count(*) INTO v_sales FROM public.sale_items
      WHERE product_variant_id=v_decision.product_variant_id;
    IF v_sales=0 THEN
      SELECT count(*) INTO v_sales FROM public.sale_return_items
        WHERE product_variant_id=v_decision.product_variant_id;
    END IF;
    SELECT count(*) INTO v_transfers FROM public.transfer_items
      WHERE product_variant_id=v_decision.product_variant_id;
    SELECT EXISTS(
      SELECT 1 FROM public.inventory_transactions it
      WHERE it.reference_type='PURCHASE_RECEIPT'
        AND it.reference_id=v_order.id
        AND it.warehouse_id=v_warehouse_id
        AND it.product_variant_id=v_decision.product_variant_id
        AND it.tx_type='IN'
    ) INTO v_receipt_exists;
  ELSE
    IF v_decision.decision<>'SKIP' THEN
      RAISE EXCEPTION 'Quyết định SKU cũ không hợp lệ';
    END IF;
    v_receipt_exists:=true; -- SKIP did not generate a stock receipt.
  END IF;
  v_new_qty:=v_item.quantity::bigint*p_multiplier::bigint;
  IF v_item.quantity<=0 OR v_new_qty NOT BETWEEN 1 AND 2147483647
    OR v_old_qty > 2147483647 THEN
    RAISE EXCEPTION 'Số lượng quy đổi ngoài giới hạn tồn kho';
  END IF;
  v_can_correct:=v_receipt_exists AND v_sales=0 AND v_transfers=0
    AND v_balance>=v_old_qty;
  v_payload:=jsonb_build_object(
    'order_id',v_order.id,'order_item_id',v_item.id,
    'order_status',v_order.warehouse_status,'warehouse_id',v_warehouse_id,
    'old_decision',v_decision.decision,
    'old_variant_id',v_decision.product_variant_id,
    'old_multiplier',v_decision.multiplier,
    'old_sale_price',v_decision.sale_price,
    'old_quantity',v_old_qty,'source_balance',v_balance,
    'new_variant_id',v_target.id,'new_sku',v_target.sku,
    'new_product_name',v_target.name,'new_variant_name',v_target.variant_name,
    'new_sale_price',v_target.sale_price,'new_multiplier',p_multiplier,
    'new_quantity',v_new_qty,'sale_history',v_sales,
    'transfer_history',v_transfers,'receipt_found',v_receipt_exists
  );
  RETURN v_payload||jsonb_build_object(
    'fingerprint',md5(v_payload::text),'can_correct',v_can_correct);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.confirm_received_sku_correction_impl(
  p_order_item_id uuid,p_target_variant_id uuid,p_multiplier integer,
  p_fingerprint text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_order_id uuid;
  v_source_id uuid;
  v_variant_id uuid;
  v_data jsonb;
  v_id uuid:=gen_random_uuid();
  v_old_quantity integer;
  v_new_quantity integer;
  v_warehouse_id uuid;
  v_in bigint;
  v_skip bigint;
  v_new_status public.warehouse_order_status;
BEGIN
  PERFORM private.assert_admin();
  IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Nhập lý do điều chỉnh SKU từ 8 đến 500 ký tự';
  END IF;
  IF coalesce(p_fingerprint,'') !~ '^[a-fA-F0-9]{32}$' THEN
    RAISE EXCEPTION 'Dữ liệu xem trước không hợp lệ';
  END IF;
  SELECT oi.order_id INTO v_order_id FROM public.order_items oi
    WHERE oi.id=p_order_item_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy sản phẩm trong đơn';
  END IF;
  PERFORM 1 FROM public.orders WHERE id=v_order_id FOR UPDATE;
  PERFORM 1 FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  PERFORM 1 FROM public.warehouse_item_decisions
    WHERE order_item_id=p_order_item_id FOR UPDATE;
  SELECT product_variant_id INTO v_source_id FROM public.warehouse_item_decisions
    WHERE order_item_id=p_order_item_id AND decision='IN';
  -- Lock in a deterministic order; concurrent posting and SKU merges wait.
  FOR v_variant_id IN SELECT id FROM public.product_variants
    WHERE id IN (v_source_id,p_target_variant_id) ORDER BY id LOOP
    PERFORM 1 FROM public.product_variants WHERE id=v_variant_id FOR UPDATE;
  END LOOP;
  v_data:=private.received_sku_correction_snapshot(
    p_order_item_id,p_target_variant_id,p_multiplier);
  IF v_data->>'fingerprint'<>p_fingerprint THEN
    RAISE EXCEPTION 'Tồn kho hoặc SKU đã thay đổi. Hãy xem trước và xác nhận lại';
  END IF;
  IF NOT (v_data->>'can_correct')::boolean THEN
    RAISE EXCEPTION 'SKU có lịch sử bán, chuyển kho hoặc không còn đủ tồn; cần đối soát riêng';
  END IF;
  v_old_quantity:=(v_data->>'old_quantity')::integer;
  v_new_quantity:=(v_data->>'new_quantity')::integer;
  v_warehouse_id:=(v_data->>'warehouse_id')::uuid;

  -- One durable audit record per confirmed correction, and append-only delta
  -- ledger rows. Never rewrite the original purchase receipt or sale history.
  INSERT INTO public.warehouse_sku_corrections(
    id,order_id,order_item_id,warehouse_id,previous_variant_id,
    target_variant_id,previous_decision,previous_multiplier,target_multiplier,
    quantity_removed,quantity_added,previous_snapshot,updated_snapshot,note,created_by
  ) VALUES(
    v_id,v_order_id,p_order_item_id,v_warehouse_id,
    (v_data->>'old_variant_id')::uuid,p_target_variant_id,
    v_data->>'old_decision',(v_data->>'old_multiplier')::integer,
    p_multiplier,v_old_quantity,v_new_quantity,
    v_data,jsonb_build_object('sku',v_data->>'new_sku',
      'variant_name',v_data->>'new_variant_name',
      'sale_price',v_data->'new_sale_price'),
    btrim(p_note),auth.uid()
  );
  IF v_old_quantity>0 THEN
    INSERT INTO public.inventory_transactions(
      warehouse_id,product_variant_id,tx_type,quantity,
      reference_type,reference_id,created_by
    ) VALUES(
      v_warehouse_id,(v_data->>'old_variant_id')::uuid,
      'ADJUSTMENT_OUT',v_old_quantity,'WAREHOUSE_SKU_CORRECTION',v_id,auth.uid()
    );
  END IF;
  INSERT INTO public.inventory_transactions(
    warehouse_id,product_variant_id,tx_type,quantity,
    reference_type,reference_id,created_by
  ) VALUES(
    v_warehouse_id,p_target_variant_id,
    'ADJUSTMENT_IN',v_new_quantity,'WAREHOUSE_SKU_CORRECTION',v_id,auth.uid()
  );
  UPDATE public.order_items SET product_variant_id=p_target_variant_id,
    inventory_multiplier=p_multiplier WHERE id=p_order_item_id;
  UPDATE public.warehouse_item_decisions
    SET product_variant_id=p_target_variant_id,
      multiplier=p_multiplier,decision='IN',skip_reason=NULL,
      sale_price=(v_data->>'new_sale_price')::numeric,
      updated_by=auth.uid(),updated_at=now()
    WHERE order_item_id=p_order_item_id AND processing_state='FINALIZED';

  SELECT count(*) FILTER (WHERE decision='IN'),count(*) FILTER (WHERE decision='SKIP')
    INTO v_in,v_skip FROM public.warehouse_item_decisions WHERE order_id=v_order_id;
  v_new_status:=CASE WHEN v_in>0 AND v_skip>0 THEN 'WAREHOUSE_MIXED'
    WHEN v_in>0 THEN 'WAREHOUSE_RECEIVED' ELSE 'WAREHOUSE_SKIPPED'
  END::public.warehouse_order_status;
  UPDATE public.orders SET warehouse_status=v_new_status,updated_at=now()
    WHERE id=v_order_id;

  INSERT INTO public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
  ) VALUES(auth.uid(),'WAREHOUSE','CORRECT_RECEIVED_SKU','ORDER_ITEM',
    p_order_item_id::text,v_data,
    jsonb_build_object('correction_id',v_id,'target_variant_id',p_target_variant_id,
      'new_multiplier',p_multiplier,'quantity_added',v_new_quantity,
      'quantity_removed',v_old_quantity,'warehouse_id',v_warehouse_id,
      'order_status',v_new_status,'reason',btrim(p_note)),'USER');

  RETURN jsonb_build_object('id',v_id,'order_item_id',p_order_item_id,
    'old_quantity',v_old_quantity,'new_quantity',v_new_quantity,
    'warehouse_id',v_warehouse_id,'warehouse_status',v_new_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_received_sku_correction(
  p_order_item_id uuid,p_target_variant_id uuid,p_multiplier integer
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$
  SELECT private.received_sku_correction_snapshot(
    p_order_item_id,p_target_variant_id,p_multiplier);
$fn$;
CREATE OR REPLACE FUNCTION public.confirm_received_sku_correction(
  p_order_item_id uuid,p_target_variant_id uuid,p_multiplier integer,
  p_fingerprint text,p_note text
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$
  SELECT private.confirm_received_sku_correction_impl(
    p_order_item_id,p_target_variant_id,p_multiplier,p_fingerprint,p_note);
$fn$;

REVOKE ALL ON FUNCTION private.received_sku_correction_snapshot(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.confirm_received_sku_correction_impl(uuid,uuid,integer,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preview_received_sku_correction(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.confirm_received_sku_correction(uuid,uuid,integer,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.received_sku_correction_snapshot(uuid,uuid,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.confirm_received_sku_correction_impl(uuid,uuid,integer,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_received_sku_correction(uuid,uuid,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_received_sku_correction(uuid,uuid,integer,text,text)
  TO authenticated;

COMMIT;
