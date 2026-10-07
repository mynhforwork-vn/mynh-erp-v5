'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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
        .is('archived_at',null)
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

export async function saveDocumentPrintConfig(formData:FormData){
  try{
    const {supabase}=await actor()

    const document_key=String(formData.get('document_key')??'').trim().toUpperCase()
    if(!['SALE_INVOICE','DEBT_RECEIPT'].includes(document_key)){
      return {ok:false as const,error:'Loại chứng từ không hợp lệ'}
    }

    const brand_name=String(formData.get('brand_name')??'MYNH ERP').trim().slice(0,80)
    const title=String(formData.get('title')??'').trim().slice(0,120)
    const header_note=String(formData.get('header_note')??'').trim().slice(0,200)||null
    const footer_text=String(formData.get('footer_text')??'').trim().slice(0,300)||null
    const paperRaw=String(formData.get('paper_size')??'A4').trim().toUpperCase()
    const paper_size=['A4','A5','RECEIPT_80'].includes(paperRaw)?paperRaw:'A4'

    if(!brand_name)return {ok:false as const,error:'Tên thương hiệu không được để trống'}
    if(!title)return {ok:false as const,error:'Tiêu đề chứng từ không được để trống'}

    const payload={
      document_key,
      brand_name,
      title,
      header_note,
      paper_size,
      footer_text,
      show_customer_phone:formData.get('show_customer_phone')==='on',
      show_warehouse:formData.get('show_warehouse')==='on',
      show_sku:formData.get('show_sku')==='on',
      show_variant:formData.get('show_variant')==='on',
      show_qr:formData.get('show_qr')==='on',
      show_signature:formData.get('show_signature')==='on',
      show_invoice_details:formData.get('show_invoice_details')==='on',
      is_active:formData.get('is_active')==='on',
      updated_at:new Date().toISOString(),
    }

    const {data,error}=await supabase
      .from('document_print_configs')
      .upsert(payload,{onConflict:'document_key'})
      .select('document_key,brand_name,title,header_note,paper_size,footer_text,show_customer_phone,show_warehouse,show_sku,show_variant,show_qr,show_signature,show_invoice_details,is_active')
      .single()

    if(error)return {ok:false as const,error:error.message}

    revalidatePath('/settings')
    revalidatePath('/sales/pos')
    revalidatePath('/sales/debt')
    revalidatePath('/sales/history')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể lưu cấu hình mẫu in')}
  }
}


export async function createSalesCustomer(formData:FormData):Promise<void>{
  const name=String(formData.get('name')??'').trim()
  const phone=String(formData.get('phone')??'').trim()
  const address=String(formData.get('address')??'').trim()
  const result=await createPOSCustomer({name,phone,address})
  if(!result.ok)throw new Error(result.error)
  revalidatePath('/sales/customers')
  revalidatePath('/sales/pos')
}

export async function registerCustomerDebtPayment(input:{
  customer_id:string
  amount:number
  payment_method:'CASH'|'TRANSFER'|'COMBINED'
  cash_amount?:number
  transfer_amount?:number
  note?:string|null
  receipt_code?:string|null
  allocations?:{sale_id:string,amount:number}[]
}){
  try{
    const {supabase}=await actor()
    const customer_id=String(input?.customer_id??'').trim()
    const amount=Number(input?.amount??0)
    const method=String(input?.payment_method??'CASH').toUpperCase() as 'CASH'|'TRANSFER'|'COMBINED'
    const cash_amount=Math.max(0,Number(input?.cash_amount??0))
    const transfer_amount=Math.max(0,Number(input?.transfer_amount??0))
    const receipt_code=String(input?.receipt_code??'').trim()||null
    const note=String(input?.note??'').trim()||null
    const allocations=Array.isArray(input?.allocations)
      ? input.allocations
          .map(x=>({sale_id:String(x.sale_id??''),amount:Number(x.amount??0)}))
          .filter(x=>x.sale_id&&Number.isFinite(x.amount)&&x.amount>0)
      : []

    if(!customer_id)return {ok:false as const,error:'Thiếu khách hàng'}
    if(!Number.isFinite(amount)||amount<=0)return {ok:false as const,error:'Số tiền thu phải lớn hơn 0'}
    if(!['CASH','TRANSFER','COMBINED'].includes(method))return {ok:false as const,error:'Phương thức thanh toán không hợp lệ'}
    if(method==='COMBINED'&&Math.round((cash_amount+transfer_amount)*100)!==Math.round(amount*100)){
      return {ok:false as const,error:'Tiền mặt + Chuyển khoản phải bằng số tiền thu'}
    }

    const {data,error}=await supabase.rpc('register_customer_payment_v2',{
      p_customer_id:customer_id,
      p_amount:amount,
      p_payment_method:method,
      p_cash_amount:method==='CASH'?amount:method==='TRANSFER'?0:cash_amount,
      p_transfer_amount:method==='TRANSFER'?amount:method==='CASH'?0:transfer_amount,
      p_note:note,
      p_receipt_code:receipt_code,
      p_allocations:allocations.length?allocations:null,
    })

    if(error){
      const raw=String(error.message??'')
      const friendly=
        raw.includes('exceed outstanding debt')?'Số tiền thu vượt công nợ hiện tại':
        raw.includes('Allocation total')?'Tổng phân bổ phải bằng số tiền thu':
        raw.includes('Allocation exceeds')?'Phân bổ vượt số nợ của hóa đơn':
        raw.includes('no outstanding debt')?'Khách hàng không còn công nợ':
        raw.includes('Combined payment')?'Tiền mặt + Chuyển khoản phải bằng số tiền thu':
        'Không thể ghi nhận phiếu thu nợ'
      return {ok:false as const,error:friendly,detail:raw}
    }

    revalidatePath('/sales')
    revalidatePath('/sales/history')
    revalidatePath('/sales/customers')
    revalidatePath('/sales/debt')
    revalidatePath('/finance')
    revalidatePath('/finance/cashflow')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể ghi nhận phiếu thu nợ')}
  }
}

