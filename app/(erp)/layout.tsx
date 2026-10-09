import { Suspense } from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { roleLabel } from '@/lib/format'
import { Nav } from '@/components/nav'
import { DismissOpenDetails } from '@/components/dismiss-open-details'
import { InAppAlertCenter } from '@/components/in-app-alert-center'
import { SidebarAccountMenu } from '@/components/sidebar-account-menu'
import { MynhLogoMark } from '@/components/mynh-logo-mark'
import { SidebarCollapseToggle } from '@/components/sidebar-collapse-toggle'
import { DesktopTableColumnResize } from '@/components/desktop-table-column-resize'

export default async function ERPLayout({children}:{children:React.ReactNode}){
  const {user,supabase}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const {data:runtime,error:trackingError}=await supabase
    .from('tracking_runtime_settings').select('auto_tracking_enabled,quiet_start,quiet_end')
    .eq('id','main').maybeSingle()
  const trackingEnabled=!trackingError&&runtime?.auto_tracking_enabled===true
  const quietStart=String(runtime?.quiet_start??'02:00').slice(0,5)
  const quietEnd=String(runtime?.quiet_end??'06:00').slice(0,5)
  return <>
    <DismissOpenDetails/>
    <DesktopTableColumnResize/>
    <div className="shell brand-shell-v1">
    <aside className="sidebar">
      <Link href="/" prefetch={false} className="brand"><span className="brand-mark small"><MynhLogoMark/></span><span><b>MYNH ERP</b><small>HỆ THỐNG VẬN HÀNH</small></span></Link>
      <Suspense fallback={null}><Nav/></Suspense>
      <div className="sidebar-foot sidebar-foot-v2">
        <SidebarAccountMenu email={user.email??'Người dùng MYNH ERP'} role={roleLabel(role)}/>
        <InAppAlertCenter role={role} trackingEnabled={trackingEnabled} quietStart={quietStart} quietEnd={quietEnd}/>
      </div>
    </aside>
    <div className="desktop-sidebar-seam-handle"><SidebarCollapseToggle/></div>
    <main className="main">{children}</main>
  </div>
  </>
}
