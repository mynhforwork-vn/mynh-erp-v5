alter type public.warehouse_order_status
  add value if not exists 'WAREHOUSE_SKIPPED' after 'READY_TO_TRANSFER';
