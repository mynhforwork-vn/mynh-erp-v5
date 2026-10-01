create table if not exists public.bank_transfer_configs(
  config_key text primary key default 'DEFAULT',
  bank_id text not null,
  bank_name text not null,
  account_no text not null,
  account_name text not null,
  qr_template text not null default 'compact2',
  transfer_prefix text not null default 'MYNH',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transfer_configs_key check (config_key='DEFAULT'),
  constraint bank_transfer_configs_bank_id check (length(btrim(bank_id)) between 2 and 20),
  constraint bank_transfer_configs_account_no check (length(btrim(account_no)) between 4 and 30),
  constraint bank_transfer_configs_account_name check (length(btrim(account_name)) between 2 and 80),
  constraint bank_transfer_configs_qr_template check (length(btrim(qr_template)) between 2 and 80),
  constraint bank_transfer_configs_prefix check (length(btrim(transfer_prefix)) between 1 and 12)
);

alter table public.bank_transfer_configs enable row level security;

drop policy if exists bank_transfer_configs_read on public.bank_transfer_configs;
create policy bank_transfer_configs_read on public.bank_transfer_configs
for select to authenticated
using ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text,'viewer'::text]));

drop policy if exists bank_transfer_configs_write on public.bank_transfer_configs;
create policy bank_transfer_configs_write on public.bank_transfer_configs
for all to authenticated
using ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text]))
with check ((select public.current_erp_role()) = any(array['admin'::text,'operator'::text]));

revoke all on public.bank_transfer_configs from anon;
grant select on public.bank_transfer_configs to authenticated;
grant insert,update,delete on public.bank_transfer_configs to authenticated;

alter table public.sale_payments
  add column if not exists reference_code text null;

create index if not exists sale_payments_reference_code_idx
  on public.sale_payments(reference_code)
  where reference_code is not null;
