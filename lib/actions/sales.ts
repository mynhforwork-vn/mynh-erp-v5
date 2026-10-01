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
  try{
    const {supabase}=await actor()

    if(!input?.warehouse_id)return {ok:false as const,error:'Chưa chọn Kho bán'}
    if(!Array.isArray(input.items)||!input.items.length)return {ok:false as const,error:'Giỏ hàng đang trống'}
    if(input.items.length>200)return {ok:false as const,error:'Tối đa 200 dòng sản phẩm mỗi hóa đơn'}

    const items=input.items.map(item=>({
      product_variant_id:String(item.product_variant_id??''),
      quantity:Number(item.quantity),
      sale_price:Number(item.sale_price),
    }))

    for(const item of items){
      if(!item.product_variant_id)return {ok:false as const,error:'Có sản phẩm thiếu SKU'}
      if(!Number.isInteger(item.quantity)||item.quantity<=0)return {ok:false as const,error:'Số lượng bán không hợp lệ'}
      if(!Number.isFinite(item.sale_price)||item.sale_price<0)return {ok:false as const,error:'Giá bán không hợp lệ'}
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
    if(error){
      const raw=String(error.message??'')
      const friendly=
        raw.includes('Không đủ tồn kho')?'Không đủ tồn kho cho một hoặc nhiều sản phẩm':
        raw.includes('Cần chọn khách hàng')?'Cần gắn khách hàng khi hóa đơn còn công nợ':
        raw.includes('Tiền khách đưa')?'Tiền khách đưa nhỏ hơn số tiền cần thu':
        raw.includes('Giảm giá')?'Giảm giá không hợp lệ':
        'Không thể hoàn tất hóa đơn POS'
      return {ok:false as const,error:friendly,detail:raw}
    }

    revalidatePath('/sales')
    revalidatePath('/sales/history')
    revalidatePath('/sales/customers')
    revalidatePath('/sales/debt')
    revalidatePath('/warehouse')
    revalidatePath('/warehouse/inventory')
    revalidatePath('/warehouse/history')
    revalidatePath('/finance')
    revalidatePath('/finance/cashflow')

    return {ok:true as const,data:data as {
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
    }}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể hoàn tất hóa đơn POS')}
  }
}

export async function createPOSCustomer(input:{name:string,phone?:string,address?:string}){
  try{
    const {supabase}=await actor()

    const name=String(input?.name??'').trim()
    const phone=String(input?.phone??'').trim()||null
    const address=String(input?.address??'').trim()||null
    if(!name)return {ok:false as const,error:'Chưa nhập tên khách hàng'}

    if(phone){
      const {data:existing,error:existingError}=await supabase
        .from('customers')
        .select('id,name,phone,address')
        .eq('phone',phone)
        .maybeSingle()
      if(existingError)return {ok:false as const,error:'Không thể tìm khách hàng'}
      if(existing)return {ok:true as const,data:existing}
    }

    const {data,error}=await supabase
      .from('customers')
      .insert({name,phone,address})
      .select('id,name,phone,address')
      .single()
    if(error)return {ok:false as const,error:'Không thể tạo khách hàng'}

    revalidatePath('/sales/customers')
    revalidatePath('/sales/pos')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể tạo khách hàng')}
  }
}
