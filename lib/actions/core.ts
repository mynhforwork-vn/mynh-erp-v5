'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { nextTrackAt } from '@/lib/tracking/schedule'

function text(v:FormDataEntryValue|null){return String(v??'').trim()}

const RETURN_KEYS=['range','from','to','q','receive','receiveDate','status','hub','tracking','state','device','session','voucher','orders','browser','sort','order','user','mode','tab','settings','platform','archive'] as const
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
function requireAdmin(role:string){
  if(role!=='admin')throw new Error('Chỉ Admin được xóa vĩnh viễn dữ liệu')
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
  redirect(returnHref('/purchase/accounts',returnQuery,{user:String(data),mode:null,tab:'info'}))
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
  redirect(returnHref('/purchase/accounts',returnQuery,{user:String(data),mode:null,tab:'info'}))
}


export async function archiveERPUser(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const tableAction=text(formData.get('table_action'))==='1'
  const userId=text(formData.get('user_id'))
  if(!userId)throw new Error('Thiếu User cần lưu trữ')

  const {data:row,error:readError}=await supabase
    .from('erp_users')
    .select('id,username,phone,email,status,archived_at')
    .eq('id',userId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('User không tồn tại')
  if(row.archived_at)throw new Error('User đã được lưu trữ trước đó')

  const archivedAt=new Date().toISOString()
  const {error}=await supabase.from('erp_users').update({
    archived_at:archivedAt,
    archived_by:user.id,
  }).eq('id',userId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'USERS',
    action:'ARCHIVE_USER',
    entity_type:'ERP_USER',
    entity_id:userId,
    old_value:{archived_at:null,username:row.username,status:row.status},
    new_value:{archived_at:archivedAt,username:row.username,status:row.status},
    source:'USER',
  })

  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(tableAction
    ? returnHref('/purchase/accounts',returnQuery,{user:null,mode:null,tab:null,archive:null})
    : returnHref('/purchase/accounts',returnQuery,{user:userId,mode:null,tab:'info',archive:'archived'}))
}

