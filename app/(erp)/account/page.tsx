import { requireUser } from '@/lib/supabase/auth'
import { roleLabel } from '@/lib/format'
import { ChangePasswordForm } from '@/components/change-password-form'

export default async function AccountPage(){
  const {user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  return <>
    <header className="page-head"><div><h1>Tài khoản hệ thống</h1><p>Thông tin đăng nhập và bảo mật tài khoản MYNH ERP</p></div></header>
    <section className="content-grid two account-grid"><div className="card"><div className="card-head"><h2>Thông tin tài khoản</h2></div><div className="account-info-row"><span>Thư điện tử</span><b>{user.email??'—'}</b></div><div className="account-info-row"><span>Vai trò</span><b>{roleLabel(role)}</b></div><div className="account-info-row"><span>Mã người dùng</span><b className="mono">{user.id}</b></div></div><div className="card" id="password"><div className="card-head"><h2>Đổi mật khẩu</h2></div><ChangePasswordForm/></div></section>
  </>
}
