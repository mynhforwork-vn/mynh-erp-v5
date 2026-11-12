-- 0080: Row markings for purchase orders and warehouse intake.
-- Phase 1 supports order rows only. All colors are presentation-only.
-- Run on a disposable PostgreSQL fixture before Production.
BEGIN;

CREATE TABLE public.user_table_row_marks (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
  row_key uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  pinned boolean NOT NULL DEFAULT false,
  color text CHECK (color IS NULL OR color IN ('yellow','blue','green','purple','pink')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,scope,row_key)
);
CREATE INDEX user_table_row_marks_scope_idx
  ON public.user_table_row_marks(user_id,scope,pinned);
ALTER TABLE public.user_table_row_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_table_row_marks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_table_row_marks TO authenticated;
CREATE POLICY row_marks_select ON public.user_table_row_marks FOR SELECT TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY row_marks_insert ON public.user_table_row_marks FOR INSERT TO authenticated
  WITH CHECK (user_id=(select auth.uid()) AND
              (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY row_marks_update ON public.user_table_row_marks FOR UPDATE TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'))
  WITH CHECK (user_id=(select auth.uid()) AND
              (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY row_marks_delete ON public.user_table_row_marks FOR DELETE TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'));

CREATE TABLE public.table_row_flags (
  scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
  row_key uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN ('attention','urgent','follow_up')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 300),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope,row_key)
);
CREATE INDEX table_row_flags_key_idx ON public.table_row_flags(row_key);
ALTER TABLE public.table_row_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_row_flags FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.table_row_flags TO authenticated;
CREATE POLICY row_flags_select ON public.table_row_flags FOR SELECT TO authenticated
  USING ((select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY row_flags_insert ON public.table_row_flags FOR INSERT TO authenticated
  WITH CHECK ((select public.current_erp_role()) IN ('admin','operator') AND
              created_by=(select auth.uid()) AND updated_by=(select auth.uid()));
CREATE POLICY row_flags_update ON public.table_row_flags FOR UPDATE TO authenticated
  USING ((select public.current_erp_role()) IN ('admin','operator'))
  WITH CHECK ((select public.current_erp_role()) IN ('admin','operator') AND
              updated_by=(select auth.uid()));
CREATE POLICY row_flags_delete ON public.table_row_flags FOR DELETE TO authenticated
  USING ((select public.current_erp_role()) IN ('admin','operator'));

CREATE OR REPLACE FUNCTION private.audit_table_row_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  INSERT INTO public.audit_logs
    (actor_user_id,module,action,entity_type,entity_id,old_value,new_value,source)
  VALUES
    (auth.uid(),'OPERATIONS',
      CASE TG_OP WHEN 'INSERT' THEN 'FLAG_ROW'
                 WHEN 'DELETE' THEN 'UNFLAG_ROW'
                 ELSE 'UPDATE_ROW_FLAG' END,
      'ORDER',
      coalesce(NEW.row_key,OLD.row_key)::text,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
      'USER');
  RETURN coalesce(NEW,OLD);
END;
$fn$;
REVOKE ALL ON FUNCTION private.audit_table_row_flag() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_table_row_flag_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.table_row_flags
  FOR EACH ROW EXECUTE FUNCTION private.audit_table_row_flag();

CREATE OR REPLACE FUNCTION private.is_valid_table_highlight_conditions(
  p_scope text,p_conditions jsonb
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $fn$
DECLARE
  entry jsonb;
  field text;
  operator text;
  allowed text[];
BEGIN
  IF p_scope NOT IN ('warehouse_receive','purchase_orders')
     OR jsonb_typeof(p_conditions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_conditions) NOT BETWEEN 1 AND 6 THEN
    RETURN false;
  END IF;
  allowed:=CASE WHEN p_scope='warehouse_receive'
    THEN ARRAY['warehouse','status','sku_mapped','quantity','order_date']
    ELSE ARRAY['order_status','carrier','sku_mapped','quantity','order_date'] END;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(entry)<>'object' OR
       (SELECT count(*) FROM jsonb_object_keys(entry))<>3 THEN RETURN false; END IF;
    field:=entry->>'field';
    operator:=entry->>'operator';
    IF field IS NULL OR NOT field=ANY(allowed) OR
       operator IS NULL OR operator NOT IN ('eq','neq','contains','gt','lt','empty','not_empty')
       OR NOT(entry ? 'value') THEN
      RETURN false;
    END IF;
    IF operator NOT IN ('empty','not_empty') AND
       (jsonb_typeof(entry->'value') NOT IN ('string','number','boolean') OR
        length(entry->>'value')>150) THEN
      RETURN false;
    END IF;
    IF operator IN ('gt','lt') AND
       (field NOT IN ('quantity') OR jsonb_typeof(entry->'value')<>'number') THEN
      RETURN false;
    END IF;
    IF field='sku_mapped' AND
       (operator NOT IN ('eq','neq') OR jsonb_typeof(entry->'value')<>'boolean') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$fn$;

CREATE TABLE public.user_table_highlight_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 80),
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 10 CHECK (priority BETWEEN 1 AND 999),
  match_mode text NOT NULL CHECK (match_mode IN ('all','any')),
  conditions jsonb NOT NULL,
  color text NOT NULL CHECK (color IN ('yellow','blue','green','purple','pink')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT highlight_conditions_valid CHECK (
    private.is_valid_table_highlight_conditions(scope,conditions)
  )
);
CREATE INDEX user_highlight_rules_owner_idx
  ON public.user_table_highlight_rules(user_id,scope,priority,id);
ALTER TABLE public.user_table_highlight_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_table_highlight_rules FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_table_highlight_rules TO authenticated;
CREATE POLICY highlight_rules_select ON public.user_table_highlight_rules FOR SELECT TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY highlight_rules_insert ON public.user_table_highlight_rules FOR INSERT TO authenticated
  WITH CHECK (user_id=(select auth.uid()) AND
              (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY highlight_rules_update ON public.user_table_highlight_rules FOR UPDATE TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'))
  WITH CHECK (user_id=(select auth.uid()) AND
              (select public.current_erp_role()) IN ('admin','operator','viewer'));
CREATE POLICY highlight_rules_delete ON public.user_table_highlight_rules FOR DELETE TO authenticated
  USING (user_id=(select auth.uid()) AND
         (select public.current_erp_role()) IN ('admin','operator','viewer'));

COMMIT;
