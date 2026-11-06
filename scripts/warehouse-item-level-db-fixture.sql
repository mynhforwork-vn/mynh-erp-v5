-- Isolated PostgreSQL fixture for SQL 0075. NEVER run against real Supabase.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public,auth,private TO authenticated;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
CREATE OR REPLACE FUNCTION public.current_erp_role() RETURNS text
LANGUAGE sql STABLE AS $$
 SELECT current_setting('request.jwt.claims',true)::jsonb->'app_metadata'->>'role'
$$;
CREATE OR REPLACE FUNCTION private.assert_operator() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF auth.uid() IS NULL OR (public.current_erp_role()) NOT IN ('admin','operator') THEN
   RAISE EXCEPTION 'Operator role required' USING errcode='42501';
 END IF;
END $$;
GRANT EXECUTE ON FUNCTION private.assert_operator() TO authenticated;
CREATE TYPE public.receive_status AS ENUM ('NOT_READY','WAITING_RECEIVE','RECEIVED');
CREATE TYPE public.warehouse_order_status AS ENUM
  ('NOT_READY','READY_TO_TRANSFER','WAREHOUSE_SKIPPED','IN_TRANSFER','TRANSFERRED','WAREHOUSE_RECEIVED');
CREATE TYPE public.inventory_tx_type AS ENUM
  ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','SALE','RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT');
CREATE TABLE public.orders(
 id uuid PRIMARY KEY, receive_status public.receive_status NOT NULL,
 warehouse_status public.warehouse_order_status NOT NULL,
 archived_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sku text NOT NULL UNIQUE,
 name text NOT NULL,note text,created_at timestamptz DEFAULT now()
);
CREATE TABLE public.product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 variant_name text NOT NULL,sale_price numeric,UNIQUE(product_id,variant_name)
);
CREATE TABLE public.order_items (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 sku text, product_name text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
 product_variant_id uuid REFERENCES public.product_variants(id),
 inventory_multiplier integer NOT NULL DEFAULT 1 CHECK(inventory_multiplier>0)
);
CREATE TABLE public.warehouses (
 id uuid PRIMARY KEY,code text NOT NULL UNIQUE,name text NOT NULL,
 is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.receive_batches (
 id uuid PRIMARY KEY,warehouse_id uuid NOT NULL REFERENCES public.warehouses(id)
);
CREATE TABLE public.receive_batch_details (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 receive_batch_id uuid NOT NULL REFERENCES public.receive_batches(id)
);
CREATE TABLE public.inventory_transactions (
 id bigserial PRIMARY KEY,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 product_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
 tx_type public.inventory_tx_type NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 reference_type text,reference_id uuid,created_by uuid,created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX inventory_transactions_unique_reference_idx
ON public.inventory_transactions(warehouse_id,product_variant_id,tx_type,reference_type,reference_id)
WHERE reference_id IS NOT NULL;
CREATE TABLE public.audit_logs (
 id bigserial PRIMARY KEY,actor_user_id uuid,module text NOT NULL,
 action text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,
 old_value jsonb,new_value jsonb,source text,created_at timestamptz DEFAULT now()
);
GRANT SELECT ON TABLE public.orders,public.order_items,public.products,
  public.product_variants,public.warehouses,public.receive_batches,
  public.receive_batch_details,public.inventory_transactions,
  public.audit_logs TO authenticated;
