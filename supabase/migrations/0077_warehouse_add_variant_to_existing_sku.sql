-- 0077: add a new sale variant to an EXISTING SKU while saving a warehouse
-- item decision. Product SKU remains unique, variant price is per variant.
-- Transactional: if the mapping fails, variant insert is rolled back.
-- Additive; do not change existing warehouse save/finalize RPC signatures.
BEGIN;

CREATE OR REPLACE FUNCTION private.add_warehouse_variant_and_map_impl(
  p_order_item_id uuid,
  p_product_id uuid,
  p_variant_name text,
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
  v_order_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_name text := btrim(coalesce(p_variant_name,''));
BEGIN
  PERFORM private.assert_operator();

  IF p_order_item_id IS NULL OR p_product_id IS NULL
    OR length(v_name)<1 OR length(v_name)>255 THEN
    RAISE EXCEPTION 'Thiếu sản phẩm hoặc phân loại SKU hợp lệ';
  END IF;
  -- Lock order first, matching the normal map/finalize serialization order.
  SELECT oi.order_id INTO v_order_id
  FROM public.order_items oi WHERE oi.id=p_order_item_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy sản phẩm mua';
  END IF;
  PERFORM 1 FROM public.orders WHERE id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn hàng';
  END IF;

  -- Serialize simultaneous additions to the same SKU. Prevent whitespace
  -- and case-only duplicate variant names, not only exact unique matches.
  SELECT p.id INTO v_product_id
  FROM public.products p WHERE p.id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU bán đã chọn không tồn tại';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_variants pv
    WHERE pv.product_id=v_product_id
      AND lower(btrim(pv.variant_name))=lower(v_name)
  ) THEN
    RAISE EXCEPTION 'Phân loại SKU đã tồn tại. Hãy chọn phân loại có sẵn';
  END IF;

  INSERT INTO public.product_variants(product_id,variant_name,sale_price)
  VALUES(v_product_id,v_name,p_sale_price)
  RETURNING id INTO v_variant_id;

  -- Existing core RPC checks RECEIVED/READY, archived state, FINALIZED,
  -- duplicate receipts, role, price, multiplier, SKU existence, quantity.
  -- Exception rolls back new variant AND every item decision atomically.
  RETURN private.save_warehouse_item_decision_impl(
    p_order_item_id,v_variant_id,NULL,NULL,NULL,
    p_sale_price,p_multiplier,p_decision,p_skip_reason
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_warehouse_variant_and_map(
  p_order_item_id uuid,
  p_product_id uuid,
  p_variant_name text,
  p_sale_price numeric,
  p_multiplier integer,
  p_decision text,
  p_skip_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.add_warehouse_variant_and_map_impl(
    p_order_item_id,p_product_id,p_variant_name,p_sale_price,
    p_multiplier,p_decision,p_skip_reason
  );
$function$;

REVOKE ALL ON FUNCTION public.add_warehouse_variant_and_map(
 uuid,uuid,text,numeric,integer,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_warehouse_variant_and_map(
 uuid,uuid,text,numeric,integer,text,text
) TO authenticated;
REVOKE ALL ON FUNCTION private.add_warehouse_variant_and_map_impl(
 uuid,uuid,text,numeric,integer,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.add_warehouse_variant_and_map_impl(
 uuid,uuid,text,numeric,integer,text,text
) TO authenticated;
COMMIT;
