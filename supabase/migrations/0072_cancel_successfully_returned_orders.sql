-- MYNH ERP V5 / SQL 0072: successful return ends tracking and cancels its order.
-- NOT applied by CI, PR merge, or Worker deploy. Production migration requires separate approval.
-- Preserve tracking_events + financial/warehouse records, and do not alter provider polling/Cron.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_successfully_returned_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- RETURNING is in progress; only the terminal provider status RETURNED applies.
  IF NEW.current_tracking_status = 'RETURNED'::public.tracking_status THEN
    -- Guard every write path (scheduled dispatcher, manual sync, and direct correction).
    NEW.tracking_enabled := false;
    NEW.next_track_at := null;
    NEW.locked_until := null;
    NEW.queue_status := 'READY';

    IF NEW.is_active IS TRUE THEN
      UPDATE public.orders o
      SET order_status = 'CANCELLED', updated_at = now()
      WHERE o.id = NEW.order_id
        AND o.order_status IS DISTINCT FROM 'CANCELLED';

      -- Retain the historical alert rows but never deliver stale pending Telegram alerts.
      UPDATE public.alert_events a
      SET telegram_suppressed_at = now(),
          telegram_suppressed_reason = 'RETURNED_SHIPMENT_TERMINAL',
          locked_until = null
      WHERE a.shipment_id = NEW.id
        AND a.sent_at IS NULL
        AND a.telegram_suppressed_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_successfully_returned_shipment()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finalize_successfully_returned_shipment ON public.shipments;
CREATE TRIGGER trg_finalize_successfully_returned_shipment
BEFORE INSERT OR UPDATE OF current_tracking_status, tracking_enabled, next_track_at, is_active, order_id
ON public.shipments
FOR EACH ROW
WHEN (NEW.current_tracking_status = 'RETURNED'::public.tracking_status)
EXECUTE FUNCTION public.finalize_successfully_returned_shipment();

-- Backfill terminal invariants for old rows, without re-fetching any provider.
UPDATE public.shipments s
SET tracking_enabled = false,
    next_track_at = null,
    locked_until = null,
    queue_status = 'READY',
    updated_at = now()
WHERE s.current_tracking_status = 'RETURNED'::public.tracking_status
  AND (s.tracking_enabled IS DISTINCT FROM false
       OR s.next_track_at IS NOT NULL OR s.locked_until IS NOT NULL
       OR s.queue_status::text IS DISTINCT FROM 'READY');

-- Existing RETURNED shipments may already be stopped but still have PROCESSING orders.
UPDATE public.orders o
SET order_status = 'CANCELLED', updated_at = now()
WHERE o.order_status IS DISTINCT FROM 'CANCELLED'
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.order_id = o.id AND s.is_active IS TRUE
      AND s.current_tracking_status = 'RETURNED'::public.tracking_status
  );

UPDATE public.alert_events a
SET telegram_suppressed_at = now(),
    telegram_suppressed_reason = 'RETURNED_SHIPMENT_TERMINAL',
    locked_until = null
WHERE a.sent_at IS NULL AND a.telegram_suppressed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = a.shipment_id AND s.is_active IS TRUE
      AND s.current_tracking_status = 'RETURNED'::public.tracking_status
  );

COMMIT;
