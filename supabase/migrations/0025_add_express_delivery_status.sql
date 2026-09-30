alter table public.orders
  add column if not exists express_delivery_status text null;

alter table public.orders
  drop constraint if exists orders_express_delivery_status_allowed;

alter table public.orders
  add constraint orders_express_delivery_status_allowed
  check (
    express_delivery_status is null
    or express_delivery_status = any(array[
      'PROCESSING'::text,
      'DELIVERED'::text,
      'FAILED'::text,
      'CANCELLED'::text
    ])
  );

update public.orders
set express_delivery_status = case
  when shipping_service <> 'EXPRESS' then null
  when order_status = 'CANCELLED' then 'CANCELLED'
  when receive_status in ('WAITING_RECEIVE','RECEIVED') then 'DELIVERED'
  else 'PROCESSING'
end
where shipping_service='EXPRESS'
   or express_delivery_status is not null;
