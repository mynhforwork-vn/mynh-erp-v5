'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { nextTrackAt } from '@/lib/tracking/schedule'

function text(v:FormDataEntryValue|null){return String(v??'').trim()}

const RETURN_KEYS=['range','from','to','q','receive','receiveDate','status','hub','tracking','state','device','session','voucher','orders','browser','sort'] as const
function safeReturnParams(raw:string){
  const src=new URLSearchParams(raw)
  const out=new URLSearchParams()
  for(const key of RETURN_KEYS){
    const value=src.get(key)
    if(!value)continue
    if(key==='range'&&!['today','week','month','custom','7d','30d','quarter','year','all'].includes(value))continue
    if((key==='from'||key==='to')&&!/^\d{4}-\d{2}-\d{2}$/.test(value))continue
    if(value.length>200)continue
    out.set(key,value)
  }
  return out
}
function returnHref(path:string,raw:string,extra:Record<string,string|null|undefined>={}){
  const p=safeReturnParams(raw)
  for(const [k,v] of Object.entries(extra)){
    if(v===null||v===undefined||v==='')p.delete(k)
    else p.set(k,v)
  }
  const qs=p.toString()
  return path+(qs?'?'+qs:'')
}

async function actor(){
  const {supabase,user}=await requireUser(); const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role))throw new Error('Không có quyền thực hiện thao tác này')
  return {supabase,user,role}
}

export async function createERPUser(formData:FormData){
  const {supabase}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const deviceName=text(formData.get('device_name'))
  const deviceType=text(formData.get('device_type'))||'DESKTOP'
  const browserName=text(formData.get('browser_name'))||null
  const browserProfile=text(formData.get('browser_profile'))||null

  const {data,error}=await supabase.rpc('create_erp_user_full',{
    p_username:text(formData.get('username')),
    p_phone:text(formData.get('phone'))||null,
    p_email:text(formData.get('email'))||null,
    p_status:text(formData.get('status'))||'Active',
    p_mobile:deviceType==='MOBILE',
    p_web:deviceType!=='MOBILE'&&Boolean(deviceName||browserName),
    p_voucher_summary:null,
    p_note:text(formData.get('note'))||null,
    p_password:text(formData.get('password'))||null,
    p_spc_st:text(formData.get('spc_st'))||null,
    p_spc_f:text(formData.get('spc_f'))||null,
  })
  if(error)throw new Error(error.message)

  const {error:browserError}=await supabase.from('erp_users').update({browser_name:browserName}).eq('id',data)
  if(browserError)throw new Error(browserError.message)

  if(deviceName){
    const {error:deviceError}=await supabase.from('purchase_account_devices').upsert({
      erp_user_id:data,
      device_key:'manual-primary',
      device_name:deviceName,
      device_type:deviceType,
      browser_name:browserName,
      browser_profile:browserProfile,
      is_active:true,
      last_seen_at:new Date().toISOString(),
      source:'MANUAL',
      updated_at:new Date().toISOString(),
    },{onConflict:'erp_user_id,device_key'})
    if(deviceError)throw new Error(deviceError.message)
  }

  revalidatePath('/purchase/accounts')
  redirect(returnHref('/purchase/accounts',returnQuery,{user:String(data)}))
}

