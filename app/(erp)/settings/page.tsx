import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { DestinationHubSettings } from '@/components/destination-hub-config-panel'
import { ShippingCarrierSettings } from '@/components/shipping-carrier-settings'
import { DataManagementSettings } from '@/components/data-management-settings'
import { BankTransferSettings } from '@/components/bank-transfer-settings'
import { SystemAccessSettings } from '@/components/system-access-settings'
import { TrackingTelegramSettings } from '@/components/tracking-telegram-settings'
import { TrackingSettings } from '@/components/tracking-settings'

type SP={section?:string,purged?:string,protected?:string,telegram_test?:string,telegram_message?:string,tracking_test?:string,tracking_message?:string}

export default async function SettingsPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canEdit=['admin','operator'].includes(role)
  const canEditTracking=role==='admin'
  const section=sp.section==='spx-hubs'
    ? 'spx-hubs'
    : sp.section==='tracking'&&['admin','operator'].includes(role)
      ? 'tracking'
      : sp.section==='tracking-alerts'&&['admin','operator'].includes(role)
        ? 'tracking-alerts'
      : sp.section==='telegram'&&['admin','operator'].includes(role)
        ? 'telegram'
      : sp.section==='data-management'
        ? 'data-management'
        : sp.section==='payments'
        ? 'payments'
        : sp.section==='access'&&role==='admin'
          ? 'access'
          : 'shipping-carriers'

  const [
    {data:carrierRows,error:carrierError},
    {data:hubRows,error:hubError},
    {data:shipperRows,error:shipperError},
    {data:assignmentRows,error:assignmentError},
    activeOrdersResult,
    archivedOrdersResult,
    activeUsersResult,
    archivedUsersResult,
    bankTransferResult,
    trackingProviderResult,
    trackingRuntimeResult,
    trackingRulesResult,
    trackingMappingsResult,
    unknownTrackingEventsResult,
    alertRulesResult,
    telegramSettingsResult,
    telegramDestinationsResult,
  ]=await Promise.all([
    supabase.from('shipping_carrier_configs')
      .select('id,carrier_code,display_name,tracking_prefixes,supports_tracking,supports_destination_hub,priority,is_active,note')
      .order('priority',{ascending:true})
      .order('display_name',{ascending:true})
      .limit(200),
    supabase.from('destination_hub_configs')
      .select('id,hub_code,area,region,province_keywords,district_keywords,address_keywords,carrier_code,tracking_location_aliases,priority,is_active')
      .order('priority',{ascending:true})
      .order('hub_code',{ascending:true})
      .limit(500),
    supabase.from('destination_shippers')
      .select('id,name,phone,note,is_active')
      .order('name',{ascending:true})
      .limit(500),
    supabase.from('destination_hub_shipper_assignments')
      .select('hub_config_id,shipper_id,priority,is_active')
      .order('priority',{ascending:true})
      .limit(2000),
    supabase.from('orders').select('*',{count:'exact',head:true}).is('archived_at',null),
    supabase.from('orders').select('*',{count:'exact',head:true}).not('archived_at','is',null),
    supabase.from('erp_users').select('*',{count:'exact',head:true}).is('archived_at',null),
    supabase.from('erp_users').select('*',{count:'exact',head:true}).not('archived_at','is',null),
    supabase.from('bank_transfer_configs')
      .select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active')
      .eq('config_key','DEFAULT')
      .maybeSingle(),
    supabase.from('tracking_provider_configs')
      .select('carrier,enabled,adapter_type,endpoint_url,http_method,timeout_ms,auth_header_name,auth_secret_id')
      .order('carrier',{ascending:true}),
    supabase.from('tracking_runtime_settings')
      .select('auto_tracking_enabled,quiet_start,quiet_end,retry_minutes')
      .eq('id','main')
      .maybeSingle(),
    supabase.from('tracking_rule_configs')
      .select('status_code,label,phase,interval_minutes,auto_tracking,terminal,sort_order,is_active')
      .order('sort_order',{ascending:true}),
    supabase.from('carrier_status_mappings')
      .select('id,carrier,raw_code,raw_name,canonical_status,note,is_active,priority')
      .order('carrier',{ascending:true})
      .order('priority',{ascending:true})
      .order('raw_code',{ascending:true})
      .limit(500),
    supabase.from('tracking_events')
      .select('raw_status_code,raw_status_name,raw_description,source,created_at,shipment:shipments(carrier)')
      .eq('normalized_status','UNKNOWN')
      .order('created_at',{ascending:false})
      .limit(500),
    supabase.from('alert_rule_configs')
      .select('alert_type,label,enabled,in_app_enabled,telegram_enabled,batch_window_minutes,sort_order')
      .order('sort_order',{ascending:true}),
    supabase.from('telegram_alert_settings')
      .select('enabled,default_chat_id,bot_token_secret_id,retry_minutes,max_attempts,enabled_at')
      .eq('id','main')
      .maybeSingle(),
    supabase.from('telegram_alert_destinations')
      .select('id,destination_hub,chat_id,alert_types,is_active')
      .order('destination_hub',{ascending:true}),
  ])

  const assignments=(assignmentRows??[]) as any[]
  const configs=((hubRows??[]) as any[]).map((hub:any)=>({
    ...hub,
    shipper_ids:assignments
      .filter((a:any)=>a.hub_config_id===hub.id&&a.is_active)
      .map((a:any)=>a.shipper_id),
  }))

  const systemUsersResult=role==='admin'
    ? await supabase.rpc('admin_list_system_users')
    : {data:[],error:null}

  const systemUsers=role==='admin'
    ? (() => {
        const rows=[...((systemUsersResult.data??[]) as any[])]
        if(!rows.some((row:any)=>row.user_id===user.id)){
          rows.unshift({
            user_id:user.id,
            email:user.email??null,
            role:String(user.app_metadata?.role??'admin'),
            created_at:user.created_at,
            last_sign_in_at:user.last_sign_in_at??null,
            email_confirmed_at:user.email_confirmed_at??null,
            is_anonymous:Boolean((user as any).is_anonymous),
          })
        }
        return rows
      })()
    : []

  const error=carrierError??hubError??shipperError??assignmentError
    ??activeOrdersResult.error??archivedOrdersResult.error??activeUsersResult.error??archivedUsersResult.error
    ??bankTransferResult.error??trackingProviderResult.error??trackingRuntimeResult.error??trackingRulesResult.error??trackingMappingsResult.error??unknownTrackingEventsResult.error??alertRulesResult.error??telegramSettingsResult.error??telegramDestinationsResult.error
    ??systemUsersResult.error

  const unknownMap=new Map<string,{carrier:string;raw_code:string;raw_name:string|null;description:string|null;count:number}>()
  for(const row of (unknownTrackingEventsResult.data??[]) as any[]){
    const rawCode=String(row.raw_status_code??'').trim()
    if(!rawCode)continue
    const joined=Array.isArray(row.shipment)?row.shipment[0]:row.shipment
    const carrier=String(joined?.carrier??'UNKNOWN').trim().toUpperCase()||'UNKNOWN'
    const key=carrier+'|'+rawCode
    const current=unknownMap.get(key)
    if(current)current.count+=1
    else unknownMap.set(key,{
      carrier,
      raw_code:rawCode,
      raw_name:row.raw_status_name?String(row.raw_status_name):null,
      description:row.raw_description?String(row.raw_description):null,
      count:1,
    })
  }
  const unknownRaw=[...unknownMap.values()]

  const activeOrders=activeOrdersResult.count??0
  const archivedOrders=archivedOrdersResult.count??0
  const activeUsers=activeUsersResult.count??0
  const archivedUsers=archivedUsersResult.count??0
  const purged=sp.purged?Number(sp.purged):null
  const protectedCount=sp.protected?Number(sp.protected):null

  const roleLabel=role==='admin'?'Admin':role==='operator'?'Operator':'Viewer'

  const sectionMeta:Record<string,{title:string;description:string}>={
    'shipping-carriers':{title:'Vận chuyển',description:'Quản lý đơn vị vận chuyển, tiền tố mã vận đơn và khả năng Tracking/HUB.'},
    'spx-hubs':{title:'Kho đích & Shipper',description:'Cấu hình HUB đích, alias nhận diện SPX và Shipper phụ trách theo khu vực.'},
    tracking:{title:'Tracking',description:'Chu kỳ quét, provider, mapping trạng thái và hành vi tự động của Tracking Engine.'},
    'tracking-alerts':{title:'Alerts',description:'Quy định trạng thái nào tạo cảnh báo, kênh In-app/Telegram và thời gian gom chống spam.'},
    telegram:{title:'Telegram',description:'Cấu hình Bot, Chat ID, retry và routing nhóm Telegram theo HUB.'},
    payments:{title:'Thanh toán & QR',description:'Cấu hình tài khoản nhận tiền và VietQR dùng trong POS/phiếu thu.'},
    access:{title:'Tài khoản & quyền',description:'Quản lý tài khoản hệ thống và quyền Admin / Operator / Viewer.'},
    'data-management':{title:'Dữ liệu',description:'Lưu trữ, dọn dữ liệu và kiểm soát dữ liệu vận hành của ERP.'},
  }
  const activeMeta=sectionMeta[section]??sectionMeta['shipping-carriers']

  return <div className="settings-screen settings-screen-v3 settings-screen-v5">
    <header className="settings-page-head-v5">
      <div>
        <span className="module-eyebrow">HỆ THỐNG</span>
        <h1>Cài đặt hệ thống</h1>
        <p>Cấu hình vận hành, tự động hóa, thanh toán, dữ liệu và quyền truy cập MYNH ERP.</p>
      </div>
      <span className="settings-role-badge">{roleLabel}</span>
    </header>

    {error&&<div className="error-box">Không thể tải cấu hình hệ thống: {error.message}</div>}

    <nav className="settings-page-tabs-v3 settings-tabs-v5" aria-label="Cài đặt hệ thống">
      <Link className={section==='shipping-carriers'?'active':''} href="/settings?section=shipping-carriers">Vận chuyển</Link>
      <Link className={section==='spx-hubs'?'active':''} href="/settings?section=spx-hubs">Kho đích & Shipper</Link>
      {['admin','operator'].includes(role)&&<Link className={section==='tracking'?'active':''} href="/settings?section=tracking">Tracking</Link>}
      {['admin','operator'].includes(role)&&<Link className={section==='tracking-alerts'?'active':''} href="/settings?section=tracking-alerts">Alerts</Link>}
      {['admin','operator'].includes(role)&&<Link className={section==='telegram'?'active':''} href="/settings?section=telegram">Telegram</Link>}
      <Link className={section==='payments'?'active':''} href="/settings?section=payments">Thanh toán & QR</Link>
      {role==='admin'&&<Link className={section==='access'?'active':''} href="/settings?section=access">Tài khoản & quyền</Link>}
      <Link className={section==='data-management'?'active':''} href="/settings?section=data-management">Dữ liệu</Link>
    </nav>

    <main className="settings-main-v5">
      <header className="settings-section-head-v5">
        <div>
          <h2>{activeMeta.title}</h2>
          <p>{activeMeta.description}</p>
        </div>
        {!canEdit&&<span className="settings-readonly-badge">Chỉ xem</span>}
      </header>

      <section className="settings-workspace-v3 settings-workspace-v5">
        {section==='shipping-carriers'
          ? <ShippingCarrierSettings carriers={(carrierRows??[]) as any[]} canEdit={canEdit}/>
          : section==='spx-hubs'
            ? <DestinationHubSettings
                configs={configs}
                shippers={(shipperRows??[]) as any[]}
                canEdit={canEdit}
              />
            : section==='tracking'
              ? <TrackingSettings
                  runtime={(trackingRuntimeResult.data??null) as any}
                  rules={(trackingRulesResult.data??[]) as any[]}
                  carriers={(carrierRows??[]) as any[]}
                  providers={(trackingProviderResult.data??[]) as any[]}
                  mappings={(trackingMappingsResult.data??[]) as any[]}
                  unknownRaw={unknownRaw}
                  canEdit={canEditTracking}
                  trackingTest={sp.tracking_test??null}
                  trackingMessage={sp.tracking_message??null}
                />
            : section==='tracking-alerts'
              ? <TrackingTelegramSettings
                  telegram={(telegramSettingsResult.data??null) as any}
                  rules={(alertRulesResult.data??[]) as any[]}
                  destinations={(telegramDestinationsResult.data??[]) as any[]}
                  hubs={(hubRows??[]).filter((x:any)=>x.is_active).map((x:any)=>String(x.hub_code))}
                  canEdit={canEditTracking}
                  telegramTest={sp.telegram_test??null}
                  telegramMessage={sp.telegram_message??null}
                  view="alerts"
                />
            : section==='telegram'
              ? <TrackingTelegramSettings
                  telegram={(telegramSettingsResult.data??null) as any}
                  rules={(alertRulesResult.data??[]) as any[]}
                  destinations={(telegramDestinationsResult.data??[]) as any[]}
                  hubs={(hubRows??[]).filter((x:any)=>x.is_active).map((x:any)=>String(x.hub_code))}
                  canEdit={canEditTracking}
                  telegramTest={sp.telegram_test??null}
                  telegramMessage={sp.telegram_message??null}
                  view="telegram"
                />
            : section==='payments'
              ? <BankTransferSettings config={(bankTransferResult.data??null) as any} canEdit={canEdit}/>
            : section==='access'&&role==='admin'
              ? <SystemAccessSettings users={systemUsers as any[]} currentUserId={user.id}/>
              : <DataManagementSettings
                  activeOrders={activeOrders}
                  archivedOrders={archivedOrders}
                  activeUsers={activeUsers}
                  archivedUsers={archivedUsers}
                  canDelete={role==='admin'}
                  purged={Number.isFinite(purged as number)?purged:null}
                  protectedCount={Number.isFinite(protectedCount as number)?protectedCount:null}
                />}
      </section>
    </main>
  </div>


}