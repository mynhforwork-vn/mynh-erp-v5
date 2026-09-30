alter table public.order_items
  add column if not exists inventory_multiplier integer not null default 1;

alter table public.order_items
  drop constraint if exists order_items_inventory_multiplier_check;

alter table public.order_items
  add constraint order_items_inventory_multiplier_check
  check (inventory_multiplier > 0);
