'use client'

import { useState,useTransition } from 'react'
import { resetERPSystemData,sendSystemUserPasswordReset,updateSystemUserRole } from '@/lib/actions/core'

type SystemUser={
  user_id:string
  email:string|null
  role:string
  created_at:string
  last_sign_in_at:string|null
  email_confirmed_at:string|null
}

function fmt(value?:string|null){
  if(!value)return '—'
  const d=new Date(value)
  return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('vi-VN',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ho_Chi_Minh'
  }).format(d)
}
function roleName(role:string){
  if(role==='admin')return 'Admin'
  if(role==='operator')return 'Operator'
  return 'Viewer'
}

export function SystemAccessSettings({
  users,
  currentUserId,
}:{
  users:SystemUser[]
  currentUserId:string
}){
  const [rows,setRows]=useState(users)
  const [pending,startTransition]=useTransition()
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [resetScope,setResetScope]=useState<'DATA'|'ALL'|null>(null)
  const [confirm,setConfirm]=useState('')

  function changeRole(user:SystemUser,nextRole:'admin'|'operator'|'viewer'){
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await updateSystemUserRole({user_id:user.user_id,role:nextRole})
      if(!result.ok){setError(result.error);return}
      setRows(prev=>prev.map(row=>row.user_id===user.user_id?{...row,role:nextRole}:row))
      setMessage('Đã cập nhật phân quyền. Quyền mới có hiệu lực đầy đủ sau khi tài khoản đăng nhập lại.')
    })
  }

  function resetPassword(user:SystemUser){
    if(!user.email){setError('Tài khoản này chưa có email để cấp lại mật khẩu.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await sendSystemUserPasswordReset({email:user.email!})
      if(!result.ok){setError(result.error);return}
      setMessage('Đã gửi yêu cầu cấp lại mật khẩu tới '+user.email+'.')
    })
  }

  function runReset(){
    if(!resetScope)return
    const expected=resetScope==='ALL'?'RESET TOAN HE THONG':'RESET DU LIEU'
    if(confirm!==expected){setError('Chuỗi xác nhận chưa đúng.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await resetERPSystemData({scope:resetScope,confirm})
      if(!result.ok){setError(result.error);return}
      setMessage(resetScope==='ALL'
        ? 'Đã reset dữ liệu vận hành và toàn bộ cấu hình người dùng.'
        : 'Đã reset dữ liệu vận hành. Cấu hình hệ thống được giữ lại.')
      setResetScope(null);setConfirm('')
      window.location.reload()
    })
  }

  return <div className="admin-access-settings">
    <div className="admin-access-head">
      <div>
        <span className="module-eyebrow">QUẢN TRỊ HỆ THỐNG</span>
        <h3>Phân quyền & tài khoản</h3>
        <p>Chỉ Admin được xem và thay đổi quyền hệ thống, cấp lại mật khẩu và reset dữ liệu.</p>
      </div>
      <span className="status-pill green">Admin only</span>
    </div>

    {message&&<div className="success-box compact">{message}</div>}
    {error&&<div className="error-box compact">{error}</div>}

    <section className="admin-role-matrix">
      <div className="admin-role-matrix-head"><b>Ma trận quyền</b><span>3 vai trò chuẩn của MYNH ERP</span></div>
      <div className="admin-role-grid">
        <div className="admin-role-card">
          <strong>Admin</strong>
          <span>Toàn quyền nghiệp vụ</span>
          <small>Cài đặt · phân quyền · reset dữ liệu · thao tác vận hành</small>
        </div>
        <div className="admin-role-card">
          <strong>Operator</strong>
          <span>Vận hành hệ thống</span>
          <small>Đơn · kho · POS · công nợ · tài chính; không được quản trị hệ thống</small>
        </div>
        <div className="admin-role-card">
          <strong>Viewer</strong>
          <span>Chỉ xem</span>
          <small>Xem dashboard/dữ liệu; không được tạo, sửa, xóa hoặc xác nhận nghiệp vụ</small>
        </div>
      </div>
    </section>

    <section className="admin-user-table-card">
      <div className="admin-role-matrix-head"><b>Tài khoản hệ thống</b><span>{rows.length} tài khoản</span></div>
      <div className="admin-user-table-wrap">
        <table className="table admin-user-table">
          <thead><tr><th>Email</th><th>Vai trò</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
          <tbody>{rows.map(user=><tr key={user.user_id}>
            <td><b>{user.email??'—'}</b>{user.user_id===currentUserId&&<small>Bạn đang đăng nhập</small>}</td>
            <td>
              <select value={user.role} onChange={e=>changeRole(user,e.target.value as any)} disabled={pending||(user.user_id===currentUserId&&user.role==='admin')}>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </td>
            <td>{fmt(user.last_sign_in_at)}</td>
            <td><span className={'status-pill '+(user.email_confirmed_at?'green':'orange')}>{user.email_confirmed_at?'Đã xác thực':'Chưa xác thực'}</span></td>
            <td><button className="button small" type="button" onClick={()=>resetPassword(user)} disabled={pending||!user.email}>Cấp lại mật khẩu</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="admin-danger-zone">
      <div className="admin-role-matrix-head">
        <div><b>Reset dữ liệu hệ thống</b><span>Không thể hoàn tác. Tài khoản đăng nhập Admin và cấu trúc database được giữ lại.</span></div>
      </div>
      <div className="admin-reset-options">
        <button type="button" className="admin-reset-card" onClick={()=>{setResetScope('DATA');setConfirm('');setError('')}}>
          <b>Reset dữ liệu vận hành</b>
          <span>Xóa User Shopee, đơn hàng, tồn phát sinh, bán hàng, khách hàng, công nợ, tài chính và lịch sử vận hành.</span>
          <small>Giữ lại cấu hình ngân hàng, HUB, ĐVVC, danh mục sản phẩm.</small>
        </button>
        <button type="button" className="admin-reset-card danger" onClick={()=>{setResetScope('ALL');setConfirm('');setError('')}}>
          <b>Reset toàn hệ thống</b>
          <span>Xóa dữ liệu vận hành và cấu hình người dùng: QR/ngân hàng, HUB/Shipper, ĐVVC, sản phẩm và phân loại.</span>
          <small>Giữ tài khoản đăng nhập, schema, 2 kho nền tảng và danh mục tài chính hệ thống.</small>
        </button>
      </div>
    </section>

    {resetScope&&<div className="admin-reset-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setResetScope(null)}}>
      <div className="admin-reset-dialog" role="dialog" aria-modal="true">
        <div className="admin-reset-dialog-head">
          <div><span className="module-eyebrow">XÁC NHẬN NGUY HIỂM</span><h3>{resetScope==='ALL'?'Reset toàn hệ thống':'Reset dữ liệu vận hành'}</h3></div>
          <button type="button" onClick={()=>!pending&&setResetScope(null)} aria-label="Đóng">×</button>
        </div>
        <p>Hành động này không thể hoàn tác. Hãy nhập chính xác chuỗi xác nhận bên dưới.</p>
        <label>
          Nhập <b>{resetScope==='ALL'?'RESET TOAN HE THONG':'RESET DU LIEU'}</b>
          <input value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off"/>
        </label>
        <div className="form-actions">
          <button className="button" type="button" onClick={()=>setResetScope(null)} disabled={pending}>Hủy</button>
          <button className="button danger" type="button" onClick={runReset} disabled={pending}>
            {pending?'Đang reset...':'Xác nhận reset'}
          </button>
        </div>
      </div>
    </div>}
  </div>
}
