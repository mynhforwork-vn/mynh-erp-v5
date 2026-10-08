'use client'

import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteOrderPermanent } from '@/lib/actions/core'

export function DeleteOrderConfirmForm({
  orderId,confirmCode,returnQuery,compact=false,onCancel,
}:{
  orderId:string
  confirmCode:string
  returnQuery:string
  compact?:boolean
  onCancel?:()=>void
}){
  const [error,setError]=useState('')
  const [pending,startTransition]=useTransition()
  const router=useRouter()

  function submit(formData:FormData){
    setError('')
    startTransition(async()=>{
      try{
        const result=await deleteOrderPermanent(formData)
        if(!result.ok){setError(result.error);return}
        router.replace(result.href)
        router.refresh()
      }catch{
        setError('Không kết nối được máy chủ. Hãy tải lại danh sách kiểm tra đơn trước khi thử tiếp.')
      }
    })
  }

  return <form action={submit}>
    <input type="hidden" name="order_id" value={orderId}/>
    <input type="hidden" name="return_query" value={returnQuery}/>
    {compact
      ? <input name="confirm_text" aria-label="Mã đơn xác nhận" placeholder={confirmCode} autoComplete="off" required autoFocus disabled={pending}/>
      : <>
          <p>Chỉ xóa khi an toàn. Đơn có nhận hàng, đối soát hoặc chuyển kho có thể yêu cầu hoàn tác đồng bộ. Hành động không thể hoàn tác.</p>
          <label>Nhập <b>{confirmCode}</b> để xác nhận
            <input name="confirm_text" autoComplete="off" required disabled={pending}/>
          </label>
        </>}
    <label>Mật khẩu đăng nhập tài khoản ERP
      <input type="password" name="account_password" aria-label="Mật khẩu đăng nhập ERP" autoComplete="current-password" required disabled={pending}/>
    </label>
    {error&&<p className="error-box compact" role="alert">{error}</p>}
    {compact
      ? <div>
          <button type="button" className="row-delete-cancel" onClick={onCancel} disabled={pending}>Hủy</button>
          <button type="submit" className="row-delete-confirm" disabled={pending}>{pending?'Đang xóa...':'Xóa vĩnh viễn'}</button>
        </div>
      : <button className="button danger" type="submit" disabled={pending}>{pending?'Đang xóa...':'Xóa vĩnh viễn'}</button>}
  </form>
}
