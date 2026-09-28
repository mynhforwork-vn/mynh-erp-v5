'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { nextTrackAt } from '@/lib/tracking/schedule'

function text(v:FormDataEntryValue|null){return String(v??'').trim()}
async function actor(){
  const {supabase,user}=await requireUser(); const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role))throw new Error('Không có quyền thực hiện thao tác này')
  return {supabase,user,role}
}

export async function createERPUser(formData:FormData){
  const {supabase}=await actor()
  const {data,error}=await supabase.rpc('create_erp_user_full',{
    p_username:text(formData.get('username')),
    p_phone:text(formData.get('phone'))||null,
    p_email:text(formData.get('email'))||null,
    p_status:text(formData.get('status'))||'Active',
    p_mobile:formData.get('mobile')==='on',
    p_web:formData.get('web')==='on',
    p_voucher_summary:text(formData.get('voucher_summary'))||null,
    p_note:text(formData.get('note'))||null,
    p_password:text(formData.get('password'))||null,
    p_spc_st:text(formData.get('spc_st'))||null,
    p_spc_f:text(formData.get('spc_f'))||null,
  })
  if(error)throw new Error(error.message)
  const browserName=text(formData.get('browser_name'))||null
  const {error:browserError}=await supabase.from('erp_users').update({browser_name:browserName}).eq('id',data)
  if(browserError)throw new Error(browserError.message)
  revalidatePath('/purchase/accounts')
  redirect(`/purchase/accounts?user=${data}`)
}

export async function updateERPUser(formData:FormData){
  const {supabase}=await actor()
  const userId=text(formData.get('user_id'))
  if(!userId)throw new Error('Thiếu tài khoản cần cập nhật')
  const {data,error}=await supabase.rpc('update_erp_user_full',{
    p_user_id:userId,
    p_username:text(formData.get('username')),
    p_phone:text(formData.get('phone'))||null,
    p_email:text(formData.get('email'))||null,
    p_status:text(formData.get('status'))||'Active',
    p_mobile:formData.get('mobile')==='on',
    p_web:formData.get('web')==='on',
    p_voucher_summary:text(formData.get('voucher_summary'))||null,
    p_note:text(formData.get('note'))||null,
    p_password:text(formData.get('password'))||null,
    p_spc_st:text(formData.get('spc_st'))||null,
    p_spc_f:text(formData.get('spc_f'))||null,
  })
  if(error)throw new Error(error.message)
  const browserName=text(formData.get('browser_name'))||null
  const {error:browserError}=await supabase.from('erp_users').update({browser_name:browserName}).eq('id',userId)
  if(browserError)throw new Error(browserError.message)
  revalidatePath('/purchase/accounts')
  redirect(`/purchase/accounts?user=${data}`)
}

function numberOrNull(v:FormDataEntryValue|null){
  const s=text(v)
  if(!s)return null
  const n=Number(s)
  return Number.isFinite(n)?n:null
}

function localDateTime(v:FormDataEntryValue|null){
  const s=text(v)
  if(!s)return null
  const normalized=/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:`${s.length===16?s+':00':s}+07:00`
  const d=new Date(normalized)
  return Number.isNaN(d.getTime())?null:d.toISOString()
}

function itemPayload(formData:FormData){
  const names=formData.getAll('item_product_name').map(v=>text(v))
  const skus=formData.getAll('item_sku').map(v=>text(v))
  const variants=formData.getAll('item_variant').map(v=>text(v))
  const quantities=formData.getAll('item_quantity').map(v=>Number(text(v)||1))
  const originals=formData.getAll('item_original_price').map(v=>numberOrNull(v))
  const finals=formData.getAll('item_final_price').map(v=>numberOrNull(v))
  return names.map((product_name,i)=>({
    product_name,
    sku:skus[i]||null,
    variant:variants[i]||null,
    quantity:Number.isFinite(quantities[i])&&quantities[i]>0?quantities[i]:1,
    original_price:originals[i],
    final_price:finals[i],
  })).filter(x=>x.product_name)
}

function voucherPayload(formData:FormData){
  const codes=formData.getAll('voucher_code').map(v=>text(v))
  const names=formData.getAll('voucher_name').map(v=>text(v))
  const types=formData.getAll('voucher_type').map(v=>text(v))
  const tags=formData.getAll('voucher_tag').map(v=>text(v))
  const accounts=formData.getAll('voucher_account').map(v=>text(v))
  const len=Math.max(codes.length,names.length,types.length,tags.length,accounts.length)
  return Array.from({length:len},(_,i)=>({
    voucher_code:codes[i]||null,
    voucher_name:names[i]||null,
    voucher_type:types[i]||null,
    voucher_tag:tags[i]||null,
    voucher_account:accounts[i]||null,
  })).filter(x=>x.voucher_code||x.voucher_name||x.voucher_tag)
}

