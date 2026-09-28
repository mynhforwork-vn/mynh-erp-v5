'use client'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm(){
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [ok,setOk]=useState(false)

  async function submit(e:FormEvent){
    e.preventDefault(); setMessage(''); setOk(false)
    if(password.length<10){setMessage('Mật khẩu mới cần ít nhất 10 ký tự.');return}
    if(password!==confirm){setMessage('Mật khẩu xác nhận chưa khớp.');return}
    setBusy(true)
    const {error}=await createClient().auth.updateUser({password})
    setBusy(false)
    if(error){setMessage('Không thể đổi mật khẩu. Vui lòng thử lại.');return}
    setPassword(''); setConfirm(''); setOk(true); setMessage('Đã đổi mật khẩu.')
  }

  return <form className="panel-form account-password-form" onSubmit={submit}>
    <label>Mật khẩu mới<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="Tối thiểu 10 ký tự"/></label>
    <label>Xác nhận mật khẩu<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label>
    {message&&<div className={ok?'success-text':'error-box'}>{message}</div>}
    <div className="form-actions"><button className="button primary" disabled={busy}>{busy?'Đang lưu…':'Cập nhật mật khẩu'}</button></div>
  </form>
}
