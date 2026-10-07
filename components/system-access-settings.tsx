'use client'

import { useState,useTransition } from 'react'
import {
  createSystemUserAccount,
  deleteSystemUserAccount,
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
type Tab='accounts'|'roles'

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
  const [tab,setTab]=useState<Tab>('accounts')
  const [rows,setRows]=useState(users)
  const [pending,startTransition]=useTransition()
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [createEmail,setCreateEmail]=useState('')
  const [createPassword,setCreatePassword]=useState('')
  const [createRole,setCreateRole]=useState<'admin'|'operator'|'viewer'>('operator')
  const [passwordUser,setPasswordUser]=useState<SystemUser|null>(null)
  const [deleteUser,setDeleteUser]=useState<SystemUser|null>(null)
  const [temporaryPassword,setTemporaryPassword]=useState('')

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
      setMessage('Đã tạo '+email+' với role '+createRole+'.')
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

  function removeAccount(){
    if(!deleteUser)return
    if(deleteUser.user_id===currentUserId){setError('Không thể xóa chính tài khoản Admin đang đăng nhập.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await deleteSystemUserAccount({user_id:deleteUser.user_id})
      if(!result.ok){setError(result.error);return}
      setRows(prev=>prev.filter(row=>row.user_id!==deleteUser.user_id))
      setMessage('Đã xóa tài khoản '+(deleteUser.email??'hệ thống')+'.')
      setDeleteUser(null)
    })
  }

  return <div className="admin-access-settings admin-access-settings-v10">
    {message&&<div className="success-box compact">{message}</div>}
    {error&&<div className="error-box compact">{error}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6 access-subtabs-v10">
      <button type="button" className={tab==='accounts'?'active':''} onClick={()=>setTab('accounts')}>
        Tài khoản <span>{rows.length}</span>
      </button>
      <button type="button" className={tab==='roles'?'active':''} onClick={()=>setTab('roles')}>
        Vai trò & quyền
      </button>
    </div>

    {tab==='accounts'&&<div className="settings-subtab-body-v6 access-body-v10">
      <section className="access-full-panel-v10">
        <div className="access-panel-head-v10">
          <div>
            <h3>Tài khoản hệ thống</h3>
            <p>Tạo tài khoản đăng nhập riêng, gán role và quản lý mật khẩu.</p>
          </div>
          <span>Admin only</span>
        </div>

        <div className="access-create-bar-v10">
          <label><span>Email đăng nhập</span><input type="email" value={createEmail} onChange={e=>setCreateEmail(e.target.value)} placeholder="operator@company.com"/></label>
          <label><span>Mật khẩu tạm</span><div className="admin-password-field"><input type="text" value={createPassword} onChange={e=>setCreatePassword(e.target.value)} placeholder="Tối thiểu 10 ký tự"/><button type="button" onClick={()=>setCreatePassword(makePassword())}>Tạo</button></div></label>
          <label><span>Role</span><select value={createRole} onChange={e=>setCreateRole(e.target.value as any)}><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
          <button className="button primary" type="button" onClick={createAccount} disabled={pending}>{pending?'Đang tạo...':'+ Tạo tài khoản'}</button>
        </div>

        <div className="access-table-scroll-v10">
          <table className="table access-user-table-v10">
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
              <td><div className="access-user-actions-v10">
                <button className="button small" type="button" onClick={()=>openPassword(user)} disabled={pending}>Cấp mật khẩu</button>
                <button className="admin-text-action" type="button" onClick={()=>emailReset(user)} disabled={pending||!user.email}>Gửi email reset</button>
                {user.user_id!==currentUserId&&<button className="admin-text-action danger" type="button" onClick={()=>{setDeleteUser(user);setMessage('');setError('')}} disabled={pending}>Xóa</button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>}

    {tab==='roles'&&<div className="settings-subtab-body-v6 access-body-v10">
      <section className="access-full-panel-v10">
        <div className="access-panel-head-v10">
          <div>
            <h3>Vai trò & quyền</h3>
            <p>Quyền được lưu trong app_metadata và áp dụng theo tài khoản đăng nhập.</p>
          </div>
        </div>

        <div className="access-role-table-v10">
          <div className="access-role-head-v10"><span>Vai trò</span><span>Phạm vi</span><span>Được phép</span><span>Hạn chế</span></div>
          <div className="access-role-row-v10">
            <b>Admin</b>
            <span>Toàn hệ thống</span>
            <span>Vận hành, cấu hình, tài khoản, dữ liệu hệ thống.</span>
            <span>Không có hạn chế nghiệp vụ.</span>
          </div>
          <div className="access-role-row-v10">
            <b>Operator</b>
            <span>Vận hành</span>
            <span>Đơn, kho, POS, công nợ, tài chính và cấu hình nghiệp vụ được cấp.</span>
            <span>Không quản lý tài khoản, role hoặc reset hệ thống.</span>
          </div>
          <div className="access-role-row-v10">
            <b>Viewer</b>
            <span>Chỉ xem</span>
            <span>Dashboard và dữ liệu được phép xem.</span>
            <span>Không tạo, sửa, xóa hoặc xác nhận nghiệp vụ.</span>
          </div>
        </div>
      </section>
    </div>}

    {passwordUser&&<div className="admin-reset-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setPasswordUser(null)}}>
      <div className="admin-reset-dialog admin-password-dialog" role="dialog" aria-modal="true">
        <div className="admin-reset-dialog-head">
          <div><h3>{passwordUser.email??'Tài khoản hệ thống'}</h3></div>
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

    {deleteUser&&<div className="admin-reset-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setDeleteUser(null)}}>
      <div className="admin-reset-dialog" role="dialog" aria-modal="true">
        <div className="admin-reset-dialog-head">
          <div><h3>{deleteUser.email??'Tài khoản hệ thống'}</h3></div>
          <button type="button" onClick={()=>!pending&&setDeleteUser(null)} aria-label="Đóng">×</button>
        </div>
        <p>Tài khoản này sẽ không thể đăng nhập MYNH ERP sau khi xóa. Dữ liệu nghiệp vụ đã tạo bởi tài khoản vẫn được giữ lại.</p>
        <div className="admin-delete-user-summary"><span>Role hiện tại</span><b>{deleteUser.role}</b></div>
        <div className="form-actions">
          <button className="button" type="button" onClick={()=>setDeleteUser(null)} disabled={pending}>Hủy</button>
          <button className="button danger" type="button" onClick={removeAccount} disabled={pending}>{pending?'Đang xóa...':'Xóa tài khoản'}</button>
        </div>
      </div>
    </div>}
  </div>
}
