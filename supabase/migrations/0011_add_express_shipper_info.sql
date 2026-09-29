alter table public.orders
  add column if not exists express_shipper_name text,
  add column if not exists express_shipper_phone text,
  add column if not exists express_shipper_note text;
