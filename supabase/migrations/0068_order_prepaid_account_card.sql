-- Payment already settled on Shopee/by account/card, separate from carrier COD.
-- Nullable additions retain all existing orders and do not generate ledger entries.
alter table public.orders
  add column if not exists prepaid_amount numeric(14,0),
  add column if not exists prepaid_source_type text,
  add column if not exists prepaid_source_label text;
comment on column public.orders.prepaid_amount is 'Amount already paid in VND; independent from shipping COD.';
comment on column public.orders.prepaid_source_type is 'BANK_ACCOUNT, DEBIT_CARD, CREDIT_CARD, SPAYLATER, OTHER.';
comment on column public.orders.prepaid_source_label is 'Optional source nickname and at most four final card digits; never a full PAN.';
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_prepaid_amount_positive') then
    alter table public.orders add constraint orders_prepaid_amount_positive
      check (prepaid_amount is null or prepaid_amount > 0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_prepaid_source_valid') then
    alter table public.orders add constraint orders_prepaid_source_valid
      check (prepaid_source_type is null or prepaid_source_type in
        ('BANK_ACCOUNT','DEBIT_CARD','CREDIT_CARD','SPAYLATER','OTHER'));
  end if;
end $$;
