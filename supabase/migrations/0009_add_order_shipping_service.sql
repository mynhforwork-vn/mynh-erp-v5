alter table public.orders
  add column if not exists shipping_service text not null default 'STANDARD';

alter table public.orders
  drop constraint if exists orders_shipping_service_check;

alter table public.orders
  add constraint orders_shipping_service_check
  check (shipping_service in ('STANDARD','EXPRESS'));

create or replace function public.create_order_full_v2(
  p_shopee_order_id text default null,
  p_erp_user_id uuid default null,
  p_order_date timestamptz default now(),
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_recipient_address text default null,
  p_destination_hub text default null,
  p_cod numeric default 0,
  p_order_status text default 'PENDING',
  p_payment_status text default 'UNPAID',
  p_tracking_number text default null,
  p_carrier text default null,
  p_shipping_service text default 'STANDARD',
  p_items jsonb default '[]'::jsonb,
  p_vouchers jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_service text := case when upper(coalesce(p_shipping_service,''))='EXPRESS' then 'EXPRESS' else 'STANDARD' end;
begin
  v_id := public.create_order_full(
    p_shopee_order_id,p_erp_user_id,coalesce(p_order_date,now()),
    p_recipient_name,p_recipient_phone,p_recipient_address,null,p_destination_hub,
    p_cod,p_order_status,p_payment_status,p_tracking_number,p_carrier,p_items,p_vouchers
  );
  update public.orders set shipping_service=v_service,updated_at=now() where id=v_id;
  return v_id;
end;
$$;

create or replace function public.update_order_full_v2(
  p_order_id uuid,
  p_shopee_order_id text default null,
  p_erp_user_id uuid default null,
  p_order_date timestamptz default now(),
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_recipient_address text default null,
  p_destination_hub text default null,
  p_cod numeric default 0,
  p_order_status text default 'PENDING',
  p_payment_status text default 'UNPAID',
  p_tracking_number text default null,
  p_carrier text default null,
  p_shipping_service text default 'STANDARD',
  p_items jsonb default '[]'::jsonb,
  p_vouchers jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_service text := case when upper(coalesce(p_shipping_service,''))='EXPRESS' then 'EXPRESS' else 'STANDARD' end;
begin
  v_id := public.update_order_full(
    p_order_id,p_shopee_order_id,p_erp_user_id,p_order_date,
    p_recipient_name,p_recipient_phone,p_recipient_address,null,p_destination_hub,
    p_cod,p_order_status,p_payment_status,p_tracking_number,p_carrier,p_items,p_vouchers
  );
  update public.orders set shipping_service=v_service,updated_at=now() where id=v_id;
  return v_id;
end;
$$;

grant execute on function public.create_order_full_v2(
  text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) to authenticated;

grant execute on function public.update_order_full_v2(
  uuid,text,uuid,timestamptz,text,text,text,text,numeric,text,text,text,text,text,jsonb,jsonb
) to authenticated;
