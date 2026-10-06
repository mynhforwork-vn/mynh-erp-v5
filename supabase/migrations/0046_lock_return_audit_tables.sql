-- Remove all direct Data API mutation/destructive privileges from return audit tables.
revoke all privileges on table public.sale_returns from anon;
revoke all privileges on table public.sale_return_items from anon;

revoke all privileges on table public.sale_returns from authenticated;
revoke all privileges on table public.sale_return_items from authenticated;
grant select on table public.sale_returns to authenticated;
grant select on table public.sale_return_items to authenticated;

create index if not exists sale_return_items_warehouse_idx
  on public.sale_return_items(warehouse_id);
create index if not exists sale_return_items_variant_idx
  on public.sale_return_items(product_variant_id);
