'use client'

import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPOSSale } from '@/lib/actions/sales'

export function SalesHistoryActions({
  saleId,
  invoiceCode,
  saleStatus,
  canOperate,
}:{
  saleId:string
  invoiceCode:string
  saleStatus:string
  canOperate:boolean
}){
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [reason,setReason]=useState('')
  const [message,setMessage]=useState('')
  const [pending,startTransition]=useTransition()
  const cancellable=saleStatus==='COMPLETED'&&canOperate

  function submit(){
    setMessage('')
    startTransition(async()=>{
      const result=await cancelPOSSale({sale_id:saleId,reason})
      if(!result.ok){
        setMessage(result.error)
        return
      }
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return <>
    <button
      className="button small"
      type="button"
      disabled={!cancellable||pending}
      onClick={()=>setOpen(true)}
      title={!canOperate?'Chỉ Admin/Operator được thao tác':saleStatus!=='COMPLETED'?'Hóa đơn không còn ở trạng thái cho phép huỷ':''}
    >
      Huỷ hóa đơn
    </button>
    <button className="button small" type="button" disabled title="Hoàn hàng đang được hoàn thiện">Hoàn hàng</button>

    {open&&<div className="sales-action-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="sales-action-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận huỷ hóa đơn">
        <div className="sales-action-dialog-head">
          <div><span className="module-eyebrow">XÁC NHẬN HUỶ</span><h3>{invoiceCode}</h3></div>
          <button type="button" onClick={()=>setOpen(false)} aria-label="Đóng">×</button>
        </div>
        <p>Hệ thống sẽ hoàn tồn toàn bộ sản phẩm, triệt công nợ còn lại và ghi khoản hoàn tiền vào Finance. Lịch sử thanh toán gốc vẫn được giữ để kiểm toán.</p>
        <label>Lý do huỷ
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do huỷ hóa đơn..." rows={3}/>
        </label>
        {message&&<div className="error-box compact">{message}</div>}
        <div className="form-actions">
          <button className="button" type="button" onClick={()=>setOpen(false)} disabled={pending}>Đóng</button>
          <button className="button danger" type="button" onClick={submit} disabled={pending}>
            {pending?'Đang huỷ...':'Xác nhận huỷ'}
          </button>
        </div>
      </div>
    </div>}
  </>
}
