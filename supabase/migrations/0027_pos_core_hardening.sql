revoke all on public.sale_payments from anon;
grant select,insert,update,delete on public.sale_payments to authenticated;

create index if not exists sale_payments_sale_id_idx
  on public.sale_payments(sale_id);

create index if not exists sales_warehouse_id_idx
  on public.sales(warehouse_id);