export async function updateERPUser(formData:FormData){
  const {supabase}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const userId=text(formData.get('user_id'))
  if(!userId)throw new Error('Thiếu tài khoản cần cập nhật')

  const deviceName=text(formData.get('device_name'))
  const deviceType=text(formData.get('device_type'))||'DESKTOP'
  const browserName=text(formData.get('browser_name'))||null
  const browserProfile=text(formData.get('browser_profile'))||null

  const {data,error}=await supabase.rpc('update_erp_user_full',{
    p_user_id:userId,
    p_username:text(formData.get('username')),
    p_phone:text(formData.get('phone'))||null,
    p_email:text(formData.get('email'))||null,
    p_status:text(formData.get('status'))||'Active',
    p_mobile:deviceType==='MOBILE',
    p_web:deviceType!=='MOBILE'&&Boolean(deviceName||browserName),
    p_voucher_summary:null,
    p_note:text(formData.get('note'))||null,
    p_password:text(formData.get('password'))||null,
    p_spc_st:text(formData.get('spc_st'))||null,
    p_spc_f:text(formData.get('spc_f'))||null,
  })
  if(error)throw new Error(error.message)

  const {error:browserError}=await supabase.from('erp_users').update({browser_name:browserName}).eq('id',userId)
  if(browserError)throw new Error(browserError.message)

  if(deviceName){
    const {error:deviceError}=await supabase.from('purchase_account_devices').upsert({
      erp_user_id:userId,
      device_key:'manual-primary',
      device_name:deviceName,
      device_type:deviceType,
      browser_name:browserName,
      browser_profile:browserProfile,
      is_active:true,
      last_seen_at:new Date().toISOString(),
      source:'MANUAL',
      updated_at:new Date().toISOString(),
    },{onConflict:'erp_user_id,device_key'})
    if(deviceError)throw new Error(deviceError.message)
  }

  revalidatePath('/purchase/accounts')
  redirect(returnHref('/purchase/accounts',returnQuery,{user:String(data)}))
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

function detectCarrier(trackingNumber:string){
  const v=trackingNumber.trim().toUpperCase()
  if(!v)return null
  if(v.startsWith('SPX'))return 'SPX Express'
  if(v.startsWith('GHN'))return 'Giao Hàng Nhanh'
  if(v.startsWith('GHTK'))return 'Giao Hàng Tiết Kiệm'
  if(v.startsWith('VTP')||v.startsWith('VTPN'))return 'Viettel Post'
  if(v.startsWith('JNT')||v.startsWith('JT'))return 'J&T Express'
  return null
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
  const returnQuery=text(formData.get('return_query'))
  const shippingService=text(formData.get('shipping_service'))==='EXPRESS'?'EXPRESS':'STANDARD'
  const isExpress=shippingService==='EXPRESS'
  const trackingNumber=isExpress?'':text(formData.get('tracking_number'))
  const carrier=isExpress?null:(text(formData.get('carrier'))||detectCarrier(trackingNumber))
  const orderDate=localDateTime(formData.get('order_date'))??new Date().toISOString()
  const orderStatus=isExpress?'PROCESSING':(trackingNumber?'PROCESSING':'PENDING')

  const {data,error}=await supabase.rpc('create_order_full_v2',{
    p_shopee_order_id:text(formData.get('shopee_order_id'))||null,
    p_erp_user_id:text(formData.get('erp_user_id'))||null,
    p_order_date:orderDate,
    p_recipient_name:text(formData.get('recipient_name'))||null,
    p_recipient_phone:text(formData.get('recipient_phone'))||null,
    p_recipient_address:text(formData.get('recipient_address'))||null,
    p_destination_hub:isExpress?null:(text(formData.get('destination_hub'))||null),
    p_cod:numberOrNull(formData.get('cod'))??0,
    p_order_status:orderStatus,
    p_payment_status:text(formData.get('payment_status'))||'UNPAID',
    p_tracking_number:trackingNumber||null,
    p_carrier:carrier,
    p_shipping_service:shippingService,
    p_items:itemPayload(formData),
    p_vouchers:voucherPayload(formData),
  })
  if(error)throw new Error(error.message)
  const derivedArea=isExpress?null:(text(formData.get('area'))||null)
  if(data){
    const {error:orderMetaError}=await supabase.from('orders').update({
      area:derivedArea,
      destination_hub:isExpress?null:(text(formData.get('destination_hub'))||null),
      express_shipper_name:isExpress?(text(formData.get('express_shipper_name'))||null):null,
      express_shipper_phone:isExpress?(text(formData.get('express_shipper_phone'))||null):null,
      express_shipper_note:isExpress?(text(formData.get('express_shipper_note'))||null):null,
    }).eq('id',data)
    if(orderMetaError)throw new Error(orderMetaError.message)
  }
  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/purchase/accounts'); revalidatePath('/purchase'); revalidatePath('/')
  redirect(returnHref('/purchase/orders',returnQuery,{order:String(data)}))
}

export async function updateOrder(formData:FormData){
  const {supabase}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderId=text(formData.get('order_id'))
  if(!orderId)throw new Error('Thiếu đơn hàng cần cập nhật')

  const shippingService=text(formData.get('shipping_service'))==='EXPRESS'?'EXPRESS':'STANDARD'
  const isExpress=shippingService==='EXPRESS'
  const trackingNumber=isExpress?'':text(formData.get('tracking_number'))
  const carrier=isExpress?null:(text(formData.get('carrier'))||detectCarrier(trackingNumber))
  const orderDate=localDateTime(formData.get('order_date'))??new Date().toISOString()
  const orderStatus=isExpress?'PROCESSING':(trackingNumber?'PROCESSING':'PENDING')

  const {data,error}=await supabase.rpc('update_order_full_v2',{
    p_order_id:orderId,
    p_shopee_order_id:text(formData.get('shopee_order_id'))||null,
    p_erp_user_id:text(formData.get('erp_user_id'))||null,
    p_order_date:orderDate,
    p_recipient_name:text(formData.get('recipient_name'))||null,
    p_recipient_phone:text(formData.get('recipient_phone'))||null,
    p_recipient_address:text(formData.get('recipient_address'))||null,
    p_destination_hub:isExpress?null:(text(formData.get('destination_hub'))||null),
    p_cod:numberOrNull(formData.get('cod'))??0,
    p_order_status:orderStatus,
    p_payment_status:text(formData.get('payment_status'))||'UNPAID',
    p_tracking_number:trackingNumber||null,
    p_carrier:carrier,
    p_shipping_service:shippingService,
    p_items:itemPayload(formData),
    p_vouchers:voucherPayload(formData),
  })
  if(error)throw new Error(error.message)
  const derivedArea=isExpress?null:(text(formData.get('area'))||null)
  const {error:orderMetaError}=await supabase.from('orders').update({
    area:derivedArea,
    destination_hub:isExpress?null:(text(formData.get('destination_hub'))||null),
    express_shipper_name:isExpress?(text(formData.get('express_shipper_name'))||null):null,
    express_shipper_phone:isExpress?(text(formData.get('express_shipper_phone'))||null):null,
    express_shipper_note:isExpress?(text(formData.get('express_shipper_note'))||null):null,
  }).eq('id',orderId)
  if(orderMetaError)throw new Error(orderMetaError.message)
  if(isExpress){
    const {error:shipmentError}=await supabase.from('shipments').update({
      is_active:false,
      tracking_enabled:false,
      next_track_at:null,
      replaced_at:new Date().toISOString(),
    }).eq('order_id',orderId).eq('is_active',true)
    if(shipmentError)throw new Error(shipmentError.message)
  }
  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/purchase/accounts'); revalidatePath('/purchase'); revalidatePath('/')
  redirect(returnHref('/purchase/orders',returnQuery,{order:String(data)}))
}

function normalizeRoutingKeyword(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
}

function keywordList(v:FormDataEntryValue|null){
  const seen=new Set<string>()
  return text(v)
    .split(/[\n,;]+/)
    .map(x=>x.trim())
    .filter(Boolean)
    .filter(value=>{
      const key=normalizeRoutingKeyword(value)
      if(!key||seen.has(key))return false
      seen.add(key)
      return true
    })
}

export async function saveDestinationHubConfig(formData:FormData){
  const {supabase}=await actor()
  const id=text(formData.get('config_id'))
  const hubCode=text(formData.get('hub_code'))
  const area=text(formData.get('area'))
  const region=text(formData.get('region'))
  const shipperIds=[...new Set(formData.getAll('shipper_ids').map(v=>text(v)).filter(Boolean))]
  if(!hubCode||!area||!['Miền Bắc','Miền Trung','Miền Nam'].includes(region)){
    throw new Error('Thiếu mã hub, khu vực hoặc miền')
  }

  const priorityRaw=Number(text(formData.get('priority'))||100)
  const payload={
    hub_code:hubCode,
    area,
    region,
    province_keywords:keywordList(formData.get('province_keywords')),
    district_keywords:keywordList(formData.get('ward_keywords')??formData.get('district_keywords')),
    address_keywords:keywordList(formData.get('address_keywords')),
    priority:Number.isFinite(priorityRaw)?Math.max(0,Math.round(priorityRaw)):100,
    is_active:formData.get('is_active')==='on',
    updated_at:new Date().toISOString(),
    // Legacy single-shipper fields are intentionally cleared.
    shipper_id:null,
    shipper_name:null,
    shipper_phone:null,
  }

  const mutation=id
    ? supabase.from('destination_hub_configs').update(payload).eq('id',id).select('id').single()
    : supabase.from('destination_hub_configs').insert(payload).select('id').single()

  const {data:hub,error}=await mutation
  if(error)throw new Error(error.message)
  const hubId=String(hub?.id??id)
  if(!hubId)throw new Error('Không xác định được Hub vừa lưu')

  const {error:deleteError}=await supabase
    .from('destination_hub_shipper_assignments')
    .delete()
    .eq('hub_config_id',hubId)
  if(deleteError)throw new Error(deleteError.message)

  if(shipperIds.length){
    const {error:assignError}=await supabase
      .from('destination_hub_shipper_assignments')
      .insert(shipperIds.map((shipperId,index)=>({
        hub_config_id:hubId,
        shipper_id:shipperId,
        priority:(index+1)*10,
        is_active:true,
      })))
    if(assignError)throw new Error(assignError.message)
  }

  revalidatePath('/settings')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
}

export async function deleteDestinationHubConfig(formData:FormData){
  const {supabase,user}=await actor()
  const id=text(formData.get('config_id'))
  if(!id)throw new Error('Thiếu HUB cần xoá')

  const {data:hub,error:hubError}=await supabase
    .from('destination_hub_configs')
    .select('id,hub_code,area,region,province_keywords,district_keywords,address_keywords,priority,is_active')
    .eq('id',id)
    .maybeSingle()
  if(hubError)throw new Error(hubError.message)
  if(!hub)throw new Error('HUB không tồn tại hoặc đã được xoá')

  const {error:deleteError}=await supabase
    .from('destination_hub_configs')
    .delete()
    .eq('id',id)
  if(deleteError)throw new Error(deleteError.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'SETTINGS',
    action:'DELETE_DESTINATION_HUB_CONFIG',
    entity_type:'DESTINATION_HUB_CONFIG',
    entity_id:id,
    old_value:hub,
    new_value:{deleted:true,hub_code:hub.hub_code},
    source:'USER',
  })

  revalidatePath('/settings')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
}