export async function createSalesProductCategory(input:{name:string}){
  try{
    const {supabase}=await actor()
    const name=String(input?.name??'').trim()
    if(!name)return {ok:false as const,error:'Chưa nhập tên phân loại'}
    const {data,error}=await supabase
      .from('sales_product_categories')
      .insert({name,sort_order:999})
      .select('id,name,sort_order,is_active')
      .single()
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/sales/pos')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể tạo phân loại')}
  }
}

export async function updateSalesProductCategory(input:{id:string,name?:string,is_active?:boolean,sort_order?:number}){
  try{
    const {supabase}=await actor()
    const id=String(input?.id??'').trim()
    if(!id)return {ok:false as const,error:'Thiếu phân loại'}
    const patch:any={updated_at:new Date().toISOString()}
    if(input.name!==undefined){
      const name=String(input.name).trim()
      if(!name)return {ok:false as const,error:'Tên phân loại không được để trống'}
      patch.name=name
    }
    if(input.is_active!==undefined)patch.is_active=Boolean(input.is_active)
    if(input.sort_order!==undefined)patch.sort_order=Math.trunc(Number(input.sort_order)||0)
    const {data,error}=await supabase
      .from('sales_product_categories')
      .update(patch)
      .eq('id',id)
      .select('id,name,sort_order,is_active')
      .single()
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/sales/pos')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể cập nhật phân loại')}
  }
}

export async function assignProductSalesCategory(input:{product_id:string,category_id:string|null}){
  try{
    const {supabase}=await actor()
    const product_id=String(input?.product_id??'').trim()
    const category_id=input?.category_id?String(input.category_id):null
    if(!product_id)return {ok:false as const,error:'Thiếu sản phẩm'}
    const {error}=await supabase.from('products').update({sales_category_id:category_id}).eq('id',product_id)
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/sales/pos')
    return {ok:true as const}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể gắn phân loại')}
  }
}



export async function cancelPOSSale(input:{sale_id:string,reason?:string|null}){
  try{
    const {supabase}=await actor()
    const sale_id=String(input?.sale_id??'').trim()
    const reason=String(input?.reason??'').trim()||null
    if(!sale_id)return {ok:false as const,error:'Thiếu hóa đơn cần huỷ'}

    const {data,error}=await supabase.rpc('cancel_pos_sale',{
      p_sale_id:sale_id,
      p_reason:reason,
    })
    if(error){
      const raw=String(error.message??'')
      const friendly=
        raw.includes('không tìm thấy')||raw.includes('Không tìm thấy')?'Không tìm thấy hóa đơn':
        raw.includes('Chỉ có thể huỷ')?'Hóa đơn không còn ở trạng thái cho phép huỷ':
        raw.includes('đã có nghiệp vụ')?'Hóa đơn đã được huỷ/hoàn trước đó':
        raw.includes('Operator role required')?'Bạn không có quyền huỷ hóa đơn':
        'Không thể huỷ hóa đơn'
      return {ok:false as const,error:friendly,detail:raw}
    }

    for(const path of [
      '/sales','/sales/history','/sales/customers','/sales/debt',
      '/warehouse','/warehouse/inventory','/warehouse/history',
      '/finance','/finance/cashflow',
    ])revalidatePath(path)

    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể huỷ hóa đơn')}
  }
}


