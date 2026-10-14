-- PHASE 2: FINAL LOCK — NEVER RUN until replacement Production source is active.
-- Run only after admin Settings purge is verified using safe RPC on Production.
-- This fully blocks raw Data API DELETE for anon/authenticated; audited
-- SECURITY DEFINER RPCs still call private safe implementations as postgres.
-- Do not modify other modules' deletion privileges without separate review.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('orders','erp_users') AND cmd='DELETE')<>2
  THEN RAISE EXCEPTION 'Unexpected policy count; abort'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='delete_orders_permanent_safe'
      AND p.prosecdef)
     OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='delete_erp_user_permanent'
      AND p.prosecdef)
  THEN RAISE EXCEPTION 'Safe RPC missing; abort'; END IF;
END $guard$;
REVOKE DELETE ON TABLE public.orders FROM authenticated, anon, PUBLIC;
REVOKE DELETE ON TABLE public.erp_users FROM authenticated, anon, PUBLIC;
DROP POLICY orders_delete ON public.orders;
DROP POLICY erp_users_delete ON public.erp_users;
COMMIT;
