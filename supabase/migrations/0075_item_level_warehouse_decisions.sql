-- 0075 — Item-level warehouse decisions, atomic mixed stock processing.
-- Additive migration only. Existing order-level receipt RPC remains available
-- for orders without item-level drafts. Apply only after isolated DB QA.
BEGIN;

ALTER TYPE public.warehouse_order_status ADD VALUE IF NOT EXISTS 'WAREHOUSE_MIXED';

CREATE TABLE IF NOT EXISTS public.warehouse_item_decisions (
  order_item_id uuid PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  decision text NOT NULL CHECK (decision IN ('IN','SKIP')),
  sale_price numeric(18,2) NOT NULL CHECK (sale_price >= 0),
  multiplier integer NOT NULL CHECK (multiplier > 0),
  skip_reason text,
  processing_state text NOT NULL DEFAULT 'DRAFT' CHECK (processing_state IN ('DRAFT','FINALIZED')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT warehouse_item_skip_reason_check CHECK (
    (decision = 'IN' AND skip_reason IS NULL) OR
    (decision = 'SKIP' AND length(btrim(coalesce(skip_reason,''))) BETWEEN 1 AND 500)
  )
);
CREATE INDEX IF NOT EXISTS warehouse_item_decisions_order_idx
  ON public.warehouse_item_decisions(order_id);
ALTER TABLE public.warehouse_item_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_item_decisions_read ON public.warehouse_item_decisions;
CREATE POLICY warehouse_item_decisions_read ON public.warehouse_item_decisions
  FOR SELECT TO authenticated
  USING ((SELECT public.current_erp_role()) IN ('admin','operator','viewer'));
REVOKE ALL ON TABLE public.warehouse_item_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.warehouse_item_decisions TO authenticated;

CREATE OR REPLACE FUNCTION private.save_warehouse_item_decision_impl(
  p_order_item_id uuid,
  p_variant_id uuid,
  p_new_sku text,
  p_new_name text,
  p_new_variant text,
  p_sale_price numeric,
  p_multiplier integer,
  p_decision text,
  p_skip_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_variant_id uuid;
  v_product_id uuid;
  v_sku text;
  v_reason text;
  v_old jsonb;
  v_quantity bigint;
BEGIN
  PERFORM private.assert_operator();

  IF p_order_item_id IS NULL OR p_sale_price IS NULL
     OR p_sale_price < 0 OR p_sale_price > 999999999
     OR p_multiplier IS NULL OR p_multiplier < 1 OR p_multiplier > 100000
     OR p_decision IS NULL OR p_decision NOT IN ('IN','SKIP') THEN
    RAISE EXCEPTION 'Thông tin SKU, giá, hệ số hoặc quyết định kho không hợp lệ';
  END IF;
  IF p_sale_price <> round(p_sale_price,2) THEN
    RAISE EXCEPTION 'Giá bán chỉ được có tối đa 2 chữ số thập phân';
  END IF;
  v_reason := nullif(btrim(coalesce(p_skip_reason,'')),'');
  IF p_decision='SKIP' AND (v_reason IS NULL OR length(v_reason)>500) THEN
    RAISE EXCEPTION 'Cần nhập lý do bỏ qua kho (tối đa 500 ký tự)';
  END IF;
  IF p_decision='IN' THEN v_reason:=NULL; END IF;

  -- The order is the serialization lock shared by map/finalize/legacy flows.
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
  IF EXISTS (
    SELECT 1 FROM public.warehouse_item_decisions d
    WHERE d.order_item_id=p_order_item_id AND d.processing_state='FINALIZED'
  ) THEN RAISE EXCEPTION 'Sản phẩm đã chốt kho và không thể sửa'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_transactions it
    WHERE it.reference_type='PURCHASE_RECEIPT' AND it.reference_id=v_order_id
  ) THEN RAISE EXCEPTION 'Đơn đã có giao dịch nhập kho'; END IF;

  v_quantity:=v_item.quantity::bigint * p_multiplier::bigint;
  IF v_quantity<1 OR v_quantity>2147483647 THEN
    RAISE EXCEPTION 'Số lượng quy đổi vượt giới hạn tồn kho';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    IF nullif(btrim(coalesce(p_new_sku,'')),'') IS NOT NULL THEN
      RAISE EXCEPTION 'Không thể vừa chọn SKU có sẵn vừa tạo SKU mới';
    END IF;
    SELECT pv.id INTO v_variant_id
    FROM public.product_variants pv WHERE pv.id=p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SKU bán đã chọn không tồn tại'; END IF;
  ELSE
    v_sku:=upper(btrim(coalesce(p_new_sku,'')));
    IF length(v_sku)<1 OR length(v_sku)>100
       OR length(btrim(coalesce(p_new_name,'')))<1
       OR length(btrim(p_new_name))>255
       OR length(btrim(coalesce(p_new_variant,'')))<1
       OR length(btrim(p_new_variant))>255 THEN
      RAISE EXCEPTION 'Thiếu hoặc sai mã SKU, tên và phân loại sản phẩm mới';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products WHERE upper(sku)=v_sku) THEN
      RAISE EXCEPTION 'Mã SKU đã tồn tại. Hãy chọn SKU có sẵn';
    END IF;
    INSERT INTO public.products(sku,name,note)
    VALUES(v_sku,btrim(p_new_name),'Tạo từ bóc tách nhập kho')
    RETURNING id INTO v_product_id;
    INSERT INTO public.product_variants(product_id,variant_name,sale_price)
    VALUES(v_product_id,btrim(p_new_variant),p_sale_price)
    RETURNING id INTO v_variant_id;
  END IF;

  v_old:=jsonb_build_object(
    'product_variant_id',v_item.product_variant_id,
    'inventory_multiplier',v_item.inventory_multiplier
  );
  UPDATE public.order_items
  SET product_variant_id=v_variant_id, inventory_multiplier=p_multiplier
  WHERE id=p_order_item_id;

  INSERT INTO public.warehouse_item_decisions(
    order_item_id,order_id,product_variant_id,decision,sale_price,multiplier,
    skip_reason,processing_state,created_by,updated_by,updated_at
  )
  VALUES(
    p_order_item_id,v_order_id,v_variant_id,p_decision,p_sale_price,p_multiplier,
    v_reason,'DRAFT',v_actor,v_actor,now()
  )
  ON CONFLICT(order_item_id) DO UPDATE SET
    product_variant_id=excluded.product_variant_id,
    decision=excluded.decision,sale_price=excluded.sale_price,
    multiplier=excluded.multiplier,skip_reason=excluded.skip_reason,
    updated_by=excluded.updated_by,updated_at=now()
  WHERE warehouse_item_decisions.processing_state='DRAFT';

  IF NOT FOUND THEN RAISE EXCEPTION 'Sản phẩm đã xử lý, hãy tải lại'; END IF;

  INSERT INTO public.audit_logs(
    actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source
  ) VALUES (
    v_actor,'WAREHOUSE','SAVE_ITEM_DECISION','ORDER',v_order_id::text,
    v_old,
    jsonb_build_object('order_item_id',p_order_item_id,'product_variant_id',v_variant_id,
      'sale_price',p_sale_price,'inventory_multiplier',p_multiplier,
      'decision',p_decision,'skip_reason',v_reason,'status','DRAFT'),
    'USER'
  );

  RETURN jsonb_build_object('order_item_id',p_order_item_id,'order_id',v_order_id,
    'product_variant_id',v_variant_id,'decision',p_decision,
    'sale_price',p_sale_price,'multiplier',p_multiplier,'quantity',v_quantity,
    'skip_reason',v_reason,'status','DRAFT');
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_warehouse_item_decision(
  p_order_item_id uuid, p_variant_id uuid, p_new_sku text,
  p_new_name text, p_new_variant text, p_sale_price numeric,
  p_multiplier integer, p_decision text, p_skip_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.save_warehouse_item_decision_impl(
    p_order_item_id,p_variant_id,p_new_sku,p_new_name,p_new_variant,
    p_sale_price,p_multiplier,p_decision,p_skip_reason
  );
$function$;
REVOKE ALL ON FUNCTION public.save_warehouse_item_decision(
  uuid,uuid,text,text,text,numeric,integer,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_warehouse_item_decision(
  uuid,uuid,text,text,text,numeric,integer,text,text
) TO authenticated;
REVOKE ALL ON FUNCTION private.save_warehouse_item_decision_impl(
  uuid,uuid,text,text,text,numeric,integer,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.save_warehouse_item_decision_impl(
  uuid,uuid,text,text,text,numeric,integer,text,text
) TO authenticated;

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
      AND d.product_variant_id=oi.product_variant_id
      AND d.multiplier=oi.inventory_multiplier
      AND d.sale_price>=0
      AND (d.decision='IN' OR nullif(btrim(d.skip_reason),'') IS NOT NULL)
      AND oi.quantity>0
      AND oi.quantity::bigint*d.multiplier::bigint BETWEEN 1 AND 2147483647),
    count(*) FILTER (WHERE d.decision='IN'),
    count(*) FILTER (WHERE d.decision='SKIP')
  INTO v_items,v_ready,v_in,v_skip
  FROM public.order_items oi
  LEFT JOIN public.warehouse_item_decisions d ON d.order_item_id=oi.id
  WHERE oi.order_id=p_order_id;
  IF v_items=0 OR v_ready<>v_items OR v_in+v_skip<>v_items THEN
    RAISE EXCEPTION 'Cần lưu đầy đủ SKU, giá và quyết định kho cho từng sản phẩm';
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

CREATE OR REPLACE FUNCTION public.finalize_warehouse_item_decisions(
  p_order_id uuid,p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.finalize_warehouse_item_decisions_impl(p_order_id,p_note);
$function$;
REVOKE ALL ON FUNCTION public.finalize_warehouse_item_decisions(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_warehouse_item_decisions(uuid,text)
  TO authenticated;
REVOKE ALL ON FUNCTION private.finalize_warehouse_item_decisions_impl(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_warehouse_item_decisions_impl(uuid,text)
  TO authenticated;

-- Legacy actions remain available for orders WITHOUT item-level decisions.
-- If any V2 drafts exist, reject a legacy order-level receive/skip transition
-- (the transaction rolls back its earlier stock INSERTs on the error).
CREATE OR REPLACE FUNCTION private.guard_warehouse_item_legacy_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.warehouse_status='READY_TO_TRANSFER'
     AND NEW.warehouse_status IN ('WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED')
     AND EXISTS(SELECT 1 FROM public.warehouse_item_decisions d
       WHERE d.order_id=NEW.id AND d.processing_state='DRAFT')
  THEN
    RAISE EXCEPTION 'Đơn có quyết định kho theo sản phẩm, hãy chốt trong slidebar Bóc tách';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_warehouse_item_legacy_transition ON public.orders;
CREATE TRIGGER guard_warehouse_item_legacy_transition
BEFORE UPDATE OF warehouse_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.guard_warehouse_item_legacy_transition();

COMMIT;
