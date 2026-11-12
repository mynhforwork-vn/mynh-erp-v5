-- 0080: Row-specific personal highlights and rule-based highlighting.
-- Draft only: requires isolated SQL QA before Production migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_table_row_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
  row_id uuid NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  color text CHECK (color IS NULL OR color IN ('yellow','blue','green','purple','pink')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_table_row_marks_unique UNIQUE (user_id,scope,row_id)
);
CREATE INDEX IF NOT EXISTS erp_table_row_marks_scope_idx
 ON public.erp_table_row_marks(user_id,scope,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_table_highlight_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 70),
 enabled boolean NOT NULL DEFAULT true,
 priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
 match_mode text NOT NULL DEFAULT 'ALL' CHECK (match_mode IN ('ALL','ANY')),
 conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions)='array'
   AND jsonb_array_length(conditions) BETWEEN 1 AND 6),
 color text NOT NULL CHECK (color IN ('yellow','blue','green','purple','pink')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_table_highlight_rules_user_idx
 ON public.erp_table_highlight_rules(user_id,scope,priority,id);

CREATE TABLE IF NOT EXISTS public.erp_table_row_flags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scope text NOT NULL CHECK (scope IN ('warehouse_receive','purchase_orders')),
 row_id uuid NOT NULL,
 flag_type text NOT NULL CHECK (flag_type IN ('review','followup','important')),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 4 AND 300),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(scope,row_id)
);

ALTER TABLE public.erp_table_row_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_table_highlight_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_table_row_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_table_row_marks,public.erp_table_highlight_rules,
 public.erp_table_row_flags FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.erp_table_row_marks,
 public.erp_table_highlight_rules TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.erp_table_row_flags TO authenticated;

DROP POLICY IF EXISTS row_marks_select ON public.erp_table_row_marks;
CREATE POLICY row_marks_select ON public.erp_table_row_marks FOR SELECT TO authenticated
 USING (user_id=(select auth.uid()));
DROP POLICY IF EXISTS row_marks_insert ON public.erp_table_row_marks;
CREATE POLICY row_marks_insert ON public.erp_table_row_marks FOR INSERT TO authenticated
 WITH CHECK (user_id=(select auth.uid()));
DROP POLICY IF EXISTS row_marks_update ON public.erp_table_row_marks;
CREATE POLICY row_marks_update ON public.erp_table_row_marks FOR UPDATE TO authenticated
 USING (user_id=(select auth.uid()))
 WITH CHECK (user_id=(select auth.uid()));
DROP POLICY IF EXISTS row_marks_delete ON public.erp_table_row_marks;
CREATE POLICY row_marks_delete ON public.erp_table_row_marks FOR DELETE TO authenticated
 USING (user_id=(select auth.uid()));

DROP POLICY IF EXISTS highlight_rules_select ON public.erp_table_highlight_rules;
CREATE POLICY highlight_rules_select ON public.erp_table_highlight_rules FOR SELECT TO authenticated
 USING (user_id=(select auth.uid()));
DROP POLICY IF EXISTS highlight_rules_insert ON public.erp_table_highlight_rules;
CREATE POLICY highlight_rules_insert ON public.erp_table_highlight_rules FOR INSERT TO authenticated
 WITH CHECK (user_id=(select auth.uid()));
DROP POLICY IF EXISTS highlight_rules_update ON public.erp_table_highlight_rules;
CREATE POLICY highlight_rules_update ON public.erp_table_highlight_rules FOR UPDATE TO authenticated
 USING (user_id=(select auth.uid()))
 WITH CHECK (user_id=(select auth.uid()));
DROP POLICY IF EXISTS highlight_rules_delete ON public.erp_table_highlight_rules;
CREATE POLICY highlight_rules_delete ON public.erp_table_highlight_rules FOR DELETE TO authenticated
 USING (user_id=(select auth.uid()));

-- Flags are shared among authorized roles; no direct unrestricted writes.
DROP POLICY IF EXISTS row_flags_read ON public.erp_table_row_flags;
CREATE POLICY row_flags_read ON public.erp_table_row_flags FOR SELECT TO authenticated
 USING ((select public.current_erp_role()) IN ('admin','operator','viewer'));
DROP POLICY IF EXISTS row_flags_insert ON public.erp_table_row_flags;
CREATE POLICY row_flags_insert ON public.erp_table_row_flags FOR INSERT TO authenticated
 WITH CHECK (created_by=(select auth.uid()) AND updated_by=(select auth.uid())
   AND (select public.current_erp_role()) IN ('admin','operator'));
DROP POLICY IF EXISTS row_flags_update ON public.erp_table_row_flags;
CREATE POLICY row_flags_update ON public.erp_table_row_flags FOR UPDATE TO authenticated
 USING ((select public.current_erp_role()) IN ('admin','operator'))
 WITH CHECK (updated_by=(select auth.uid())
   AND (select public.current_erp_role()) IN ('admin','operator'));
DROP POLICY IF EXISTS row_flags_delete ON public.erp_table_row_flags;
CREATE POLICY row_flags_delete ON public.erp_table_row_flags FOR DELETE TO authenticated
 USING ((select public.current_erp_role())='admin');

-- Require every flag mutation to be attributable; append to immutable audit_logs.
CREATE OR REPLACE FUNCTION private.audit_erp_row_flag()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $$
 BEGIN
   INSERT INTO public.audit_logs(actor_user_id,module,action,entity_type,entity_id,
    old_value,new_value,source)
   VALUES ((select auth.uid()),'WAREHOUSE',
     CASE WHEN TG_OP='INSERT' THEN 'FLAG_ROW' WHEN TG_OP='UPDATE' THEN 'UPDATE_ROW_FLAG'
          ELSE 'REMOVE_ROW_FLAG' END,
     'ORDER',coalesce(NEW.row_id,OLD.row_id)::text,
     CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
     CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
     'USER');
   RETURN COALESCE(NEW,OLD);
 END $$;
REVOKE ALL ON FUNCTION private.audit_erp_row_flag() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS audit_erp_row_flag_changes ON public.erp_table_row_flags;
CREATE TRIGGER audit_erp_row_flag_changes
 AFTER INSERT OR UPDATE OR DELETE ON public.erp_table_row_flags
 FOR EACH ROW EXECUTE FUNCTION private.audit_erp_row_flag();

COMMIT;
