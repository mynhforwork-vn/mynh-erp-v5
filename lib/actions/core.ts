'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'

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
  if(role!=='admin')throw new Error('Chỉ Admin được thực hiện thao tác này')
}

async function trackingScheduleFromDb(supabase:any,status:string){
  const from=new Date().toISOString()
  const [{data:interval,error:intervalError},{data:next,error:nextError}]=await Promise.all([
    supabase.rpc('tracking_interval_minutes',{p_status:status}),
    supabase.rpc('next_tracking_at',{p_from:from,p_status:status}),
  ])
  if(intervalError)throw new Error(intervalError.message)
  if(nextError)throw new Error(nextError.message)
  return {
    interval:interval===null?null:Number(interval),
    nextAt:next?String(next):null,
  }
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


function bulkUserIds(formData:FormData){
  const ids=[...new Set(formData.getAll('user_ids').map(v=>text(v)).filter(Boolean))]
  if(!ids.length)throw new Error('Chưa chọn User')
  if(ids.length>200)throw new Error('Tối đa 200 User mỗi lần thao tác')
  return ids
}

export async function archiveERPUsersBulk(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const userIds=bulkUserIds(formData)

  const {data:rows,error:readError}=await supabase
    .from('erp_users')
    .select('id,username,status,archived_at')
    .in('id',userIds)
  if(readError)throw new Error(readError.message)
  if((rows??[]).length!==userIds.length)throw new Error('Có User không tồn tại hoặc không có quyền truy cập')
  if((rows??[]).some((x:any)=>x.archived_at))throw new Error('Có User đã được lưu trữ. Hãy bỏ chọn các User đó.')

  const archivedAt=new Date().toISOString()
  const {error}=await supabase.from('erp_users').update({
    archived_at:archivedAt,
    archived_by:user.id,
  }).in('id',userIds)
  if(error)throw new Error(error.message)

  const audits=(rows??[]).map((row:any)=>({
    actor_user_id:user.id,
    module:'USERS',
    action:'ARCHIVE_USER',
    entity_type:'ERP_USER',
    entity_id:String(row.id),
    old_value:{archived_at:null,username:row.username,status:row.status},
    new_value:{archived_at:archivedAt,username:row.username,status:row.status,bulk:true},
    source:'USER',
  }))
  if(audits.length){
    const {error:auditError}=await supabase.from('audit_logs').insert(audits)
    if(auditError)throw new Error(auditError.message)
  }

  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(returnHref('/purchase/accounts',returnQuery,{user:null,mode:null,tab:null,archive:null}))
}

export async function restoreERPUsersBulk(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const userIds=bulkUserIds(formData)

  const {data:rows,error:readError}=await supabase
    .from('erp_users')
    .select('id,username,status,archived_at')
    .in('id',userIds)
  if(readError)throw new Error(readError.message)
  if((rows??[]).length!==userIds.length)throw new Error('Có User không tồn tại hoặc không có quyền truy cập')
  if((rows??[]).some((x:any)=>!x.archived_at))throw new Error('Có User chưa được lưu trữ. Hãy bỏ chọn các User đó.')

  const {error}=await supabase.from('erp_users').update({
    archived_at:null,
    archived_by:null,
  }).in('id',userIds)
  if(error)throw new Error(error.message)

  const audits=(rows??[]).map((row:any)=>({
    actor_user_id:user.id,
    module:'USERS',
    action:'RESTORE_USER',
    entity_type:'ERP_USER',
    entity_id:String(row.id),
    old_value:{archived_at:row.archived_at,username:row.username,status:row.status},
    new_value:{archived_at:null,username:row.username,status:row.status,bulk:true},
    source:'USER',
  }))
  if(audits.length){
    const {error:auditError}=await supabase.from('audit_logs').insert(audits)
    if(auditError)throw new Error(auditError.message)
  }

  revalidatePath('/purchase/accounts')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(returnHref('/purchase/accounts',returnQuery,{user:null,mode:null,tab:null,archive:'archived'}))
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
    .select('carrier_code,display_name,tracking_prefixes')
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
  return matched?.carrier_code??null
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
  const trackingNumber=text(formData.get('tracking_number'))
  const carrier=isExpress
    ? (trackingNumber?'Hỏa tốc':null)
    : await resolveCarrierName(supabase,trackingNumber,text(formData.get('carrier')))
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
    if(isExpress&&trackingNumber){
      const {error:shipmentError}=await supabase.from('shipments').update({
        carrier:'Hỏa tốc',
        is_active:true,
        tracking_enabled:false,
        current_tracking_status:'UNKNOWN',
        next_track_at:null,
        locked_until:null,
      }).eq('order_id',data).eq('is_active',true)
      if(shipmentError)throw new Error(shipmentError.message)
    }
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
  const trackingNumber=text(formData.get('tracking_number'))
  const carrier=isExpress
    ? (trackingNumber?'Hỏa tốc':null)
    : await resolveCarrierName(supabase,trackingNumber,text(formData.get('carrier')))
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
    const {error:shipmentError}=trackingNumber
      ? await supabase.from('shipments').update({
          carrier:'Hỏa tốc',
          is_active:true,
          tracking_enabled:false,
          current_tracking_status:'UNKNOWN',
          next_track_at:null,
          locked_until:null,
          replaced_at:null,
        }).eq('order_id',orderId).eq('is_active',true)
      : await supabase.from('shipments').update({
          is_active:false,
          tracking_enabled:false,
          next_track_at:null,
          locked_until:null,
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
    .select('id,shopee_order_id,shipping_service,archived_at,archived_by,shipments(id,tracking_number,current_tracking_status,tracking_interval_minutes,is_active)')
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
    row.shipping_service!=='EXPRESS' &&
    active?.tracking_number &&
    status &&
    !['DELIVERED','CANCELLED','RETURNED'].includes(status)
  )
  if(active?.id){
    const schedule=shouldTrack?await trackingScheduleFromDb(supabase,status):{interval:null,nextAt:null}
    const {error:shipmentError}=await supabase.from('shipments').update({
      tracking_enabled:shouldTrack&&schedule.interval!==null,
      tracking_interval_minutes:schedule.interval??active.tracking_interval_minutes??120,
      next_track_at:schedule.nextAt,
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
  redirect(returnHref('/purchase/orders',returnQuery,{
    order:null,
    mode:null,
    tab:null,
    archive:row.archived_at?'archived':null,
  }))
}


function bulkOrderIds(formData:FormData){
  const ids=[...new Set(formData.getAll('order_ids').map(v=>text(v)).filter(Boolean))]
  if(!ids.length)throw new Error('Chưa chọn đơn')
  if(ids.length>200)throw new Error('Tối đa 200 đơn mỗi lần thao tác')
  return ids
}

async function orderDeleteBlockers(supabase:any,orderIds:string[]){
  const blockedIds=new Set<string>()
  if(!orderIds.length)return {blockedIds,error:null as any}

  for(let i=0;i<orderIds.length;i+=200){
    const chunk=orderIds.slice(i,i+200)
    const [receiveRefs,paymentRefs,transferRefs]=await Promise.all([
      supabase.from('receive_batch_details').select('order_id').in('order_id',chunk),
      supabase.from('shipper_payment_details').select('order_id').in('order_id',chunk),
      supabase.from('transfer_items').select('order_id').in('order_id',chunk),
    ])
    const error=receiveRefs.error??paymentRefs.error??transferRefs.error
    if(error)return {blockedIds:new Set<string>(),error}
    for(const row of receiveRefs.data??[])blockedIds.add(String((row as any).order_id))
    for(const row of paymentRefs.data??[])blockedIds.add(String((row as any).order_id))
    for(const row of transferRefs.data??[])blockedIds.add(String((row as any).order_id))
  }

  return {blockedIds,error:null}
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
    .select('id,shopee_order_id,shipping_service,archived_at,archived_by,shipments(id,tracking_number,current_tracking_status,tracking_interval_minutes,is_active)')
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
        row.shipping_service!=='EXPRESS' &&
        active.tracking_number &&
        status &&
        !['DELIVERED','CANCELLED','RETURNED'].includes(status)
      )
      const schedule=shouldTrack?await trackingScheduleFromDb(supabase,status):{interval:null,nextAt:null}
      const {error:shipmentError}=await supabase.from('shipments').update({
        tracking_enabled:shouldTrack&&schedule.interval!==null,
        tracking_interval_minutes:schedule.interval??active.tracking_interval_minutes??120,
        next_track_at:schedule.nextAt,
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
  const returnArchive=(rows??[]).every((x:any)=>Boolean(x.archived_at))?'archived':null

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
  redirect(returnHref('/purchase/orders',returnQuery,{order:null,mode:null,tab:null,archive:returnArchive}))
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
    .limit(1000)
  if(readError)throw new Error(readError.message)
  const archived=rows??[]
  if(!archived.length)throw new Error('Không có đơn lưu trữ để dọn')

  const orderIds=archived.map((x:any)=>String(x.id))
  const blockers=await orderDeleteBlockers(supabase,orderIds)
  if(blockers.error)throw new Error(blockers.error.message)
  const eligible=archived.filter((x:any)=>!blockers.blockedIds.has(String(x.id))).slice(0,200)
  if(!eligible.length)throw new Error('Không có đơn lưu trữ nào đủ điều kiện xóa vĩnh viễn trong phạm vi kiểm tra')

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
      batch_limit:200,
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
    carrier_code:text(formData.get('carrier_code')).toUpperCase()||'SPX',
    tracking_location_aliases:keywordList(formData.get('tracking_location_aliases')),
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
    .select('id,hub_code,area,region,province_keywords,district_keywords,address_keywords,carrier_code,tracking_location_aliases,priority,is_active')
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
  const returnPath=text(formData.get('return_path'))
  const returnOrderId=text(formData.get('return_order_id'))
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
  if(returnPath==='orders'){
    redirect(returnHref('/purchase/orders',returnQuery,{
      order:returnOrderId||orderIds[0]||null,
      tab:'warehouse',
      mode:null,
    }))
  }

  redirect(returnHref('/purchase/tracking',returnQuery,{
    received:String(data?.receive_batch_id??''),
    payment:data?.shipper_payment_id?String(data.shipper_payment_id):null,
  }))
}

export async function markExpressDelivered(formData:FormData){
  const {supabase,user}=await actor()
  const orderId=text(formData.get('order_id'))
  const returnQuery=text(formData.get('return_query'))
  if(!orderId)throw new Error('Thiếu đơn Hỏa tốc cần cập nhật')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service,order_status,receive_status,archived_at')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')
  if(order.archived_at)throw new Error('Không thể cập nhật đơn đã lưu trữ')
  if(order.shipping_service!=='EXPRESS')throw new Error('Chức năng này chỉ dành cho đơn Hỏa tốc')
  if(['CANCELLED','RETURNED'].includes(String(order.order_status??'').toUpperCase())){
    throw new Error('Không thể cập nhật giao thành công cho đơn đã hủy/hoàn')
  }
  if(order.receive_status==='RECEIVED')throw new Error('Đơn đã được xác nhận nhận hàng')

  const {error}=await supabase
    .from('orders')
    .update({
      order_status:'COMPLETED',
      express_delivery_status:'DELIVERED',
      receive_status:'WAITING_RECEIVE',
      updated_at:new Date().toISOString(),
    })
    .eq('id',orderId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'EXPRESS_MARK_DELIVERED',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{
      order_status:order.order_status,
      receive_status:order.receive_status,
    },
    new_value:{
      order_status:'COMPLETED',
      express_delivery_status:'DELIVERED',
      receive_status:'WAITING_RECEIVE',
    },
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  redirect(returnHref('/purchase/orders',returnQuery,{
    order:orderId,
    tab:'info',
    mode:null,
  }))
}

export async function markExpressDeliveryFailed(formData:FormData){
  const {supabase,user}=await actor()
  const orderId=text(formData.get('order_id'))
  const returnQuery=text(formData.get('return_query'))
  if(!orderId)throw new Error('Thiếu đơn Hỏa tốc cần cập nhật')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service,order_status,receive_status,express_delivery_status,archived_at')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')
  if(order.archived_at)throw new Error('Không thể cập nhật đơn đã lưu trữ')
  if(order.shipping_service!=='EXPRESS')throw new Error('Chức năng này chỉ dành cho đơn Hỏa tốc')
  if(order.receive_status==='RECEIVED')throw new Error('Đơn đã được xác nhận nhận hàng')
  if(String(order.order_status??'').toUpperCase()==='CANCELLED')throw new Error('Đơn đã hủy')

  const {error}=await supabase
    .from('orders')
    .update({
      order_status:'PROCESSING',
      express_delivery_status:'FAILED',
      receive_status:'NOT_READY',
      updated_at:new Date().toISOString(),
    })
    .eq('id',orderId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'EXPRESS_DELIVERY_FAILED',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{
      order_status:order.order_status,
      express_delivery_status:order.express_delivery_status,
      receive_status:order.receive_status,
    },
    new_value:{
      order_status:'PROCESSING',
      express_delivery_status:'FAILED',
      receive_status:'NOT_READY',
    },
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(returnHref('/purchase/orders',returnQuery,{
    order:orderId,
    tab:'info',
    mode:null,
  }))
}

export async function retryExpressDelivery(formData:FormData){
  const {supabase,user}=await actor()
  const orderId=text(formData.get('order_id'))
  const returnQuery=text(formData.get('return_query'))
  if(!orderId)throw new Error('Thiếu đơn Hỏa tốc cần cập nhật')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service,order_status,receive_status,express_delivery_status,archived_at')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')
  if(order.archived_at)throw new Error('Không thể cập nhật đơn đã lưu trữ')
  if(order.shipping_service!=='EXPRESS')throw new Error('Chức năng này chỉ dành cho đơn Hỏa tốc')
  if(order.receive_status==='RECEIVED')throw new Error('Đơn đã được xác nhận nhận hàng')
  if(String(order.order_status??'').toUpperCase()==='CANCELLED')throw new Error('Đơn đã hủy')

  const {error}=await supabase
    .from('orders')
    .update({
      order_status:'PROCESSING',
      express_delivery_status:'PROCESSING',
      receive_status:'NOT_READY',
      updated_at:new Date().toISOString(),
    })
    .eq('id',orderId)
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'ORDERS',
    action:'EXPRESS_RETRY_DELIVERY',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{
      express_delivery_status:order.express_delivery_status,
      receive_status:order.receive_status,
    },
    new_value:{
      express_delivery_status:'PROCESSING',
      receive_status:'NOT_READY',
    },
    source:'USER',
  })

  revalidatePath('/purchase/orders')
  revalidatePath('/purchase')
  redirect(returnHref('/purchase/orders',returnQuery,{
    order:orderId,
    tab:'info',
    mode:null,
  }))
}

export async function quickAddTrackingNumber(formData:FormData){
  const {supabase,user}=await actor()
  const returnQuery=text(formData.get('return_query'))
  const orderId=text(formData.get('order_id'))
  const trackingNumber=text(formData.get('tracking_number'))
  const carrierConfigId=text(formData.get('carrier_config_id'))
  if(!orderId||!trackingNumber)throw new Error('Thiếu đơn hàng hoặc mã vận đơn')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')

  const isExpress=order.shipping_service==='EXPRESS'
  let carrier:string|null=null
  if(isExpress){
    carrier='Hỏa tốc'
  }else if(carrierConfigId){
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

  const schedule=isExpress?{interval:null,nextAt:null}:await trackingScheduleFromDb(supabase,'READY_TO_SHIP')
  const trackingStatus=isExpress?'UNKNOWN':'READY_TO_SHIP'
  if(active?.id){
    const {error}=await supabase.from('shipments').update({
      tracking_number:trackingNumber,
      carrier,
      current_tracking_status:trackingStatus,
      tracking_enabled:!isExpress,
      tracking_interval_minutes:schedule.interval??120,
      next_track_at:schedule.nextAt,
      locked_until:null,
    }).eq('id',active.id)
    if(error)throw new Error(error.message)
  }else{
    const {error}=await supabase.from('shipments').insert({
      order_id:orderId,
      tracking_number:trackingNumber,
      carrier,
      current_tracking_status:trackingStatus,
      tracking_enabled:!isExpress,
      tracking_interval_minutes:schedule.interval??120,
      next_track_at:schedule.nextAt,
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
  if(!orderId||!trackingNumber)throw new Error('Thiếu đơn hàng hoặc mã vận đơn')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,shipping_service')
    .eq('id',orderId)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại')
  const isExpress=order.shipping_service==='EXPRESS'
  const carrier=isExpress?'Hỏa tốc':(text(formData.get('carrier'))||null)

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

  const schedule=isExpress?{interval:null,nextAt:null}:await trackingScheduleFromDb(supabase,'READY_TO_SHIP')
  const {error:newError}=await supabase.from('shipments').insert({
    order_id:orderId,tracking_number:trackingNumber,carrier,
    current_tracking_status:isExpress?'UNKNOWN':'READY_TO_SHIP',
    tracking_enabled:!isExpress&&schedule.interval!==null,
    tracking_interval_minutes:schedule.interval??120,
    next_track_at:schedule.nextAt,
    is_active:true
  })
  if(newError){
    if(ids.length)await supabase.from('shipments').update({
      is_active:true,
      tracking_enabled:!isExpress,
    }).in('id',ids)
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
  redirect(returnHref('/purchase/orders',returnQuery,{order:orderId,mode:null,settings:null,tab:isExpress?'info':'tracking'}))
}


export async function bulkImportERPUsers(rows:Array<{
  username:string
  phone?:string|null
  email?:string|null
  status?:string|null
  mobile?:boolean
  web?:boolean
  note?:string|null
  spc_f?:string|null
  spc_st?:string|null
}>){
  try{
    const {supabase}=await actor()
    if(!Array.isArray(rows)||!rows.length)return {ok:false as const,error:'Không có dữ liệu để import'}
    if(rows.length>200)return {ok:false as const,error:'Tối đa 200 User mỗi lần import'}

    const normalized=rows.map(row=>({
      username:String(row.username??'').trim(),
      phone:String(row.phone??'').trim()||null,
      email:String(row.email??'').trim()||null,
      status:String(row.status??'').trim()||'Active',
      mobile:Boolean(row.mobile),
      web:Boolean(row.web),
      note:String(row.note??'').trim()||null,
      spc_f:String(row.spc_f??'').trim()||null,
      spc_st:String(row.spc_st??'').trim()||null,
    }))

    if(normalized.some(row=>!row.username))return {ok:false as const,error:'Có dòng thiếu Username'}

    const {data,error}=await supabase.rpc('bulk_create_erp_users',{p_rows:normalized})
    if(error){
      const raw=String(error.message??'')
      const friendly=
        raw.includes('trùng trong dữ liệu')?raw:
        raw.includes('đã tồn tại')?raw:
        raw.includes('Trạng thái')?raw:
        raw.includes('200 User')?raw:
        'Không thể import User'
      return {ok:false as const,error:friendly,detail:raw}
    }

    revalidatePath('/purchase/accounts')
    revalidatePath('/users')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể import User')}
  }
}


export async function deleteERPUserPermanent(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const returnQuery=text(formData.get('return_query'))
  const userId=text(formData.get('user_id'))
  const confirmText=text(formData.get('confirm_text'))
  if(!userId)throw new Error('Thiếu User cần xóa')

  const {data:row,error:readError}=await supabase
    .from('erp_users')
    .select('id,username,archived_at,order_count')
    .eq('id',userId)
    .maybeSingle()
  if(readError)throw new Error(readError.message)
  if(!row)throw new Error('User không tồn tại')
  if(!row.archived_at)throw new Error('Cần lưu trữ User trước khi xóa vĩnh viễn')
  if(confirmText!==row.username)throw new Error('Username xác nhận chưa đúng')
  if(Number(row.order_count??0)>0)throw new Error('User có đơn hàng liên kết; chỉ được lưu trữ')

  const {error}=await supabase.rpc('delete_erp_user_permanent',{p_user_id:userId})
  if(error)throw new Error(error.message)

  revalidatePath('/purchase/accounts')
  revalidatePath('/users')
  redirect(returnHref('/purchase/accounts',returnQuery,{user:null,mode:null,tab:null,archive:'archived'}))
}


export async function updateSystemUserRole(input:{user_id:string,role:'admin'|'operator'|'viewer'}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const userId=String(input?.user_id??'').trim()
    const nextRole=String(input?.role??'viewer').trim().toLowerCase()
    if(!userId)return {ok:false as const,error:'Thiếu tài khoản hệ thống'}
    if(!['admin','operator','viewer'].includes(nextRole))return {ok:false as const,error:'Vai trò không hợp lệ'}

    const {data,error}=await supabase.rpc('admin_set_system_user_role',{
      p_user_id:userId,
      p_role:nextRole,
    })
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/settings')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể cập nhật phân quyền')}
  }
}

export async function sendSystemUserPasswordReset(input:{email:string}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const email=String(input?.email??'').trim().toLowerCase()
    if(!email)return {ok:false as const,error:'Tài khoản chưa có email'}
    const {error}=await supabase.auth.resetPasswordForEmail(email)
    if(error)return {ok:false as const,error:error.message}
    return {ok:true as const}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể gửi yêu cầu cấp lại mật khẩu')}
  }
}

export async function resetERPSystemData(input:{scope:'DATA'|'ALL',confirm:string}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const scope=input.scope
    const confirm=String(input.confirm??'').trim()
    const {data,error}=await supabase.rpc('admin_reset_erp_data',{
      p_scope:scope,
      p_confirm:confirm,
    })
    if(error)return {ok:false as const,error:error.message}
    revalidatePath('/')
    revalidatePath('/purchase')
    revalidatePath('/purchase/accounts')
    revalidatePath('/purchase/orders')
    revalidatePath('/purchase/tracking')
    revalidatePath('/warehouse')
    revalidatePath('/warehouse/inventory')
    revalidatePath('/warehouse/history')
    revalidatePath('/sales')
    revalidatePath('/sales/pos')
    revalidatePath('/sales/history')
    revalidatePath('/sales/customers')
    revalidatePath('/sales/debt')
    revalidatePath('/finance')
    revalidatePath('/settings')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể reset dữ liệu hệ thống')}
  }
}


export async function createSystemUserAccount(input:{
  email:string
  password:string
  role:'admin'|'operator'|'viewer'
}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const email=String(input?.email??'').trim().toLowerCase()
    const password=String(input?.password??'')
    const nextRole=String(input?.role??'viewer').trim().toLowerCase()
    if(!email||!email.includes('@'))return {ok:false as const,error:'Email không hợp lệ'}
    if(password.length<10)return {ok:false as const,error:'Mật khẩu tạm cần ít nhất 10 ký tự'}
    if(!['admin','operator','viewer'].includes(nextRole))return {ok:false as const,error:'Vai trò không hợp lệ'}

    const {data,error}=await supabase.functions.invoke('admin-system-users',{
      body:{action:'create',email,password,role:nextRole},
    })
    if(error)return {ok:false as const,error:String((data as any)?.error??error.message??'Không thể tạo tài khoản')}
    if((data as any)?.error)return {ok:false as const,error:String((data as any).error)}

    revalidatePath('/settings')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể tạo tài khoản hệ thống')}
  }
}

export async function setSystemUserTemporaryPassword(input:{
  user_id:string
  password:string
}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const userId=String(input?.user_id??'').trim()
    const password=String(input?.password??'')
    if(!userId)return {ok:false as const,error:'Thiếu tài khoản hệ thống'}
    if(password.length<10)return {ok:false as const,error:'Mật khẩu mới cần ít nhất 10 ký tự'}

    const {data,error}=await supabase.functions.invoke('admin-system-users',{
      body:{action:'set_password',user_id:userId,password},
    })
    if(error)return {ok:false as const,error:String((data as any)?.error??error.message??'Không thể cấp lại mật khẩu')}
    if((data as any)?.error)return {ok:false as const,error:String((data as any).error)}
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể cấp lại mật khẩu')}
  }
}


export async function deleteSystemUserAccount(input:{user_id:string}){
  try{
    const {supabase,role}=await actor()
    requireAdmin(role)
    const userId=String(input?.user_id??'').trim()
    if(!userId)return {ok:false as const,error:'Thiếu tài khoản hệ thống'}

    const {data,error}=await supabase.functions.invoke('admin-system-users',{
      body:{action:'delete',user_id:userId},
    })
    if(error)return {ok:false as const,error:String((data as any)?.error??error.message??'Không thể xóa tài khoản')}
    if((data as any)?.error)return {ok:false as const,error:String((data as any).error)}

    revalidatePath('/settings')
    return {ok:true as const,data}
  }catch(error:any){
    return {ok:false as const,error:String(error?.message??'Không thể xóa tài khoản hệ thống')}
  }
}


export async function saveTrackingProviderConfig(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const carrier=text(formData.get('carrier')).toUpperCase()
  const adapterType=text(formData.get('adapter_type')).toUpperCase()||'NORMALIZED_JSON'
  const endpoint=text(formData.get('endpoint_url'))
  const method=text(formData.get('http_method')).toUpperCase()||'GET'
  const timeoutRaw=Number(text(formData.get('timeout_ms'))||8000)
  if(!carrier)throw new Error('Thiếu ĐVVC cần cấu hình Tracking Provider')
  const {error}=await supabase.rpc('save_tracking_provider_config_secure_v2',{
    p_carrier:carrier,
    p_enabled:formData.get('enabled')==='on',
    p_adapter_type:adapterType,
    p_endpoint_url:endpoint,
    p_http_method:method,
    p_timeout_ms:Number.isFinite(timeoutRaw)?Math.round(timeoutRaw):8000,
    p_auth_header_name:text(formData.get('auth_header_name'))||null,
    p_auth_secret:text(formData.get('auth_secret'))||null,
    p_clear_secret:formData.get('clear_secret')==='on',
  })
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function saveTrackingRuntimeSettings(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const retry=keywordList(formData.get('retry_minutes'))
    .map(v=>Number(v))
    .filter(v=>Number.isFinite(v))
    .map(v=>Math.round(v))
  const {error}=await supabase.rpc('save_tracking_runtime_settings_secure',{
    p_enabled:formData.get('auto_tracking_enabled')==='on',
    p_quiet_start:text(formData.get('quiet_start'))||'02:00',
    p_quiet_end:text(formData.get('quiet_end'))||'06:00',
    p_retry_minutes:retry.length?retry:[10,30,60],
  })
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function saveTrackingRule(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const status=text(formData.get('status_code')).toUpperCase()
  const interval=Number(text(formData.get('interval_minutes')))
  if(!status)throw new Error('Thiếu trạng thái Tracking')
  const {error}=await supabase.rpc('save_tracking_rule_secure',{
    p_status_code:status,
    p_interval_minutes:Number.isFinite(interval)?Math.round(interval):null,
    p_auto_tracking:formData.get('auto_tracking')==='on',
  })
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function saveCarrierStatusMapping(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const carrier=text(formData.get('carrier')).toUpperCase()
  const rawCode=text(formData.get('raw_code')).toUpperCase()
  const canonical=text(formData.get('canonical_status')).toUpperCase()
  if(!carrier||!rawCode||!canonical)throw new Error('Thiếu Carrier, raw code hoặc trạng thái chuẩn')
  const {error}=await supabase.rpc('save_carrier_status_mapping_secure',{
    p_carrier:carrier,
    p_raw_code:rawCode,
    p_raw_name:text(formData.get('raw_name'))||null,
    p_canonical_status:canonical,
    p_is_active:formData.get('is_active')==='on',
  })
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function testTrackingConnection(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const trackingNumber=text(formData.get('tracking_number'))
  const carrier=text(formData.get('carrier')).toUpperCase()||'SPX'
  if(!trackingNumber)throw new Error('Nhập mã vận đơn để test Tracking')
  const {data,error}=await supabase.functions.invoke('tracking-dispatcher',{
    body:{test_tracking_number:trackingNumber,carrier},
  })
  const params=new URLSearchParams({section:'tracking'})
  if(error||data?.ok!==true){
    params.set('tracking_test','fail')
    params.set('tracking_message',String(error?.message??data?.error??'Không kết nối được Tracking').slice(0,180))
  }else{
    params.set('tracking_test','ok')
    params.set('tracking_message',[
      String(data.latest_status??'UNKNOWN'),
      data.latest_raw_code?String(data.latest_raw_code):'',
      data.destination_hub?String(data.destination_hub):'',
      `${Number(data.event_count??0)} events`,
    ].filter(Boolean).join(' · ').slice(0,180))
  }
  redirect('/settings?'+params.toString())
}

export async function saveTelegramAlertSettings(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const alertTypes=formData.getAll('alert_types').map(v=>text(v)).filter(Boolean)
  const {error}=await supabase.rpc('save_telegram_alert_settings_secure',{
    p_enabled:formData.get('enabled')==='on',
    p_default_chat_id:text(formData.get('default_chat_id'))||null,
    p_alert_types:alertTypes,
    p_bot_token:text(formData.get('bot_token'))||null,
    p_clear_token:formData.get('clear_token')==='on',
  })
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function saveTelegramAlertDestination(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const id=text(formData.get('destination_id'))
  const destinationHub=text(formData.get('destination_hub'))
  const chatId=text(formData.get('chat_id'))
  if(!destinationHub||!chatId)throw new Error('Thiếu HUB hoặc Telegram Chat ID')
  const payload={
    destination_hub:destinationHub,
    chat_id:chatId,
    alert_types:formData.getAll('alert_types').map(v=>text(v)).filter(Boolean),
    is_active:formData.get('is_active')==='on',
    updated_at:new Date().toISOString(),
  }
  const mutation=id
    ? supabase.from('telegram_alert_destinations').update(payload).eq('id',id)
    : supabase.from('telegram_alert_destinations').upsert(payload,{onConflict:'destination_hub'})
  const {error}=await mutation
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function deleteTelegramAlertDestination(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const id=text(formData.get('destination_id'))
  if(!id)throw new Error('Thiếu cấu hình Telegram HUB cần xoá')
  const {error}=await supabase.from('telegram_alert_destinations').delete().eq('id',id)
  if(error)throw new Error(error.message)
  revalidatePath('/settings')
}

export async function testTelegramConnection(formData:FormData){
  const {supabase,role}=await actor()
  requireAdmin(role)
  const chatId=text(formData.get('chat_id'))
  const {data,error}=await supabase.functions.invoke('telegram-alert-dispatcher',{
    body:{test:true,chat_id:chatId||undefined},
  })
  const params=new URLSearchParams({section:'tracking-alerts'})
  if(error||data?.ok!==true){
    params.set('telegram_test','fail')
    params.set('telegram_message',String(error?.message??data?.error??'Không gửi được tin thử').slice(0,180))
  }else{
    params.set('telegram_test','ok')
  }
  redirect('/settings?'+params.toString())
}
