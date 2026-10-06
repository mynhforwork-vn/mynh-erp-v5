'use client'

import { useState,useTransition } from 'react'
import {
  createSystemUserAccount,
  resetERPSystemData,
  sendSystemUserPasswordReset,
  setSystemUserTemporaryPassword,
  updateSystemUserRole,
} from '@/lib/actions/core'

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
function makePassword(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#'
  const values=new Uint32Array(14)
  crypto.getRandomValues(values)
  return Array.from(values,v=>chars[v%chars.length]).join('')
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
  const [createEmail,setCreateEmail]=useState('')
  const [createPassword,setCreatePassword]=useState('')
  const [createRole,setCreateRole]=useState<'admin'|'operator'|'viewer'>('operator')
  const [passwordUser,setPasswordUser]=useState<SystemUser|null>(null)
  const [temporaryPassword,setTemporaryPassword]=useState('')
  const [resetScope,setResetScope]=useState<'DATA'|'ALL'|null>(null)
  const [confirm,setConfirm]=useState('')

  function changeRole(user:SystemUser,nextRole:'admin'|'operator'|'viewer'){
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await updateSystemUserRole({user_id:user.user_id,role:nextRole})
      if(!result.ok){setError(result.error);return}
      setRows(prev=>prev.map(row=>row.user_id===user.user_id?{...row,role:nextRole}:row))
      setMessage('Đã cập nhật role của '+(user.email??'tài khoản')+'. Quyền mới có hiệu lực đầy đủ sau khi đăng nhập lại.')
    })
  }

  function createAccount(){
    setMessage('');setError('')
    const email=createEmail.trim().toLowerCase()
    if(!email){setError('Nhập email tài khoản mới.');return}
    if(createPassword.length<10){setError('Mật khẩu tạm cần ít nhất 10 ký tự.');return}
    startTransition(async()=>{
      const result=await createSystemUserAccount({email,password:createPassword,role:createRole})
      if(!result.ok){setError(result.error);return}
      const user=(result.data as any)?.user
      if(user?.id){
        setRows(prev=>[...prev,{
          user_id:String(user.id),
          email:String(user.email??email),
          role:String(user.role??createRole),
          created_at:new Date().toISOString(),
          last_sign_in_at:null,
          email_confirmed_at:new Date().toISOString(),
        }])
      }
      setMessage('Đã tạo '+email+' với role '+createRole+'. Hãy bàn giao mật khẩu tạm và yêu cầu đổi mật khẩu sau lần đăng nhập đầu.')
      setCreateEmail('');setCreatePassword('');setCreateRole('operator')
    })
  }

  function openPassword(user:SystemUser){
    setPasswordUser(user)
    setTemporaryPassword(makePassword())
    setMessage('');setError('')
  }

  function saveTemporaryPassword(){
    if(!passwordUser)return
    if(temporaryPassword.length<10){setError('Mật khẩu mới cần ít nhất 10 ký tự.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await setSystemUserTemporaryPassword({user_id:passwordUser.user_id,password:temporaryPassword})
      if(!result.ok){setError(result.error);return}
      setMessage('Đã cấp mật khẩu tạm mới cho '+(passwordUser.email??'tài khoản')+'.')
      setPasswordUser(null)
      setTemporaryPassword('')
    })
  }

  function emailReset(user:SystemUser){
    if(!user.email){setError('Tài khoản này chưa có email.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await sendSystemUserPasswordReset({email:user.email!})
      if(!result.ok){setError(result.error);return}
      setMessage('Đã gửi email đặt lại mật khẩu tới '+user.email+'.')
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
        <p>Tạo tài khoản đăng nhập riêng, gán role theo từng người và quản lý mật khẩu.</p>
      </div>
      <span className="status-pill green">Admin only</span>
    </div>

    {message&&<div className="success-box compact">{message}</div>}
    {error&&<div className="error-box compact">{error}</div>}

    <section className="admin-role-matrix">
      <div className="admin-role-matrix-head"><b>Ma trận quyền</b><span>Role được lưu trong app_metadata, không dùng user_metadata</span></div>
      <div className="admin-role-grid">
        <div className="admin-role-card">
          <strong>Admin</strong>
          <span>Toàn quyền hệ thống</span>
          <small>Vận hành + cài đặt + phân quyền + reset dữ liệu + quản lý tài khoản.</small>
        </div>
        <div className="admin-role-card">
          <strong>Operator</strong>
          <span>Vận hành nghiệp vụ</span>
          <small>Đơn · kho · POS · công nợ · tài chính; không được phân quyền/reset hệ thống.</small>
        </div>
        <div className="admin-role-card">
          <strong>Viewer</strong>
          <span>Chỉ xem</span>
          <small>Xem dashboard/dữ liệu; không được tạo, sửa, xóa hoặc xác nhận nghiệp vụ.</small>
        </div>
      </div>
    </section>

    <section className="admin-user-table-card">
      <div className="admin-role-matrix-head">
        <div><b>Tài khoản hệ thống</b><span>{rows.length} tài khoản · phân quyền riêng từng tài khoản</span></div>
      </div>
      <div className="admin-create-user-inline">
        <label><span>Email đăng nhập</span><input type="email" value={createEmail} onChange={e=>setCreateEmail(e.target.value)} placeholder="operator@company.com"/></label>
        <label><span>Mật khẩu tạm</span><div className="admin-password-field"><input type="text" value={createPassword} onChange={e=>setCreatePassword(e.target.value)} placeholder="Tối thiểu 10 ký tự"/><button type="button" onClick={()=>setCreatePassword(makePassword())}>Tạo</button></div></label>
        <label><span>Role</span><select value={createRole} onChange={e=>setCreateRole(e.target.value as any)}><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
        <button className="button primary" type="button" onClick={createAccount} disabled={pending}>{pending?'Đang tạo...':'+ Tạo tài khoản'}</button>
      </div>
      <div className="admin-user-table-wrap">
        <table className="table admin-user-table">
          <thead><tr><th>Email</th><th>Role</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
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
            <td><span className={'status-pill '+(user.email_confirmed_at?'green':'orange')}>{user.email_confirmed_at?'Sẵn sàng':'Chờ xác thực'}</span></td>
            <td><div className="admin-user-actions">
              <button className="button small" type="button" onClick={()=>openPassword(user)} disabled={pending}>Cấp mật khẩu</button>
              <button className="admin-text-action" type="button" onClick={()=>emailReset(user)} disabled={pending||!user.email}>Gửi email reset</button>
            </div></td>
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

    {passwordUser&&<div className="admin-reset-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setPasswordUser(null)}}>
      <div className="admin-reset-dialog admin-password-dialog" role="dialog" aria-modal="true">
        <div className="admin-reset-dialog-head">
          <div><span className="module-eyebrow">CẤP LẠI MẬT KHẨU</span><h3>{passwordUser.email??'Tài khoản hệ thống'}</h3></div>
          <button type="button" onClick={()=>!pending&&setPasswordUser(null)} aria-label="Đóng">×</button>
        </div>
        <p>Mật khẩu tạm có hiệu lực ngay. Hãy chuyển riêng cho người dùng và yêu cầu đổi mật khẩu sau khi đăng nhập.</p>
        <label>Mật khẩu tạm
          <div className="admin-password-field"><input type="text" value={temporaryPassword} onChange={e=>setTemporaryPassword(e.target.value)}/><button type="button" onClick={()=>setTemporaryPassword(makePassword())}>Tạo lại</button></div>
        </label>
        <div className="form-actions">
          <button className="button" type="button" onClick={()=>setPasswordUser(null)} disabled={pending}>Hủy</button>
          <button className="button primary" type="button" onClick={saveTemporaryPassword} disabled={pending}>{pending?'Đang lưu...':'Cấp mật khẩu mới'}</button>
        </div>
      </div>
    </div>}

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