export async function saveDestinationShipper(formData:FormData){
  const {supabase}=await actor()
  const id=text(formData.get('shipper_id'))
  const name=text(formData.get('name'))
  const phone=text(formData.get('phone'))||null
  const note=text(formData.get('note'))||null
  if(!name)throw new Error('Thiếu tên Shipper')

  const payload={
    name,
    phone,
    note,
    is_active:formData.get('is_active')==='on',
    updated_at:new Date().toISOString(),
  }
  const query=id
    ? supabase.from('destination_shippers').update(payload).eq('id',id)
    : supabase.from('destination_shippers').insert(payload)

  const {error}=await query
  if(error)throw new Error(error.message)

  revalidatePath('/settings')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
}


export async function confirmReceiveOrders(formData:FormData){
  const {supabase}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderIds=[...new Set(formData.getAll('order_ids').map(v=>text(v)).filter(Boolean))]
  const warehouseId=text(formData.get('warehouse_id'))
  const note=text(formData.get('note'))||null
  const paymentMode=text(formData.get('payment_mode'))
  if(!orderIds.length)throw new Error('Chưa chọn đơn cần xác nhận nhận hàng')
  if(!warehouseId)throw new Error('Chưa chọn kho nhận')

  let data:any=null
  if(paymentMode==='with_payment'){
    const actualTransferred=numberOrNull(formData.get('actual_transferred'))
    if(actualTransferred===null)throw new Error('Chưa nhập tổng tiền thực chuyển theo HUB')

    const {data:paymentOrders,error:paymentOrdersError}=await supabase
      .from('orders')
      .select('id,destination_hub,shipping_service')
      .in('id',orderIds)
    if(paymentOrdersError)throw new Error(paymentOrdersError.message)
    if((paymentOrders??[]).length!==orderIds.length)throw new Error('Có đơn hàng không tồn tại')

    if((paymentOrders??[]).some((o:any)=>o.shipping_service==='EXPRESS')){
      throw new Error('Đơn hỏa tốc không áp dụng nhận hàng / đối soát HUB')
    }

    const hubs=[...new Set((paymentOrders??[]).map((o:any)=>String(o.destination_hub??'').trim()).filter(Boolean))]
    if(hubs.length!==1)throw new Error('Đợt đối soát phải gồm các đơn cùng một HUB kho đích')
    const destinationHub=hubs[0]

    const {data:hubConfig,error:hubConfigError}=await supabase
      .from('destination_hub_configs')
      .select('id')
      .eq('hub_code',destinationHub)
      .eq('is_active',true)
      .maybeSingle()
    if(hubConfigError)throw new Error(hubConfigError.message)
    if(!hubConfig)throw new Error('HUB kho đích chưa có cấu hình hoạt động')

    const result=await supabase.rpc('confirm_receive_and_pay_hub',{
      p_order_ids:orderIds,
      p_warehouse_id:warehouseId,
      p_destination_hub:destinationHub,
      p_actual_transferred:actualTransferred,
      p_note:note,
    })
    if(result.error)throw new Error(result.error.message)
    data=result.data
  }else{
    const result=await supabase.rpc('confirm_receive_orders',{
      p_order_ids:orderIds,
      p_warehouse_id:warehouseId,
      p_note:note,
    })
    if(result.error)throw new Error(result.error.message)
    data=result.data
  }

  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/finance/shipper-payments')
  redirect(returnHref('/purchase/tracking',returnQuery,{
    received:String(data?.receive_batch_id??''),
    payment:data?.shipper_payment_id?String(data.shipper_payment_id):null,
  }))
}

export async function replaceShipment(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
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
  redirect(returnHref('/purchase/orders',returnQuery,{order:orderId,tab:'tracking'}))
}