export async function createOrder(formData:FormData){
  const {supabase}=await actor()
  const {data,error}=await supabase.rpc('create_order_full',{
    p_shopee_order_id:text(formData.get('shopee_order_id'))||null,
    p_erp_user_id:text(formData.get('erp_user_id'))||null,
    p_order_date:localDateTime(formData.get('order_date')),
    p_recipient_name:text(formData.get('recipient_name'))||null,
    p_recipient_phone:text(formData.get('recipient_phone'))||null,
    p_recipient_address:text(formData.get('recipient_address'))||null,
    p_area:text(formData.get('area'))||null,
    p_destination_hub:text(formData.get('destination_hub'))||null,
    p_cod:numberOrNull(formData.get('cod'))??0,
    p_order_status:text(formData.get('order_status'))||'PENDING',
    p_payment_status:text(formData.get('payment_status'))||'UNPAID',
    p_tracking_number:text(formData.get('tracking_number'))||null,
    p_carrier:text(formData.get('carrier'))||null,
    p_items:itemPayload(formData),
    p_vouchers:voucherPayload(formData),
  })
  if(error)throw new Error(error.message)
  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/purchase/accounts'); revalidatePath('/')
  redirect(`/purchase/orders?order=${data}`)
}

export async function updateOrder(formData:FormData){
  const {supabase}=await actor()
  const orderId=text(formData.get('order_id'))
  if(!orderId)throw new Error('Thiếu đơn hàng cần cập nhật')
  const {data,error}=await supabase.rpc('update_order_full',{
    p_order_id:orderId,
    p_shopee_order_id:text(formData.get('shopee_order_id'))||null,
    p_erp_user_id:text(formData.get('erp_user_id'))||null,
    p_order_date:localDateTime(formData.get('order_date')),
    p_recipient_name:text(formData.get('recipient_name'))||null,
    p_recipient_phone:text(formData.get('recipient_phone'))||null,
    p_recipient_address:text(formData.get('recipient_address'))||null,
    p_area:text(formData.get('area'))||null,
    p_destination_hub:text(formData.get('destination_hub'))||null,
    p_cod:numberOrNull(formData.get('cod'))??0,
    p_order_status:text(formData.get('order_status'))||'PENDING',
    p_payment_status:text(formData.get('payment_status'))||'UNPAID',
    p_tracking_number:text(formData.get('tracking_number'))||null,
    p_carrier:text(formData.get('carrier'))||null,
    p_items:itemPayload(formData),
    p_vouchers:voucherPayload(formData),
  })
  if(error)throw new Error(error.message)
  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/purchase/accounts'); revalidatePath('/')
  redirect(`/purchase/orders?order=${data}`)
}


export async function confirmReceiveOrders(formData:FormData){
  const {supabase}=await actor()
  const orderIds=formData.getAll('order_ids').map(v=>text(v)).filter(Boolean)
  const warehouseId=text(formData.get('warehouse_id'))
  const note=text(formData.get('note'))||null
  if(!orderIds.length)throw new Error('Chưa chọn đơn cần xác nhận nhận hàng')
  if(!warehouseId)throw new Error('Chưa chọn kho nhận')

  const {data,error}=await supabase.rpc('confirm_receive_orders',{
    p_order_ids:orderIds,
    p_warehouse_id:warehouseId,
    p_note:note,
  })
  if(error)throw new Error(error.message)

  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  redirect(`/purchase/tracking?received=${encodeURIComponent(String(data?.receive_batch_id??''))}`)
}

export async function replaceShipment(formData:FormData){
  const {supabase,user}=await actor()
  const orderId=text(formData.get('order_id'))
  const trackingNumber=text(formData.get('tracking_number'))
  const carrier=text(formData.get('carrier'))||null
  if(!orderId||!trackingNumber)throw new Error('Thiếu đơn hàng hoặc mã vận đơn')

  const {data:old,error:oldError}=await supabase.from('shipments').select('id,tracking_number,carrier').eq('order_id',orderId).eq('is_active',true)
  if(oldError)throw new Error(oldError.message)
  const ids=(old??[]).map(x=>x.id)
  const previous=(old??[])[0]??null

  if(ids.length){
    const {error}=await supabase.from('shipments').update({
      is_active:false,replaced_at:new Date().toISOString(),tracking_enabled:false,next_track_at:null
    }).in('id',ids)
    if(error)throw new Error(error.message)
  }

  const next=nextTrackAt(new Date(),'READY_TO_SHIP')
  const {error:newError}=await supabase.from('shipments').insert({
    order_id:orderId,tracking_number:trackingNumber,carrier,
    current_tracking_status:'READY_TO_SHIP',tracking_enabled:true,
    tracking_interval_minutes:120,next_track_at:next?.toISOString()??null,is_active:true
  })
  if(newError){
    if(ids.length)await supabase.from('shipments').update({is_active:true,tracking_enabled:true}).in('id',ids)
    throw new Error(newError.message)
  }

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,module:'ORDERS',action:'UPDATE_TRACKING_NUMBER',
    entity_type:'ORDER',entity_id:orderId,
    old_value:{tracking_number:previous?.tracking_number??null,carrier:previous?.carrier??null},
    new_value:{tracking_number:trackingNumber,carrier},
    source:'USER'
  })

  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/')
  redirect(`/purchase/orders?order=${orderId}&tab=tracking`)
}
