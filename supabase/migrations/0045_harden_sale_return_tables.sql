-- Return audit tables are read-only through the Data API.
-- Mutations must go through cancel_pos_sale / return_pos_sale so inventory,
-- debt and finance remain atomic.
drop policy if exists sale_returns_write on public.sale_returns;
drop policy if exists sale_return_items_write on public.sale_return_items;

revoke insert,update,delete on table public.sale_returns from anon,authenticated;
revoke insert,update,delete on table public.sale_return_items from anon,authenticated;
grant select on table public.sale_returns to authenticated;
grant select on table public.sale_return_items to authenticated;