export async function returnPOSSale(input:{
  sale_id:string
  items:{sale_item_id:string,quantity:number}[]
  reason?:string|null
}){
  try{
    const {supabase}=await actor()
    const sale_id=String(input?.sale_id??'').trim()
    const reason=String(input?.reason??'').trim()||null
    const items=(input?.items??[])
      .map(item=>({
        sale_item_id:String(item.sale_item_id??'').trim(),
        quantity:Math.trunc(Number(item.quantity??0)),
      }))
      .filter(item=>item.sale_item_id&&item.quantity>0)

    if(!sale_id)return {ok:false as const,error:'Thiếu hóa đơn cần hoàn'}
    if(!items.length)return {ok:false as const,error:'Chưa chọn sản phẩm hoàn'}
    if(items.length>200)return {ok:false as const,error:'Tối đa 200 dòng hoàn hàng mỗi lần'}

    const {data,error}=await supabase.rpc('return_pos_sale',{
      p_sale_id:sale_id,
      p_items:items,
      p_reason:reason,
    })
    if(error){
      const raw=String(error.message??'')
      const friendly=
        raw.includes('không tìm thấy')||raw.includes('Không tìm thấy')?'Không tìm thấy hóa đơn':
        raw.includes('không còn ở trạng thái')?'Hóa đơn không còn ở trạng thái cho phép hoàn hàng':
        raw.includes('Số lượng hoàn')?'Số lượng hoàn vượt quá số lượng còn có thể trả':
        raw.includes('Chưa chọn sản phẩm')?'Chưa chọn sản phẩm hoàn':
        raw.includes('Operator role required')?'Bạn không có quyền hoàn hàng':
        'Không thể hoàn hàng'
      return {ok:false as const,error:friendly,detail:raw}
    }

    for(const path of [
      '/sales','/sales/history','/sales/customers','/sales/debt',
      '/warehouse','/warehouse/inventory','/warehouse/history',
      '/finance','/finance/cashflow',
    ])revalidatePath(path)

    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể hoàn hàng')}
  }
}


export async function updateSalesCustomerForm(formData:FormData):Promise<void>{
  const {supabase}=await actor()
  const customerId=String(formData.get('customer_id')??'').trim()
  const name=String(formData.get('name')??'').trim()
  const phone=String(formData.get('phone')??'').trim()||null
  const address=String(formData.get('address')??'').trim()||null
  const note=String(formData.get('note')??'').trim()||null
  if(!customerId)throw new Error('Thiếu khách hàng')
  if(!name)throw new Error('Tên khách hàng là bắt buộc')

  const {error}=await supabase.rpc('update_sales_customer',{
    p_customer_id:customerId,p_name:name,p_phone:phone,p_address:address,p_note:note,
  })
  if(error)throw new Error(error.message)

  revalidatePath('/sales/customers')
  revalidatePath('/sales/pos')
  revalidatePath('/sales/debt')
  redirect('/sales/customers?customer='+encodeURIComponent(customerId)+'&tab=info')
}

export async function archiveSalesCustomerForm(formData:FormData):Promise<void>{
  const {supabase}=await actor()
  const customerId=String(formData.get('customer_id')??'').trim()
  if(!customerId)throw new Error('Thiếu khách hàng')
  const {error}=await supabase.rpc('archive_sales_customer',{p_customer_id:customerId})
  if(error)throw new Error(error.message)
  revalidatePath('/sales/customers')
  revalidatePath('/sales/pos')
  redirect('/sales/customers?archive=archived&customer='+encodeURIComponent(customerId)+'&tab=info')
}

export async function restoreSalesCustomerForm(formData:FormData):Promise<void>{
  const {supabase}=await actor()
  const customerId=String(formData.get('customer_id')??'').trim()
  if(!customerId)throw new Error('Thiếu khách hàng')
  const {error}=await supabase.rpc('restore_sales_customer',{p_customer_id:customerId})
  if(error)throw new Error(error.message)
  revalidatePath('/sales/customers')
  revalidatePath('/sales/pos')
  redirect('/sales/customers?customer='+encodeURIComponent(customerId)+'&tab=info')
}


export async function archivePOSSalesBulk(ids:string[]){
  try{
    const {supabase}=await actor()
    const saleIds=[...new Set((ids??[]).map(x=>String(x).trim()).filter(Boolean))]
    if(!saleIds.length)return {ok:false as const,error:'Chưa chọn hóa đơn'}
    if(saleIds.length>200)return {ok:false as const,error:'Tối đa 200 hóa đơn mỗi lần'}
    const {data,error}=await supabase.rpc('archive_pos_sales',{p_sale_ids:saleIds})
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/sales/history')
    return {ok:true as const,count:Number(data??0)}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể lưu trữ hóa đơn')}
  }
}

export async function restorePOSSalesBulk(ids:string[]){
  try{
    const {supabase}=await actor()
    const saleIds=[...new Set((ids??[]).map(x=>String(x).trim()).filter(Boolean))]
    if(!saleIds.length)return {ok:false as const,error:'Chưa chọn hóa đơn'}
    if(saleIds.length>200)return {ok:false as const,error:'Tối đa 200 hóa đơn mỗi lần'}
    const {data,error}=await supabase.rpc('restore_pos_sales',{p_sale_ids:saleIds})
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/sales/history')
    return {ok:true as const,count:Number(data??0)}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể khôi phục hóa đơn')}
  }
}
