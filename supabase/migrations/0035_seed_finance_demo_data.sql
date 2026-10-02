-- Demo records for Finance validation. All records are explicitly tagged [DEMO].
insert into public.customers(id,name,phone,address,note)
values
('90000000-0000-0000-0000-000000000001','Nguyễn Văn An [DEMO]','0986123456','Hoàng Mai, Hà Nội','[DEMO] Finance customer'),
('90000000-0000-0000-0000-000000000002','Phạm Thu Trang [DEMO]','0388223344','Thanh Xuân, Hà Nội','[DEMO] Finance customer'),
('90000000-0000-0000-0000-000000000003','Lê Minh C [DEMO]','0966456789','Cầu Giấy, Hà Nội','[DEMO] Finance customer')
on conflict(id) do nothing;

insert into public.sales(
  id,customer_id,sale_at,total_amount,paid_amount,debt_amount,payment_status,note,
  invoice_code,warehouse_id,subtotal,discount_amount,other_fee,sale_status,cash_received,change_amount
) values
('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','2026-10-01 10:20:00+07',685000,500000,185000,'PARTIAL','[DEMO] Partial debt','DEMO-POS-001','50000000-0000-0000-0000-000000000001',685000,0,0,'COMPLETED',500000,0),
('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000002','2026-09-29 12:12:00+07',622000,0,622000,'UNPAID','[DEMO] Unpaid debt','DEMO-POS-002','50000000-0000-0000-0000-000000000001',622000,0,0,'COMPLETED',0,0),
('91000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000003','2026-10-02 13:10:00+07',415000,415000,0,'PAID','[DEMO] Paid sale','DEMO-POS-003','50000000-0000-0000-0000-000000000001',415000,0,0,'COMPLETED',415000,0)
on conflict(id) do nothing;

insert into public.customer_payments(id,customer_id,amount,paid_at,note,receipt_code,payment_method)
values
('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',500000,'2026-10-01 10:21:00+07','[DEMO] Thu một phần công nợ','DEMO-PTN-001','TRANSFER'),
('92000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003',415000,'2026-10-02 13:11:00+07','[DEMO] Thu đủ công nợ','DEMO-PTN-002','CASH')
on conflict(id) do nothing;

insert into public.customer_payment_allocations(id,customer_payment_id,sale_id,amount)
values
('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',500000),
('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000003',415000)
on conflict(id) do nothing;

with cat as (select id from public.finance_categories where code='PACKAGING'),
ins as (
  insert into public.finance_documents(
    id,document_code,document_type,document_status,occurred_at,counterparty_name,payment_method,
    cash_amount,transfer_amount,total_amount,source_type,note,posted_at
  )
  values(
    '94000000-0000-0000-0000-000000000001','PC-DEMO-001','EXPENSE','POSTED',
    '2026-10-02 15:30:00+07','Nhà cung cấp bao bì [DEMO]','TRANSFER',0,350000,350000,
    'MANUAL','[DEMO] Mua thùng carton và băng keo','2026-10-02 15:30:00+07'
  )
  on conflict(id) do nothing returning id
)
insert into public.finance_document_lines(id,document_id,category_id,description,amount,line_order)
select '95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',cat.id,'[DEMO] Thùng carton và băng keo',350000,1
from cat
on conflict(id) do nothing;

insert into public.finance_transactions(
  id,tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,note,
  finance_document_id,payment_method,status
)
select
  '96000000-0000-0000-0000-000000000001','EXPENSE','PACKAGING',c.id,350000,
  'FINANCE_DOCUMENT','94000000-0000-0000-0000-000000000001','2026-10-02 15:30:00+07',
  '[DEMO] Chi phí đóng gói','94000000-0000-0000-0000-000000000001','TRANSFER','POSTED'
from public.finance_categories c where c.code='PACKAGING'
on conflict(id) do nothing;

insert into public.finance_documents(
  id,document_code,document_type,document_status,occurred_at,counterparty_name,payment_method,
  cash_amount,transfer_amount,total_amount,source_type,note
)
values(
  '94000000-0000-0000-0000-000000000002','PC-DEMO-002','EXPENSE','DRAFT',
  '2026-10-02 20:10:00+07','Nhà cung cấp phần mềm [DEMO]','TRANSFER',0,120000,120000,
  'MANUAL','[DEMO] Phiếu nháp gia hạn phần mềm'
)
on conflict(id) do nothing;

insert into public.finance_document_lines(id,document_id,category_id,description,amount,line_order)
select '95000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002',c.id,'[DEMO] Gia hạn phần mềm',120000,1
from public.finance_categories c where c.code='SOFTWARE'
on conflict(id) do nothing;
