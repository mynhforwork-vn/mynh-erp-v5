'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'

type POSItemInput={
  product_variant_id:string
  quantity:number
  sale_price:number
}

type POSPaymentInput={
  method:'CASH'|'TRANSFER'
  amount:number
  tendered_amount?:number|null
}

export type POSCheckoutInput={
  warehouse_id:string
  customer_id?:string|null
  items:POSItemInput[]
  discount_amount?:number
  other_fee?:number
  payments?:POSPaymentInput[]
  note?:string|null
}

async function actor(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role)){
    throw new Error('Không có quyền thực hiện bán hàng')
  }
  return {supabase,user}
}

export async function checkoutPOS(input:POSCheckoutInput){
  const {supabase}=await actor()

  if(!input?.warehouse_id)throw new Error('Chưa chọn Kho bán')
  if(!Array.isArray(input.items)||!input.items.length)throw new Error('Giỏ hàng đang trống')
  if(input.items.length>200)throw new Error('Tối đa 200 dòng sản phẩm mỗi hóa đơn')

  const items=input.items.map(item=>({
    product_variant_id:String(item.product_variant_id??''),
    quantity:Number(item.quantity),
    sale_price:Number(item.sale_price),
  }))

  for(const item of items){
    if(!item.product_variant_id)throw new Error('Có sản phẩm thiếu SKU')
    if(!Number.isInteger(item.quantity)||item.quantity<=0)throw new Error('Số lượng bán không hợp lệ')
    if(!Number.isFinite(item.sale_price)||item.sale_price<0)throw new Error('Giá bán không hợp lệ')
  }

  const payments=(input.payments??[]).map(payment=>({
    method:payment.method,
    amount:Number(payment.amount),
    tendered_amount:payment.tendered_amount===null||payment.tendered_amount===undefined
      ? null
      : Number(payment.tendered_amount),
  }))

  const {data,error}=await supabase.rpc('create_pos_sale',{
    p_warehouse_id:input.warehouse_id,
    p_customer_id:input.customer_id||null,
    p_items:items,
    p_discount_amount:Number(input.discount_amount??0),
    p_other_fee:Number(input.other_fee??0),
    p_payments:payments,
    p_note:String(input.note??'').trim()||null,
  })
  if(error)throw new Error(error.message)

  revalidatePath('/sales')
  revalidatePath('/sales/pos')
  revalidatePath('/sales/history')
  revalidatePath('/sales/customers')
  revalidatePath('/sales/debt')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/inventory')
  revalidatePath('/warehouse/history')
  revalidatePath('/finance')
  revalidatePath('/finance/cashflow')

  return data as {
    sale_id:string
    invoice_code:string
    subtotal:number
    discount_amount:number
    other_fee:number
    total_amount:number
    paid_amount:number
    debt_amount:number
    payment_status:string
    cash_received:number
    change_amount:number
  }
}

export async function createPOSCustomer(input:{name:string,phone?:string,address?:string}){
  const {supabase}=await actor()

  const name=String(input?.name??'').trim()
  const phone=String(input?.phone??'').trim()||null
  const address=String(input?.address??'').trim()||null
  if(!name)throw new Error('Chưa nhập tên khách hàng')

  if(phone){
    const {data:existing,error:existingError}=await supabase
      .from('customers')
      .select('id,name,phone,address')
      .eq('phone',phone)
      .maybeSingle()
    if(existingError)throw new Error(existingError.message)
    if(existing)return existing
  }

  const {data,error}=await supabase
    .from('customers')
    .insert({name,phone,address})
    .select('id,name,phone,address')
    .single()
  if(error)throw new Error(error.message)

  revalidatePath('/sales/customers')
  revalidatePath('/sales/pos')
  return data
}
