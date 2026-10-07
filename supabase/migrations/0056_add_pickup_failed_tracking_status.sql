-- Add explicit pickup failure lifecycle status.
alter type public.tracking_status
  add value if not exists 'PICKUP_FAILED' after 'READY_TO_SHIP';
