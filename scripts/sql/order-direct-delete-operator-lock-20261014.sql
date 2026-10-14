-- PHASE 1: Safe to apply before Production source release, 2026-10-14.
-- Current Production Settings -> PURGE_ARCHIVED_ORDERS still calls raw DELETE
-- with an Admin session. Permit only Admin temporarily to avoid breaking it.
-- Operator can STILL delete immediately through SECURITY DEFINER safe RPC.
-- This is NOT the final lock: Admin Data API remains a release blocker.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname='public' AND cmd='DELETE'
       AND ((tablename='orders' AND policyname='orders_delete')
         OR (tablename='erp_users' AND policyname='erp_users_delete'))
      )<>2 THEN
    RAISE EXCEPTION 'Expected orders_delete + erp_users_delete policies; abort';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('orders','erp_users')
        AND cmd='DELETE')<>2 THEN
    RAISE EXCEPTION 'Unexpected additional delete policies; abort';
  END IF;
END $guard$;
ALTER POLICY orders_delete ON public.orders
  USING ((SELECT public.current_erp_role())='admin');
ALTER POLICY erp_users_delete ON public.erp_users
  USING ((SELECT public.current_erp_role())='admin');
COMMIT;
