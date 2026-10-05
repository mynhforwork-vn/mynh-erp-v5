import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { DestinationHubSettings } from '@/components/destination-hub-config-panel'
import { ShippingCarrierSettings } from '@/components/shipping-carrier-settings'
import { DataManagementSettings } from '@/components/data-management-settings'
import { BankTransferSettings } from '@/components/bank-transfer-settings'
import { SystemAccessSettings } from '@/components/system-access-settings'

type SP={section?:string,purged?:string,protected?:string}

export default async function SettingsPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canEdit=['admin','operator'].includes(role)
  const section=sp.section==='spx-hubs'
    ? 'spx-hubs'
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
  ]=await Promise.all([
    supabase.from('shipping_carrier_configs')
      .select('id,carrier_code,display_name,tracking_prefixes,supports_tracking,supports_destination_hub,priority,is_active,note')
      .order('priority',{ascending:true})
      .order('display_name',{ascending:true})
      .limit(200),
    supabase.from('destination_hub_configs')
      .select('id,hub_code,area,region,province_keywords,district_keywords,address_keywords,priority,is_active')
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

  const error=carrierError??hubError??shipperError??assignmentError
    ??activeOrdersResult.error??archivedOrdersResult.error??activeUsersResult.error??archivedUsersResult.error
    ??bankTransferResult.error??systemUsersResult.error

  const activeOrders=activeOrdersResult.count??0
  const archivedOrders=archivedOrdersResult.count??0
  const activeUsers=activeUsersResult.count??0
  const archivedUsers=archivedUsersResult.count??0
  const purged=sp.purged?Number(sp.purged):null
  const protectedCount=sp.protected?Number(sp.protected):null

  return <div className="settings-screen settings-screen-v3">
    <header className="page-head settings-page-head">
      <div>
        <span className="module-eyebrow">HỆ THỐNG</span>
        <h1>Cài đặt hệ thống</h1>
        <p>Cấu hình vận hành, thanh toán, dữ liệu và quyền truy cập MYNH ERP.</p>
      </div>
    </header>

    {error&&<div className="error-box">Không thể tải cấu hình hệ thống: {error.message}</div>}

    <nav className="settings-page-tabs-v3" aria-label="Nhóm cài đặt">
      <Link className={section==='shipping-carriers'?'active':''} href="/settings?section=shipping-carriers">Đơn vị vận chuyển</Link>
      <Link className={section==='spx-hubs'?'active':''} href="/settings?section=spx-hubs">SPX · Kho đích & Shipper</Link>
      <Link className={section==='payments'?'active':''} href="/settings?section=payments">Thanh toán & QR</Link>
      <Link className={section==='data-management'?'active':''} href="/settings?section=data-management">Quản lý dữ liệu</Link>
      {role==='admin'&&<Link className={section==='access'?'active':''} href="/settings?section=access">Phân quyền & tài khoản</Link>}
    </nav>

    <section className="settings-workspace-v3">
      {section==='shipping-carriers'
        ? <ShippingCarrierSettings carriers={(carrierRows??[]) as any[]} canEdit={canEdit}/>
        : section==='spx-hubs'
          ? <DestinationHubSettings
              configs={configs}
              shippers={(shipperRows??[]) as any[]}
            />
          : section==='payments'
            ? <BankTransferSettings config={(bankTransferResult.data??null) as any} canEdit={canEdit}/>
            : section==='access'&&role==='admin'
              ? <SystemAccessSettings users={(systemUsersResult.data??[]) as any[]} currentUserId={user.id}/>
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
  </div>
}