export async function restoreERPUser(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const tableAction=text(formData.get('table_action'))==='1'
  const userId=text(formData.get('user_id'))
  if(!userId)throw new Error('Thiếu User cần khôi phục')

  const {data:row,error:readError}=await supabase
    .from('erp_users')
    .select('id,username,status,archived_at')
    .eq('id',userId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('User không tồn tại')
  if(!row.archived_at)throw new Error('User này chưa được lưu trữ')

  const {error}=await supabase.from('erp_users').update({
    archived_at:null,
    archived_by:null,
  }).eq('id',userId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'USERS',
    action:'RESTORE_USER',
    entity_type:'ERP_USER',
    entity_id:userId,
    old_value:{archived_at:row.archived_at,username:row.username,status:row.status},
    new_value:{archived_at:null,username:row.username,status:row.status},
    source:'USER',
  })

  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(tableAction
    ? returnHref('/purchase/accounts',returnQuery,{user:null,mode:null,tab:null,archive:'archived'})
    : returnHref('/purchase/accounts',returnQuery,{user:userId,mode:null,tab:'info',archive:null}))
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

async function resolveCarrierName(supabase:any,trackingNumber:string,explicitCarrier?:string|null){
  const explicit=String(explicitCarrier??'').trim()
  if(explicit)return explicit
  const v=trackingNumber.trim().toUpperCase()
  if(!v)return null

  const {data,error}=await supabase
    .from('shipping_carrier_configs')
    .select('display_name,tracking_prefixes')
    .eq('is_active',true)
    .eq('supports_tracking',true)
    .order('priority',{ascending:true})
  if(error)throw new Error(error.message)

  const matched=(data??[]).find((row:any)=>
    (row.tracking_prefixes??[]).some((prefix:any)=>{
      const p=String(prefix??'').trim().toUpperCase()
      return Boolean(p)&&v.startsWith(p)
    })
  )
  return matched?.display_name??null
}

async function carrierUsesDestinationHub(supabase:any,carrierName:string|null){
  if(!carrierName)return false
  const {data,error}=await supabase
    .from('shipping_carrier_configs')
    .select('supports_destination_hub')
    .eq('display_name',carrierName)
    .order('priority',{ascending:true})
    .limit(1)
    .maybeSingle()
  if(error)throw new Error(error.message)
  return Boolean(data?.supports_destination_hub)
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
  const carrier=isExpress?null:await resolveCarrierName(supabase,trackingNumber,text(formData.get('carrier')))
  const usesDestinationHub=!isExpress&&await carrierUsesDestinationHub(supabase,carrier)
  const orderDate=localDateTime(formData.get('order_date'))??new Date().toISOString()
  const orderStatus=isExpress?'PROCESSING':(trackingNumber?'PROCESSING':'PENDING')

  const {data,error}=await supabase.rpc('create_order_full_v2',{
    p_shopee_order_id:text(formData.get('shopee_order_id'))||null,
    p_erp_user_id:text(formData.get('erp_user_id'))||null,
    p_order_date:orderDate,
    p_recipient_name:text(formData.get('recipient_name'))||null,
    p_recipient_phone:text(formData.get('recipient_phone'))||null,
    p_recipient_address:text(formData.get('recipient_address'))||null,
    p_destination_hub:usesDestinationHub?(text(formData.get('destination_hub'))||null):null,
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
  const derivedArea=usesDestinationHub?(text(formData.get('area'))||null):null
  if(data){
    const {error:orderMetaError}=await supabase.from('orders').update({
      area:derivedArea,
      destination_hub:usesDestinationHub?(text(formData.get('destination_hub'))||null):null,
      express_shipper_name:isExpress?(text(formData.get('express_shipper_name'))||null):null,
      express_shipper_phone:isExpress?(text(formData.get('express_shipper_phone'))||null):null,
      express_shipper_note:isExpress?(text(formData.get('express_shipper_note'))||null):null,
    }).eq('id',data)
    if(orderMetaError)throw new Error(orderMetaError.message)
  }
  revalidatePath('/purchase/orders'); revalidatePath('/purchase/tracking'); revalidatePath('/purchase/accounts'); revalidatePath('/purchase'); revalidatePath('/')
  redirect(returnHref('/purchase/orders',returnQuery,{order:String(data),mode:null,settings:null,tab:'info'}))
}

export async function updateOrder(formData:FormData){
  const {supabase}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderId=text(formData.get('order_id'))
  if(!orderId)throw new Error('Thiếu đơn hàng cần cập nhật')

  const shippingService=text(formData.get('shipping_service'))==='EXPRESS'?'EXPRESS':'STANDARD'
  const isExpress=shippingService==='EXPRESS'
  const trackingNumber=isExpress?'':text(formData.get('tracking_number'))
  const carrier=isExpress?null:await resolveCarrierName(supabase,trackingNumber,text(formData.get('carrier')))
  const usesDestinationHub=!isExpress&&await carrierUsesDestinationHub(supabase,carrier)
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
    p_destination_hub:usesDestinationHub?(text(formData.get('destination_hub'))||null):null,
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
  const derivedArea=usesDestinationHub?(text(formData.get('area'))||null):null
  const {error:orderMetaError}=await supabase.from('orders').update({
    area:derivedArea,
    destination_hub:usesDestinationHub?(text(formData.get('destination_hub'))||null):null,
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
  redirect(returnHref('/purchase/orders',returnQuery,{order:String(data),mode:null,settings:null,tab:'info'}))
}


export async function archiveOrder(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const tableAction=text(formData.get('table_action'))==='1'
  const orderId=text(formData.get('order_id'))
  if(!orderId)throw new Error('Thiếu đơn cần lưu trữ')

  const {data:row,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,order_status,receive_status,warehouse_status,archived_at')
    .eq('id',orderId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('Đơn hàng không tồn tại')
  if(row.archived_at)throw new Error('Đơn đã được lưu trữ trước đó')

  const archivedAt=new Date().toISOString()
  const {error}=await supabase.from('orders').update({
    archived_at:archivedAt,
    archived_by:user.id,
  }).eq('id',orderId)
  if(error)throw new Error(error.message)

  const {error:shipmentError}=await supabase.from('shipments').update({
    tracking_enabled:false,
    next_track_at:null,
  }).eq('order_id',orderId).eq('is_active',true)
  if(shipmentError){
    await supabase.from('orders').update({archived_at:null,archived_by:null}).eq('id',orderId)
    throw new Error(shipmentError.message)
  }

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'ARCHIVE_ORDER',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{archived_at:null,order_status:row.order_status,receive_status:row.receive_status,warehouse_status:row.warehouse_status},
    new_value:{archived_at:archivedAt,order_status:row.order_status,receive_status:row.receive_status,warehouse_status:row.warehouse_status},
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/')
  redirect(tableAction
    ? returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:null})
    : returnHref('/purchase/orders',returnQuery,{order:orderId,mode:null,tab:'info',archive:'archived'}))
}

export async function restoreOrder(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const tableAction=text(formData.get('table_action'))==='1'
  const orderId=text(formData.get('order_id'))
  if(!orderId)throw new Error('Thiếu đơn cần khôi phục')

  const {data:row,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,archived_at,archived_by,shipments(id,tracking_number,current_tracking_status,is_active)')
    .eq('id',orderId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('Đơn hàng không tồn tại')
  if(!row.archived_at)throw new Error('Đơn này chưa được lưu trữ')

  const {error}=await supabase.from('orders').update({
    archived_at:null,
    archived_by:null,
  }).eq('id',orderId)
  if(error)throw new Error(error.message)

  const active=(row.shipments??[]).find((x:any)=>x.is_active)??null
  const status=String(active?.current_tracking_status??(active?.tracking_number?'READY_TO_SHIP':''))
  const shouldTrack=Boolean(
    active?.tracking_number &&
    status &&
    !['DELIVERED','CANCELLED','RETURNED'].includes(status)
  )
  if(active?.id){
    const next=shouldTrack?nextTrackAt(new Date(),status as any):null
    const {error:shipmentError}=await supabase.from('shipments').update({
      tracking_enabled:shouldTrack,
      tracking_interval_minutes:status==='OUT_FOR_DELIVERY'?60:120,
      next_track_at:next?.toISOString()??null,
    }).eq('id',active.id)
    if(shipmentError){
      await supabase.from('orders').update({
        archived_at:row.archived_at,
        archived_by:row.archived_by,
      }).eq('id',orderId)
      throw new Error(shipmentError.message)
    }
  }

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'RESTORE_ORDER',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{archived_at:row.archived_at},
    new_value:{archived_at:null},
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/')
  redirect(tableAction
    ? returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:'archived'})
    : returnHref('/purchase/orders',returnQuery,{order:orderId,mode:null,tab:'info',archive:null}))
}

export async function deleteOrderPermanent(formData:FormData){
  const {supabase,user,role}=await actor()
  requireAdmin(role)
  const returnQuery=text(formData.get('return_query'))
  const orderId=text(formData.get('order_id'))
  const confirmText=text(formData.get('confirm_text'))
  if(!orderId)throw new Error('Thiếu đơn cần xóa')

  const {data:row,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,erp_user_id,cod,order_status,receive_status,warehouse_status,archived_at')
    .eq('id',orderId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('Đơn hàng không tồn tại')
  if(!row.archived_at)throw new Error('Cần lưu trữ đơn trước khi xóa vĩnh viễn')

  const expected=String(row.shopee_order_id??row.id.slice(0,8))
  if(confirmText!==expected)throw new Error('Mã đơn xác nhận không khớp')

  const [receiveRefs,paymentRefs,transferRefs]=await Promise.all([
    supabase.from('receive_batch_details').select('*',{count:'exact',head:true}).eq('order_id',orderId),
    supabase.from('shipper_payment_details').select('*',{count:'exact',head:true}).eq('order_id',orderId),
    supabase.from('transfer_items').select('*',{count:'exact',head:true}).eq('order_id',orderId),
  ])
  const refError=receiveRefs.error??paymentRefs.error??transferRefs.error
  if(refError)throw new Error(refError.message)
  if((receiveRefs.count??0)+(paymentRefs.count??0)+(transferRefs.count??0)>0){
    throw new Error('Đơn đã phát sinh nhận hàng, đối soát hoặc chuyển kho nên không thể xóa vĩnh viễn. Hãy giữ ở trạng thái Lưu trữ.')
  }

  const {error}=await supabase.from('orders').delete().eq('id',orderId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'DELETE_ORDER_PERMANENT',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{
      shopee_order_id:row.shopee_order_id,
      erp_user_id:row.erp_user_id,
      cod:row.cod,
      order_status:row.order_status,
      receive_status:row.receive_status,
      warehouse_status:row.warehouse_status,
      archived_at:row.archived_at,
    },
    new_value:{deleted:true},
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/')
  redirect(returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:'archived'}))
}


function bulkOrderIds(formData:FormData){
  const ids=[...new Set(formData.getAll('order_ids').map(v=>text(v)).filter(Boolean))]
  if(!ids.length)throw new Error('Chưa chọn đơn')
  if(ids.length>200)throw new Error('Tối đa 200 đơn mỗi lần thao tác')
  return ids
}

async function orderDeleteBlockers(supabase:any,orderIds:string[]){
  if(!orderIds.length)return {blockedIds:new Set<string>(),error:null as any}
  const [receiveRefs,paymentRefs,transferRefs]=await Promise.all([
    supabase.from('receive_batch_details').select('order_id').in('order_id',orderIds),
    supabase.from('shipper_payment_details').select('order_id').in('order_id',orderIds),
    supabase.from('transfer_items').select('order_id').in('order_id',orderIds),
  ])
  const error=receiveRefs.error??paymentRefs.error??transferRefs.error
  if(error)return {blockedIds:new Set<string>(),error}
  return {
    blockedIds:new Set<string>([
      ...(receiveRefs.data??[]).map((x:any)=>String(x.order_id)),
      ...(paymentRefs.data??[]).map((x:any)=>String(x.order_id)),
      ...(transferRefs.data??[]).map((x:any)=>String(x.order_id)),
    ]),
    error:null,
  }
}

function revalidateOrderLifecycle(){
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/')
}

export async function archiveOrdersBulk(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderIds=bulkOrderIds(formData)

  const {data:rows,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,order_status,receive_status,warehouse_status,archived_at')
    .in('id',orderIds)
  if(readError)throw new Error(readError.message)
  if((rows??[]).length!==orderIds.length)throw new Error('Có đơn không tồn tại hoặc không có quyền truy cập')
  const alreadyArchived=(rows??[]).filter((x:any)=>x.archived_at)
  if(alreadyArchived.length)throw new Error('Có đơn đã được lưu trữ. Hãy bỏ chọn các đơn đó.')

  const archivedAt=new Date().toISOString()
  const {error}=await supabase.from('orders').update({
    archived_at:archivedAt,
    archived_by:user.id,
  }).in('id',orderIds)
  if(error)throw new Error(error.message)

  const {error:shipmentError}=await supabase.from('shipments').update({
    tracking_enabled:false,
    next_track_at:null,
  }).in('order_id',orderIds).eq('is_active',true)
  if(shipmentError){
    await supabase.from('orders').update({archived_at:null,archived_by:null}).in('id',orderIds)
    throw new Error(shipmentError.message)
  }

  const audits=(rows??[]).map((row:any)=>({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'ARCHIVE_ORDER',
    entity_type:'ORDER',
    entity_id:String(row.id),
    old_value:{archived_at:null,order_status:row.order_status,receive_status:row.receive_status,warehouse_status:row.warehouse_status},
    new_value:{archived_at:archivedAt,order_status:row.order_status,receive_status:row.receive_status,warehouse_status:row.warehouse_status,bulk:true},
    source:'USER',
  }))
  if(audits.length){
    const {error:auditError}=await supabase.from('audit_logs').insert(audits)
    if(auditError)throw new Error(auditError.message)
  }

  revalidateOrderLifecycle()
  redirect(returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:null}))
}

export async function restoreOrdersBulk(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderIds=bulkOrderIds(formData)

  const {data:rows,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,archived_at,archived_by,shipments(id,tracking_number,current_tracking_status,is_active)')
    .in('id',orderIds)
  if(readError)throw new Error(readError.message)
  if((rows??[]).length!==orderIds.length)throw new Error('Có đơn không tồn tại hoặc không có quyền truy cập')
  const notArchived=(rows??[]).filter((x:any)=>!x.archived_at)
  if(notArchived.length)throw new Error('Có đơn chưa được lưu trữ. Hãy bỏ chọn các đơn đó.')

  const {error}=await supabase.from('orders').update({
    archived_at:null,
    archived_by:null,
  }).in('id',orderIds)
  if(error)throw new Error(error.message)

  try{
    for(const row of rows??[]){
      const active=(row.shipments??[]).find((x:any)=>x.is_active)??null
      if(!active?.id)continue
      const status=String(active.current_tracking_status??(active.tracking_number?'READY_TO_SHIP':''))
      const shouldTrack=Boolean(
        active.tracking_number &&
        status &&
        !['DELIVERED','CANCELLED','RETURNED'].includes(status)
      )
      const next=shouldTrack?nextTrackAt(new Date(),status as any):null
      const {error:shipmentError}=await supabase.from('shipments').update({
        tracking_enabled:shouldTrack,
        tracking_interval_minutes:status==='OUT_FOR_DELIVERY'?60:120,
        next_track_at:next?.toISOString()??null,
      }).eq('id',active.id)
      if(shipmentError)throw shipmentError
    }
  }catch(err:any){
    for(const row of rows??[]){
      await supabase.from('orders').update({
        archived_at:row.archived_at,
        archived_by:row.archived_by,
      }).eq('id',row.id)
    }
    await supabase.from('shipments').update({
      tracking_enabled:false,
      next_track_at:null,
    }).in('order_id',orderIds).eq('is_active',true)
    throw new Error(err?.message??'Không thể khôi phục Tracking cho các đơn đã chọn')
  }

  const audits=(rows??[]).map((row:any)=>({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'RESTORE_ORDER',
    entity_type:'ORDER',
    entity_id:String(row.id),
    old_value:{archived_at:row.archived_at},
    new_value:{archived_at:null,bulk:true},
    source:'USER',
  }))
  if(audits.length){
    const {error:auditError}=await supabase.from('audit_logs').insert(audits)
    if(auditError)throw new Error(auditError.message)
  }

  revalidateOrderLifecycle()
  redirect(returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:'archived'}))
}

export async function deleteOrdersBulkPermanent(formData:FormData){
  const {supabase,user,role}=await actor()
  requireAdmin(role)
  const returnQuery=text(formData.get('return_query'))
  const orderIds=bulkOrderIds(formData)
  const confirmText=text(formData.get('confirm_text')).toUpperCase()
  if(confirmText!=='XOA DON DA CHON')throw new Error('Cụm xác nhận không đúng')

  const {data:rows,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id,erp_user_id,cod,order_status,receive_status,warehouse_status,archived_at')
    .in('id',orderIds)
  if(readError)throw new Error(readError.message)
  if((rows??[]).length!==orderIds.length)throw new Error('Có đơn không tồn tại hoặc không có quyền truy cập')
  if((rows??[]).some((x:any)=>!x.archived_at))throw new Error('Chỉ được xóa vĩnh viễn các đơn đã lưu trữ')

  const blockers=await orderDeleteBlockers(supabase,orderIds)
  if(blockers.error)throw new Error(blockers.error.message)
  if(blockers.blockedIds.size){
    const blockedCodes=(rows??[])
      .filter((x:any)=>blockers.blockedIds.has(String(x.id)))
      .map((x:any)=>String(x.shopee_order_id??x.id).slice(0,24))
      .slice(0,8)
    throw new Error('Có '+blockers.blockedIds.size+' đơn đã phát sinh nhận hàng/đối soát/chuyển kho nên không thể xóa: '+blockedCodes.join(', '))
  }

  const {error}=await supabase.from('orders').delete().in('id',orderIds)
  if(error)throw new Error(error.message)

  const audits=(rows??[]).map((row:any)=>({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'DELETE_ORDER_PERMANENT',
    entity_type:'ORDER',
    entity_id:String(row.id),
    old_value:{
      shopee_order_id:row.shopee_order_id,
      erp_user_id:row.erp_user_id,
      cod:row.cod,
      order_status:row.order_status,
      receive_status:row.receive_status,
      warehouse_status:row.warehouse_status,
      archived_at:row.archived_at,
      bulk:true,
    },
    new_value:{deleted:true,bulk:true},
    source:'USER',
  }))
  if(audits.length){
    const {error:auditError}=await supabase.from('audit_logs').insert(audits)
    if(auditError)throw new Error(auditError.message)
  }

  revalidateOrderLifecycle()
  redirect(returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:'archived'}))
}

export async function purgeEligibleArchivedOrders(formData:FormData){
  const {supabase,user,role}=await actor()
  requireAdmin(role)
  const confirmText=text(formData.get('confirm_text')).toUpperCase()
  if(confirmText!=='XOA DON LUU TRU')throw new Error('Cụm xác nhận không đúng')

  const {data:rows,error:readError}=await supabase
    .from('orders')
    .select('id,shopee_order_id')
    .not('archived_at','is',null)
    .order('archived_at',{ascending:true})
    .limit(200)
  if(readError)throw new Error(readError.message)
  const archived=rows??[]
  if(!archived.length)throw new Error('Không có đơn lưu trữ để dọn')

  const orderIds=archived.map((x:any)=>String(x.id))
  const blockers=await orderDeleteBlockers(supabase,orderIds)
  if(blockers.error)throw new Error(blockers.error.message)
  const eligible=archived.filter((x:any)=>!blockers.blockedIds.has(String(x.id)))
  if(!eligible.length)throw new Error('Không có đơn lưu trữ nào đủ điều kiện xóa vĩnh viễn')

  const eligibleIds=eligible.map((x:any)=>String(x.id))
  const {error}=await supabase.from('orders').delete().in('id',eligibleIds)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'SETTINGS',
    action:'PURGE_ARCHIVED_ORDERS',
    entity_type:'DATA_MAINTENANCE',
    entity_id:'PURGE-'+Date.now(),
    old_value:{
      scanned_count:archived.length,
      eligible_count:eligible.length,
      protected_count:blockers.blockedIds.size,
      order_ids:eligibleIds,
    },
    new_value:{deleted_count:eligible.length},
    source:'USER',
  })

  revalidateOrderLifecycle()
  revalidatePath('/settings')
  redirect('/settings?section=data-management&purged='+eligible.length+'&protected='+blockers.blockedIds.size)
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



export async function saveShippingCarrierConfig(formData:FormData){
  const {supabase,user}=await actor()
  const id=text(formData.get('carrier_config_id'))
  const carrierCode=text(formData.get('carrier_code')).toUpperCase()
  const displayName=text(formData.get('display_name'))
  const trackingPrefixes=keywordList(formData.get('tracking_prefixes')).map(x=>x.toUpperCase())
  const priorityRaw=Number(text(formData.get('priority'))||100)
  const isSpx=carrierCode==='SPX'

  if(!carrierCode||!displayName)throw new Error('Thiếu mã hoặc tên ĐVVC')

  const payload={
    carrier_code:carrierCode,
    display_name:displayName,
    tracking_prefixes:trackingPrefixes,
    supports_tracking:formData.get('supports_tracking')==='on',
    supports_destination_hub:isSpx,
    priority:Number.isFinite(priorityRaw)?Math.max(0,Math.round(priorityRaw)):100,
    is_active:formData.get('is_active')==='on',
    note:text(formData.get('note'))||null,
    updated_at:new Date().toISOString(),
  }

  const query=id
    ? supabase.from('shipping_carrier_configs').update(payload).eq('id',id).select('*').single()
    : supabase.from('shipping_carrier_configs').insert(payload).select('*').single()
  const {data,error}=await query
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'SETTINGS',
    action:id?'UPDATE_SHIPPING_CARRIER_CONFIG':'CREATE_SHIPPING_CARRIER_CONFIG',
    entity_type:'SHIPPING_CARRIER_CONFIG',
    entity_id:String(data?.id??id),
    old_value:null,
    new_value:data,
    source:'USER',
  })

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

export async function quickAddTrackingNumber(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderId=text(formData.get('order_id'))
  const trackingNumber=text(formData.get('tracking_number'))
  const carrierConfigId=text(formData.get('carrier_config_id'))
  if(!orderId||!trackingNumber)throw new Error('Thiếu đơn hàng hoặc mã vận đơn')

  let carrier:string|null=null
  if(carrierConfigId){
    const {data:carrierConfig,error:carrierError}=await supabase
      .from('shipping_carrier_configs')
      .select('id,display_name,is_active,supports_tracking')
      .eq('id',carrierConfigId)
      .eq('is_active',true)
      .eq('supports_tracking',true)
      .maybeSingle()
    if(carrierError)throw new Error(carrierError.message)
    if(!carrierConfig)throw new Error('ĐVVC đã bị tắt hoặc không còn tồn tại')
    carrier=carrierConfig.display_name
  }else{
    carrier=await resolveCarrierName(supabase,trackingNumber,null)
  }
  if(!carrier)throw new Error('Chưa xác định được ĐVVC. Hãy chọn ĐVVC trong cập nhật nhanh.')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')
  if(order.shipping_service==='EXPRESS')throw new Error('Đơn Hỏa tốc không sử dụng mã vận đơn tracking')

  const {data:activeRows,error:activeError}=await supabase
    .from('shipments')
    .select('id,tracking_number,carrier,is_active')
    .eq('order_id',orderId)
    .eq('is_active',true)
  if(activeError)throw new Error(activeError.message)

  const active=(activeRows??[])[0]??null
  if(active?.tracking_number){
    throw new Error('Đơn này đã có mã vận đơn. Hãy dùng chức năng cập nhật MVĐ trong chi tiết đơn.')
  }

  const next=nextTrackAt(new Date(),'READY_TO_SHIP')
  if(active?.id){
    const {error}=await supabase.from('shipments').update({
      tracking_number:trackingNumber,
      carrier,
      current_tracking_status:'READY_TO_SHIP',
      tracking_enabled:true,
      tracking_interval_minutes:120,
      next_track_at:next?.toISOString()??null,
    }).eq('id',active.id)
    if(error)throw new Error(error.message)
  }else{
    const {error}=await supabase.from('shipments').insert({
      order_id:orderId,
      tracking_number:trackingNumber,
      carrier,
      current_tracking_status:'READY_TO_SHIP',
      tracking_enabled:true,
      tracking_interval_minutes:120,
      next_track_at:next?.toISOString()??null,
      is_active:true,
    })
    if(error)throw new Error(error.message)
  }

  const {error:orderStatusError}=await supabase
    .from('orders')
    .update({order_status:'PROCESSING'})
    .eq('id',orderId)
  if(orderStatusError)throw new Error(orderStatusError.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'QUICK_ADD_TRACKING_NUMBER',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{tracking_number:null,carrier:active?.carrier??null},
    new_value:{tracking_number:trackingNumber,carrier},
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
  revalidatePath('/purchase')
  redirect(returnHref('/purchase/orders',returnQuery))
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
  redirect(returnHref('/purchase/orders',returnQuery,{order:orderId,mode:null,settings:null,tab:'tracking'}))
}
