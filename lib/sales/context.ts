import { buildTransferDescription,buildVietQRUrl } from '@/lib/vietqr'

export async function fetchSaleContext(supabase:any,saleId?:string|null){
  if(!saleId)return {sale:null,bankConfig:null,receiptQR:'',receiptQRAmount:0,receiptQRDescription:''}

  const [saleResult,bankResult]=await Promise.all([
    supabase.from('sales')
      .select('id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,note,subtotal,discount_amount,other_fee,sale_status,cash_received,change_amount,warehouse_id,created_by,archived_at,archived_by,warehouses(id,code,name,address),customers(id,name,phone,address),sale_items(id,quantity,sale_price,unit_cost,product_variant_id,product_variants(id,variant_name,barcode,products(id,sku,name))),sale_payments(id,method,amount,tendered_amount,change_amount,reference_code,created_at),sale_returns(id,return_type,reason,return_value,debt_relief,refund_amount,created_at,sale_return_items(sale_item_id,quantity))')
      .eq('id',saleId)
      .maybeSingle(),
    supabase.from('bank_transfer_configs')
      .select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active')
      .eq('config_key','DEFAULT')
      .maybeSingle(),
  ])

  const sale=(saleResult.data??null) as any
  const bankConfig=(bankResult.data??null) as any
  const transferPayment=sale
    ? (sale.sale_payments??[]).find((payment:any)=>payment.method==='TRANSFER')
    : null
  const receiptQRAmount=sale&&sale.sale_status==='COMPLETED'
    ? Number(sale.debt_amount)>0
      ? Number(sale.debt_amount)
      : Number(transferPayment?.amount??0)
    : 0
  const receiptQRReference=sale
    ? String(
        Number(sale.debt_amount)>0
          ? sale.invoice_code??sale.id
          : transferPayment?.reference_code??sale.invoice_code??sale.id
      )
    : ''
  const receiptQRDescription=sale&&bankConfig
    ? buildTransferDescription(bankConfig.transfer_prefix,receiptQRReference)
    : ''
  const receiptQR=sale&&bankConfig?.is_active&&receiptQRAmount>0
    ? buildVietQRUrl(bankConfig,receiptQRAmount,receiptQRDescription,'qr_only')
    : ''

  return {sale,bankConfig,receiptQR,receiptQRAmount,receiptQRDescription}
}
