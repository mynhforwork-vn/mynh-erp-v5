import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { roleLabel } from '@/lib/format'
import { Nav } from '@/components/nav'
import { LogoutButton } from '@/components/logout-button'

export default async function ERPLayout({children}:{children:React.ReactNode}){
  const {user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  return <div className="shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark small">M</span><span><b>MYNH ERP</b><small>HỆ THỐNG VẬN HÀNH</small></span></Link>
      <Nav/>
      <div className="sidebar-foot">
        <div className="account"><b>{user.email??'Người dùng MYNH ERP'}</b><span>{roleLabel(role)}</span></div>
        <Link className="button ghost" href="/account">Đổi mật khẩu</Link>
        <LogoutButton/>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>
}
