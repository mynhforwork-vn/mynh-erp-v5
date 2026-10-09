'use client'

import {useEffect} from 'react'
import Link from 'next/link'

export default function AccountPageError({
  error,reset,
}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{
    // Next.js production errors are redacted; this digest can be matched to server logs.
    console.error('MYNH_ACCOUNT_RENDER_ERROR',error.digest??'Không có mã đối chiếu')
  },[error])

  return <section className="account-screen" role="alert" aria-live="polite">
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Không thể tải thông tin tài khoản</h1>
        <p>Hệ thống gặp lỗi khi mở hoặc chuyển trang chi tiết tài khoản.</p>
      </div>
    </header>
    <div className="card" style={{maxWidth:640,padding:20,display:'grid',gap:14}}>
      <p style={{margin:0}}>
        Nếu bạn vừa bấm <strong>Tạo tài khoản</strong> hoặc <strong>Lưu thay đổi</strong>,
        dữ liệu có thể đã được lưu trước khi trang gặp lỗi.
        Hãy kiểm tra danh sách trước khi gửi lại để tránh trùng dữ liệu.
      </p>
      <p style={{margin:0,fontSize:12,color:'var(--mynh-text-2,#64748b)'}}>
        Mã đối chiếu: <code>{error.digest??'Chưa có'}</code>
      </p>
      <div className="form-actions" style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'flex-start'}}>
        <button type="button" className="button primary" onClick={reset}>Thử tải lại</button>
        <Link href="/purchase/accounts" className="button">Về danh sách tài khoản</Link>
        <Link href="/purchase/accounts?archive=archived" className="button">Xem tài khoản đã lưu trữ</Link>
      </div>
    </div>
  </section>
}
