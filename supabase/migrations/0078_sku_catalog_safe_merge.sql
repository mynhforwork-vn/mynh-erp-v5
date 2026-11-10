-- 0078 SKU catalog editing and audited, stock-safe merge.
-- REVIEW GATE: do not apply to Production without explicit migration approval.
BEGIN;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS merged_into_variant_id uuid NULL
    REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variant_merge_status_check;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variant_merge_status_check CHECK (
    (is_active AND merged_into_variant_id IS NULL)
    OR (NOT is_active AND merged_into_variant_id IS NOT NULL
        AND merged_into_variant_id <> id)
  );

CREATE INDEX IF NOT EXISTS product_variants_active_product_idx
  ON public.product_variants(product_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.sku_merge_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  target_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  quantity_moved bigint NOT NULL CHECK (quantity_moved >= 0),
  snapshot jsonb NOT NULL,
  note text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sku_merge_distinct_variants CHECK(source_variant_id <> target_variant_id),
  CONSTRAINT sku_merge_source_unique UNIQUE(source_variant_id)
);
ALTER TABLE public.sku_merge_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sku_merge_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.sku_merge_events TO authenticated;
DROP POLICY IF EXISTS sku_merge_events_read ON public.sku_merge_events;
CREATE POLICY sku_merge_events_read ON public.sku_merge_events
  FOR SELECT TO authenticated
  USING ((select public.current_erp_role()) IN ('admin','operator'));

-- Prevent future transactions/mappings accidentally targeting an already
-- merged SKU while preserving all existing historical foreign keys.
CREATE OR REPLACE FUNCTION private.guard_active_inventory_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.product_variant_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.product_variant_id IS NOT DISTINCT FROM OLD.product_variant_id
    THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_variants pv
    WHERE pv.id=NEW.product_variant_id AND pv.is_active
  ) THEN
    RAISE EXCEPTION 'SKU đã gộp hoặc không còn hoạt động. Hãy chọn SKU đang sử dụng';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_active_inventory_variant() FROM PUBLIC,anon,authenticated;

DO $do$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'order_items','warehouse_item_decisions','inventory_transactions',
    'sale_items','sale_return_items','transfer_items'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_active_sku ON public.%I',v_table);
    EXECUTE format(
      'CREATE TRIGGER guard_active_sku BEFORE INSERT OR UPDATE OF product_variant_id
       ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_active_inventory_variant()',
      v_table);
  END LOOP;
END;
$do$;

