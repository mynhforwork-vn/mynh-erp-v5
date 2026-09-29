import { requireUser } from '@/lib/supabase/auth'
import { DestinationHubSettings } from '@/components/destination-hub-config-panel'

export default async function SettingsPage(){
  const {supabase}=await requireUser()

  const [{data:hubRows,error:hubError},{data:shipperRows,error:shipperError},{data:assignmentRows,error:assignmentError}]=await Promise.all([
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
  ])

  const assignments=(assignmentRows??[]) as any[]
  const configs=((hubRows??[]) as any[]).map((hub:any)=>({
    ...hub,
    shipper_ids:assignments
      .filter((a:any)=>a.hub_config_id===hub.id&&a.is_active)
      .map((a:any)=>a.shipper_id),
  }))

  const error=hubError??shipperError??assignmentError

  return <div className="settings-screen settings-screen-v3">
    <header className="page-head settings-page-head">
      <div>
        <span className="module-eyebrow">HỆ THỐNG</span>
        <h1>Cài đặt hệ thống</h1>
        <p>Cấu hình dùng chung cho vận hành MYNH ERP.</p>
      </div>
    </header>

    {error&&<div className="error-box">Không thể tải cấu hình hệ thống: {error.message}</div>}

    <nav className="settings-page-tabs-v3" aria-label="Nhóm cài đặt">
      <button type="button" className="active">Kho đích & Shipper</button>
      <button type="button" disabled>Tài khoản & phân quyền</button>
      <button type="button" disabled>Tích hợp</button>
      <button type="button" disabled>Thông báo</button>
    </nav>

    <section className="settings-workspace-v3">
      <DestinationHubSettings
        configs={configs}
        shippers={(shipperRows??[]) as any[]}
      />
    </section>
  </div>
}
