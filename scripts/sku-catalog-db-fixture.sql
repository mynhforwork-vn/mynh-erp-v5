-- For disposable PostgreSQL CI only. Run after warehouse-item-level fixture + 0075/76/77.
-- Do not run on the linked Supabase Production project.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION private.assert_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR public.current_erp_role()<>'admin'
 THEN RAISE EXCEPTION 'Admin role required' USING errcode='42501'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION private.assert_admin() TO authenticated;

CREATE TABLE public.sale_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id)
);
CREATE TABLE public.sale_return_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id)
);
CREATE TABLE public.transfer_batches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text NOT NULL
);
CREATE TABLE public.transfer_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_batch_id uuid NOT NULL REFERENCES public.transfer_batches(id),
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id)
);
CREATE OR REPLACE VIEW public.inventory_balances AS
 SELECT it.warehouse_id,w.code AS warehouse_code,w.name AS warehouse_name,
   it.product_variant_id,
   sum(CASE WHEN it.tx_type IN ('IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN')
     THEN it.quantity ELSE -it.quantity END)::bigint AS quantity
 FROM public.inventory_transactions it
 JOIN public.warehouses w ON w.id=it.warehouse_id
 GROUP BY it.warehouse_id,w.code,w.name,it.product_variant_id;
GRANT SELECT ON TABLE public.inventory_balances TO authenticated;

INSERT INTO public.warehouses(id,code,name) VALUES
 ('90000000-0000-4000-8000-000000000001','BG','Bắc Giang'),
 ('90000000-0000-4000-8000-000000000002','HN','Hà Nội');

INSERT INTO public.products(id,sku,name) VALUES
 ('a0000000-0000-4000-8000-000000000001','SKU-OLD','Sản phẩm nguồn'),
 ('a0000000-0000-4000-8000-000000000002','SKU-NEW','Sản phẩm đích'),
 ('a0000000-0000-4000-8000-000000000003','SKU-BLOCK','Sản phẩm khóa');

INSERT INTO public.product_variants(id,product_id,variant_name,sale_price) VALUES
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Đỏ',100000),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','Đỏ',110000),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','L',200000);

INSERT INTO public.inventory_transactions(
 warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id
) VALUES
 ('90000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
  'IN',4,'QA','c0000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',
  'IN',3,'QA','c0000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002',
  'IN',2,'QA','c0000000-0000-4000-8000-000000000003');