-- An independent classification for an existing product/SKU.
CREATE OR REPLACE FUNCTION private.add_catalog_variant_impl(
  p_product_id uuid,p_variant_name text,p_sale_price numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_name text:=btrim(coalesce(p_variant_name,''));v_id uuid;v_product record;
BEGIN
  PERFORM private.assert_operator();
  IF p_product_id IS NULL OR length(v_name) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Phân loại SKU không hợp lệ';
  END IF;
  IF p_sale_price IS NULL OR p_sale_price<0 OR p_sale_price>999999999
      OR p_sale_price<>round(p_sale_price,2) THEN
    RAISE EXCEPTION 'Giá bán phải hợp lệ (tối đa hai chữ số thập phân)';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SKU không tồn tại'; END IF;
  IF EXISTS(SELECT 1 FROM public.product_variants
      WHERE product_id=p_product_id AND lower(btrim(variant_name))=lower(v_name)) THEN
    RAISE EXCEPTION 'Phân loại SKU đã tồn tại';
  END IF;
  INSERT INTO public.product_variants(product_id,variant_name,sale_price)
    VALUES(p_product_id,v_name,p_sale_price) RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    VALUES(auth.uid(),'WAREHOUSE','CATALOG_ADD_VARIANT','PRODUCT_VARIANT',v_id::text,
           NULL,jsonb_build_object('product_id',p_product_id,'sku',v_product.sku,
           'variant_name',v_name,'sale_price',p_sale_price),'USER');
  RETURN jsonb_build_object('id',v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_catalog_variant_impl(
  p_variant_id uuid,p_sku text,p_product_name text,p_variant_name text,p_sale_price numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_variant record;v_product record;v_sku text:=upper(btrim(coalesce(p_sku,'')));
  v_name text:=btrim(coalesce(p_product_name,''));v_variant_name text:=btrim(coalesce(p_variant_name,''));
  v_old jsonb;
BEGIN
  PERFORM private.assert_operator();
  IF length(v_sku) NOT BETWEEN 1 AND 100 OR length(v_name) NOT BETWEEN 1 AND 255
    OR length(v_variant_name) NOT BETWEEN 1 AND 255
    OR v_sku ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Mã SKU, tên sản phẩm hoặc phân loại không hợp lệ';
  END IF;
  IF p_sale_price IS NULL OR p_sale_price<0 OR p_sale_price>999999999
    OR p_sale_price<>round(p_sale_price,2) THEN
    RAISE EXCEPTION 'Giá bán không hợp lệ';
  END IF;
  SELECT * INTO v_variant FROM public.product_variants WHERE id=p_variant_id FOR UPDATE;
  IF NOT FOUND OR NOT v_variant.is_active THEN RAISE EXCEPTION 'SKU không còn hoạt động'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=v_variant.product_id FOR UPDATE;
  v_old:=jsonb_build_object('sku',v_product.sku,'name',v_product.name,
        'variant_name',v_variant.variant_name,'sale_price',v_variant.sale_price);
  IF EXISTS(SELECT 1 FROM public.products
       WHERE id<>v_product.id AND upper(btrim(sku))=v_sku) THEN
    RAISE EXCEPTION 'Mã SKU đã tồn tại';
  END IF;
  IF EXISTS(SELECT 1 FROM public.product_variants
       WHERE product_id=v_product.id AND id<>p_variant_id
         AND lower(btrim(variant_name))=lower(v_variant_name)) THEN
    RAISE EXCEPTION 'Phân loại SKU đã tồn tại';
  END IF;
  UPDATE public.products SET sku=v_sku,name=v_name,updated_at=now() WHERE id=v_product.id;
  UPDATE public.product_variants SET variant_name=v_variant_name,
      sale_price=p_sale_price,updated_at=now() WHERE id=p_variant_id;
  INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    VALUES(auth.uid(),'WAREHOUSE','CATALOG_EDIT_VARIANT','PRODUCT_VARIANT',p_variant_id::text,
      v_old,jsonb_build_object('sku',v_sku,'name',v_name,
      'variant_name',v_variant_name,'sale_price',p_sale_price),'USER');
  RETURN jsonb_build_object('variant_id',p_variant_id,'product_id',v_product.id);
END;
$fn$;

-- Snapshot for the confirmation screen and stale-preview protection.
CREATE OR REPLACE FUNCTION private.sku_merge_snapshot(
  p_source uuid,p_target uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_source record;v_target record;v_warehouses jsonb;v_payload jsonb;
  v_open_orders bigint;v_drafts bigint;v_transfers bigint;v_sales bigint;
  v_negative bigint;v_total bigint;
BEGIN
  PERFORM private.assert_operator();
  IF p_source IS NULL OR p_target IS NULL OR p_source=p_target THEN
    RAISE EXCEPTION 'Chọn hai phân loại SKU khác nhau để gộp';
  END IF;
  SELECT pv.id,pv.is_active,p.sku,p.name,pv.variant_name,pv.sale_price
    INTO v_source FROM public.product_variants pv
    JOIN public.products p ON p.id=pv.product_id WHERE pv.id=p_source;
  SELECT pv.id,pv.is_active,p.sku,p.name,pv.variant_name,pv.sale_price
    INTO v_target FROM public.product_variants pv
    JOIN public.products p ON p.id=pv.product_id WHERE pv.id=p_target;
  IF v_source.id IS NULL OR v_target.id IS NULL
      OR NOT v_source.is_active OR NOT v_target.is_active THEN
    RAISE EXCEPTION 'SKU nguồn hoặc SKU đích không còn hoạt động';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'warehouse_id',q.warehouse_id,'warehouse',q.warehouse_code,
     'quantity',q.quantity) ORDER BY q.warehouse_code,q.warehouse_id),'[]'::jsonb),
     coalesce(sum(q.quantity),0),count(*) FILTER (WHERE q.quantity<0)
    INTO v_warehouses,v_total,v_negative
    FROM public.inventory_balances q WHERE q.product_variant_id=p_source;
  SELECT count(*) INTO v_open_orders FROM public.order_items oi
    JOIN public.orders o ON o.id=oi.order_id
    WHERE oi.product_variant_id=p_source
      AND o.archived_at IS NULL
      -- Orders mapped to this SKU but not finally warehoused may still post
      -- stock later. Never retire their SKU prematurely.
      AND o.warehouse_status::text NOT IN
        ('WAREHOUSE_RECEIVED','WAREHOUSE_MIXED','WAREHOUSE_SKIPPED','TRANSFERRED');
  SELECT count(*) INTO v_drafts FROM public.warehouse_item_decisions
    WHERE product_variant_id=p_source AND processing_state='DRAFT';
  SELECT count(*) INTO v_transfers FROM public.transfer_items ti
    JOIN public.transfer_batches tb ON tb.id=ti.transfer_batch_id
    WHERE ti.product_variant_id=p_source AND tb.status::text NOT IN ('RECEIVED','CANCELLED');
  SELECT count(*) INTO v_sales FROM public.sale_items
    WHERE product_variant_id=p_source;
  v_payload:=jsonb_build_object(
    'source',jsonb_build_object('id',v_source.id,'sku',v_source.sku,
      'name',v_source.name,'variant',v_source.variant_name,'price',v_source.sale_price),
    'target',jsonb_build_object('id',v_target.id,'sku',v_target.sku,
      'name',v_target.name,'variant',v_target.variant_name,'price',v_target.sale_price),
    'warehouses',v_warehouses,'quantity',v_total,
    'open_orders',v_open_orders,'drafts',v_drafts,
    'pending_transfers',v_transfers,'sale_history',v_sales,'negative_balances',v_negative
  );
  RETURN v_payload||jsonb_build_object('fingerprint',md5(v_payload::text),
    'can_merge',(v_open_orders=0 AND v_drafts=0 AND v_transfers=0
      AND v_sales=0 AND v_negative=0));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.merge_catalog_sku_impl(
  p_source uuid,p_target uuid,p_fingerprint text,p_confirmation text,
  p_same_unit boolean,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_id uuid:=gen_random_uuid();v_data jsonb;v_row record;
  v_source_sku text;v_total bigint:=0;v_variant uuid;
BEGIN
  PERFORM private.assert_admin();
  -- Row-level locks serialize all new inventory FK inserts and edits to
  -- either variant during transfer. Deterministic order prevents deadlocks.
  FOR v_variant IN SELECT id FROM public.product_variants
      WHERE id IN (p_source,p_target) ORDER BY id LOOP
    PERFORM 1 FROM public.product_variants WHERE id=v_variant FOR UPDATE;
  END LOOP;
  v_data:=private.sku_merge_snapshot(p_source,p_target);
  v_source_sku:=v_data->'source'->>'sku';
  IF coalesce(p_fingerprint,'')<>v_data->>'fingerprint' THEN
    RAISE EXCEPTION 'Dữ liệu đã thay đổi. Vui lòng xem trước gộp SKU lần nữa';
  END IF;
  IF NOT (v_data->>'can_merge')::boolean THEN
    RAISE EXCEPTION 'SKU nguồn còn phát sinh chưa xử lý hoặc có lịch sử bán; chưa thể gộp an toàn';
  END IF;
  IF p_same_unit IS DISTINCT FROM true OR upper(btrim(coalesce(p_confirmation,'')))<>upper(v_source_sku) THEN
    RAISE EXCEPTION 'Cần xác nhận cùng đơn vị tồn và nhập đúng mã SKU nguồn';
  END IF;
  IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Nhập lý do gộp SKU (5–500 ký tự)';
  END IF;

  INSERT INTO public.sku_merge_events(id,source_variant_id,target_variant_id,
    quantity_moved,snapshot,note,created_by)
    VALUES(v_id,p_source,p_target,(v_data->>'quantity')::bigint,
       v_data,btrim(p_note),auth.uid());

  FOR v_row IN SELECT warehouse_id,quantity FROM public.inventory_balances
      WHERE product_variant_id=p_source AND quantity>0 ORDER BY warehouse_id LOOP
    INSERT INTO public.inventory_transactions(
      warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
    ) VALUES(v_row.warehouse_id,p_source,'ADJUSTMENT_OUT',
      v_row.quantity::integer,'SKU_MERGE',v_id,auth.uid());
    INSERT INTO public.inventory_transactions(
      warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_by
    ) VALUES(v_row.warehouse_id,p_target,'ADJUSTMENT_IN',
      v_row.quantity::integer,'SKU_MERGE',v_id,auth.uid());
    v_total:=v_total+v_row.quantity;
  END LOOP;
  UPDATE public.product_variants SET is_active=false,merged_into_variant_id=p_target,
    updated_at=now() WHERE id=p_source;

  INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
    VALUES(auth.uid(),'WAREHOUSE','CATALOG_MERGE_SKU','PRODUCT_VARIANT',p_source::text,
      v_data,jsonb_build_object('merge_id',v_id,'target',p_target,
      'quantity_moved',v_total,'note',btrim(p_note)),'USER');

  RETURN jsonb_build_object('merge_id',v_id,'quantity_moved',v_total,
    'source_variant_id',p_source,'target_variant_id',p_target);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_catalog_variant(
 p_product_id uuid,p_variant_name text,p_sale_price numeric
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$ SELECT private.add_catalog_variant_impl(p_product_id,p_variant_name,p_sale_price); $fn$;

CREATE OR REPLACE FUNCTION public.update_catalog_variant(
 p_variant_id uuid,p_sku text,p_product_name text,p_variant_name text,p_sale_price numeric
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$ SELECT private.update_catalog_variant_impl(
  p_variant_id,p_sku,p_product_name,p_variant_name,p_sale_price); $fn$;

CREATE OR REPLACE FUNCTION public.preview_sku_merge(
 p_source uuid,p_target uuid
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$ SELECT private.sku_merge_snapshot(p_source,p_target); $fn$;

CREATE OR REPLACE FUNCTION public.merge_catalog_sku(
 p_source uuid,p_target uuid,p_fingerprint text,p_confirmation text,
 p_same_unit boolean,p_note text
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $fn$ SELECT private.merge_catalog_sku_impl(
 p_source,p_target,p_fingerprint,p_confirmation,p_same_unit,p_note); $fn$;

REVOKE ALL ON FUNCTION public.add_catalog_variant(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_catalog_variant(uuid,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preview_sku_merge(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.merge_catalog_sku(uuid,uuid,text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_catalog_variant(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_variant(uuid,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_sku_merge(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_catalog_sku(uuid,uuid,text,text,boolean,text) TO authenticated;

REVOKE ALL ON FUNCTION private.add_catalog_variant_impl(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.update_catalog_variant_impl(uuid,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sku_merge_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.merge_catalog_sku_impl(uuid,uuid,text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.add_catalog_variant_impl(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_catalog_variant_impl(uuid,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.sku_merge_snapshot(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.merge_catalog_sku_impl(uuid,uuid,text,text,boolean,text) TO authenticated;

COMMIT;
