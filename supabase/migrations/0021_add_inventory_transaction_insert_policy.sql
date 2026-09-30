drop policy if exists inventory_transactions_insert on public.inventory_transactions;

create policy inventory_transactions_insert
on public.inventory_transactions
for insert
to authenticated
with check (
  (select public.current_erp_role()) = any (array['admin'::text,'operator'::text])
);
