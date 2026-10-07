import { Suspense } from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { roleLabel } from '@/lib/format'
import { Nav } from '@/components/nav'
import { DismissOpenDetails } from '@/components/dismiss-open-details'
import { InAppAlertCenter } from '@/components/in-app-alert-center'
import { SidebarAccountMenu } from '@/components/sidebar-account-menu'
import { MynhLogoMark } from '@/components/mynh-logo-mark'

export default async function ERPLayout({children}:{children:React.ReactNode}){
  const {user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  return <>
    <DismissOpenDetails/>
    <div className="shell brand-shell-v1">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark small"><MynhLogoMark/></span><span><b>MYNH ERP</b><small>HỆ THỐNG VẬN HÀNH</small></span></Link>
      <Suspense fallback={null}><Nav/></Suspense>
      <div className="sidebar-foot sidebar-foot-v2">
        <SidebarAccountMenu email={user.email??'Người dùng MYNH ERP'} role={roleLabel(role)}/>
        <InAppAlertCenter/>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>
  </>
}
