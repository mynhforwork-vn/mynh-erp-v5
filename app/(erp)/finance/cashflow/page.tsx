import { requireUser } from '@/lib/supabase/auth'
import { FinanceCashflowWorkspace } from '@/components/finance-cashflow-workspace'

export default async function CashflowPage(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')

  const [categoryResult,documentResult,transactionResult]=await Promise.all([
    supabase.from('finance_categories')
      .select('id,code,name,tx_type,parent_id,sort_order,is_active,is_system,note,created_at,updated_at')
      .order('tx_type')
      .order('sort_order')
      .order('name'),
    supabase.from('finance_documents')
      .select('id,document_code,document_type,document_status,occurred_at,counterparty_name,payment_method,cash_amount,transfer_amount,total_amount,source_type,source_id,note,created_by,posted_at,cancelled_at,cancellation_reason,created_at,updated_at,finance_document_lines(id,category_id,description,amount,line_order,reference_type,reference_id,finance_categories(id,code,name,tx_type,parent_id))')
      .order('occurred_at',{ascending:false})
      .limit(500),
    supabase.from('finance_transactions')
      .select('id,tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,note,created_at,finance_document_id,payment_method,status,voided_at,void_reason')
      .order('transaction_at',{ascending:false})
      .limit(1000),
  ])

  const documents=(documentResult.data??[]) as any[]
  const transactions=(transactionResult.data??[]) as any[]

  const customerPaymentIds=[...new Set([
    ...documents.filter(x=>x.source_type==='CUSTOMER_PAYMENT'&&x.source_id).map(x=>String(x.source_id)),
    ...transactions.filter(x=>x.reference_type==='CUSTOMER_PAYMENT'&&x.reference_id).map(x=>String(x.reference_id)),
  ])]
  const shipperPaymentIds=[...new Set([
    ...documents.filter(x=>x.source_type==='SHIPPER_SETTLEMENT'&&x.source_id).map(x=>String(x.source_id)),
    ...transactions.filter(x=>x.reference_type==='SHIPPER_PAYMENT'&&x.reference_id).map(x=>String(x.reference_id)),
  ])]
  const directSaleIds=[...new Set(
    transactions.filter(x=>x.reference_type==='SALE'&&x.reference_id).map(x=>String(x.reference_id))
  )]

  const [customerPaymentResult,allocationResult,shipperPaymentResult]=await Promise.all([
    customerPaymentIds.length
      ? supabase.from('customer_payments')
          .select('id,customer_id,amount,paid_at,note,receipt_code,payment_method,cash_amount,transfer_amount,customers(id,name,phone,address)')
          .in('id',customerPaymentIds)
      : Promise.resolve({data:[],error:null} as any),
    customerPaymentIds.length
      ? supabase.from('customer_payment_allocations')
          .select('id,customer_payment_id,sale_id,amount,created_at')
          .in('customer_payment_id',customerPaymentIds)
      : Promise.resolve({data:[],error:null} as any),
    shipperPaymentIds.length
      ? supabase.from('shipper_payments')
          .select('id,destination_hub,shipper_id,shipper_name,total_cod,actual_transferred,tip,transferred_at,note,destination_shippers(name,phone),warehouses(code,name),shipper_payment_details(order_id,cod_snapshot,orders(id,shopee_order_id,destination_hub,recipient_name,recipient_phone,receive_status,shipments(tracking_number,current_tracking_status)))')
          .in('id',shipperPaymentIds)
      : Promise.resolve({data:[],error:null} as any),
  ])

  const allocationSaleIds=((allocationResult.data??[]) as any[]).map(x=>String(x.sale_id)).filter(Boolean)
  const saleIds=[...new Set([...directSaleIds,...allocationSaleIds])]
  const saleResult=saleIds.length
    ? await supabase.from('sales')
        .select('id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,note,subtotal,discount_amount,other_fee,sale_status,cash_received,change_amount,warehouse_id,created_by,archived_at,archived_by,warehouses(id,code,name,address),customers(id,name,phone,address),sale_items(id,quantity,sale_price,unit_cost,product_variant_id,product_variants(id,variant_name,barcode,products(id,sku,name))),sale_payments(id,method,amount,tendered_amount,change_amount,reference_code,created_at),sale_returns(id,return_type,reason,return_value,debt_relief,refund_amount,created_at,sale_return_items(sale_item_id,quantity))')
        .in('id',saleIds)
    : ({data:[],error:null} as any)

  const errors=[
    categoryResult.error,documentResult.error,transactionResult.error,
    customerPaymentResult.error,allocationResult.error,shipperPaymentResult.error,saleResult.error,
  ].filter(Boolean).map((x:any)=>x.message)

  return <FinanceCashflowWorkspace
    categories={(categoryResult.data??[]) as any[]}
    documents={documents}
    transactions={transactions}
    customerPayments={(customerPaymentResult.data??[]) as any[]}
    customerPaymentAllocations={(allocationResult.data??[]) as any[]}
    shipperPayments={(shipperPaymentResult.data??[]) as any[]}
    referencedSales={(saleResult.data??[]) as any[]}
    canEdit={['admin','operator'].includes(role)}
    loadError={errors.join(' · ')||null}
  />
}
