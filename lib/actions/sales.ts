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
  reference_code?:string|null
}

export type POSCheckoutInput={
  warehouse_id:string
  customer_id?:string|null
  items:POSItemInput[]
  discount_amount?:number
  other_fee?:number
  payments?:POSPaymentInput[]
  note?:string|null
  invoice_code?:string|null
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
      reference_code:String(payment.reference_code??'').trim()||null,
    }))

    const {data,error}=await supabase.rpc('create_pos_sale_v2',{
      p_warehouse_id:input.warehouse_id,
      p_customer_id:input.customer_id||null,
      p_items:items,
      p_discount_amount:Number(input.discount_amount??0),
      p_other_fee:Number(input.other_fee??0),
      p_payments:payments,
      p_note:String(input.note??'').trim()||null,
      p_invoice_code:String(input.invoice_code??'').trim()||null,
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

export async function reservePOSInvoiceCode(){
  try{
    const {supabase}=await actor()
    const {data,error}=await supabase.rpc('reserve_pos_invoice_code')
    if(error)return {ok:false as const,error:'Không thể tạo mã phiếu bán'}
    const code=String(data??'').trim()
    if(!code)return {ok:false as const,error:'Không thể tạo mã phiếu bán'}
    return {ok:true as const,data:code}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể tạo mã phiếu bán')}
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
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể tạo khách hàng')}
  }
}


export async function saveBankTransferConfig(formData:FormData){
  try{
    const {supabase}=await actor()

    const bank_id=String(formData.get('bank_id')??'').trim()
    const bank_name=String(formData.get('bank_name')??'').trim()
    const account_no=String(formData.get('account_no')??'').trim().replace(/\s+/g,'')
    const account_name=String(formData.get('account_name')??'').trim()
    const qr_template=String(formData.get('qr_template')??'compact2').trim()||'compact2'
    const transfer_prefix=String(formData.get('transfer_prefix')??'MYNH')
      .trim()
      .replace(/[^A-Za-z0-9]/g,'')
      .toUpperCase()
      .slice(0,12)||'MYNH'
    const is_active=formData.get('is_active')==='on'

    if(!bank_id)return {ok:false as const,error:'Chưa nhập Bank ID / mã BIN'}
    if(!bank_name)return {ok:false as const,error:'Chưa nhập tên ngân hàng'}
    if(!account_no)return {ok:false as const,error:'Chưa nhập số tài khoản'}
    if(!account_name)return {ok:false as const,error:'Chưa nhập tên tài khoản'}

    const {error}=await supabase.from('bank_transfer_configs').upsert({
      config_key:'DEFAULT',
      bank_id,
      bank_name,
      account_no,
      account_name,
      qr_template,
      transfer_prefix,
      is_active,
      updated_at:new Date().toISOString(),
    },{onConflict:'config_key'})

    if(error)return {ok:false as const,error:error.message}

    revalidatePath('/settings')
    revalidatePath('/sales/pos')
    revalidatePath('/sales/history')
    return {ok:true as const}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể lưu cấu hình chuyển khoản')}
  }
}
