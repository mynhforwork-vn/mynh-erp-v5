-- Configurable print templates for POS sales invoices and debt receipts.

create table if not exists public.document_print_configs (
  document_key text primary key,
  brand_name text not null default 'MYNH ERP',
  title text not null,
  header_note text,
  paper_size text not null default 'A4',
  footer_text text,
  show_customer_phone boolean not null default true,
  show_warehouse boolean not null default true,
  show_sku boolean not null default true,
  show_variant boolean not null default true,
  show_qr boolean not null default true,
  show_signature boolean not null default false,
  show_invoice_details boolean not null default true,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint document_print_configs_key_check
    check (document_key in ('SALE_INVOICE','DEBT_RECEIPT')),
  constraint document_print_configs_paper_check
    check (paper_size in ('A4','A5','RECEIPT_80')),
  constraint document_print_configs_brand_not_blank
    check (length(btrim(brand_name)) between 1 and 80),
  constraint document_print_configs_title_not_blank
    check (length(btrim(title)) between 1 and 120)
);

insert into public.document_print_configs(
  document_key,brand_name,title,header_note,paper_size,footer_text,
  show_customer_phone,show_warehouse,show_sku,show_variant,show_qr,show_signature,show_invoice_details,is_active
)
values
(
  'SALE_INVOICE','MYNH ERP','PHIẾU BÁN HÀNG',null,'A4','Cảm ơn quý khách!',
  true,true,true,true,true,false,true,true
),
(
  'DEBT_RECEIPT','MYNH ERP','PHIẾU THU CÔNG NỢ',null,'A4',
  'Phiếu được phát hành sau khi giao dịch đã ghi nhận trên MYNH ERP.',
  true,true,true,true,true,true,true,true
)
on conflict(document_key) do nothing;

alter table public.document_print_configs enable row level security;

revoke all on public.document_print_configs from anon;
grant select,insert,update on public.document_print_configs to authenticated;

drop policy if exists document_print_configs_read on public.document_print_configs;
create policy document_print_configs_read
on public.document_print_configs
for select to authenticated
using (true);

drop policy if exists document_print_configs_write on public.document_print_configs;
create policy document_print_configs_write
on public.document_print_configs
for all to authenticated
using ((select public.current_erp_role()) in ('admin','operator'))
with check ((select public.current_erp_role()) in ('admin','operator'));
