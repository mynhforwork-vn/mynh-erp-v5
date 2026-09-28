'use client'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMessage('Đăng nhập thất bại. Vui lòng kiểm tra tài khoản và mật khẩu.'); setLoading(false); return }
    window.location.href = '/'
  }

  return <div className="login-wrap">
    <form className="login-card" onSubmit={submit}>
      <div className="brand-mark">M</div>
      <h1>MYNH ERP</h1>
      <p className="muted">Hệ thống vận hành Shopee</p>
      <label>Thư điện tử<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" /></label>
      {message && <div className="error-box">{message}</div>}
      <button className="button primary" disabled={loading}>{loading ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  </div>
}
