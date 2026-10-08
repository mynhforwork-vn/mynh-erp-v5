'use client'

import {useEffect,useId,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'

export function ConfirmOperationDialog({
  title,kind,target,description,notice,reason,reasonPlaceholder,
  onReasonChange,onConfirm,onClose,pending=false,error='',children,
  confirmLabel='Xác nhận',isDanger=true,
}:{
  title:string
  kind:string
  target:string
  description:string
  notice?:string
  reason:string
  reasonPlaceholder?:string
  onReasonChange:(next:string)=>void
  onConfirm:()=>void
  onClose:()=>void
  pending?:boolean
  error?:string
  children?:ReactNode
  confirmLabel?:string
  isDanger?:boolean
}){
  const [mounted,setMounted]=useState(false)
  const titleId=useId()
  useEffect(()=>setMounted(true),[])
  useEffect(()=>{
    if(!mounted)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!pending){e.stopPropagation();onClose()}
    }
    window.addEventListener('keydown',onKey)
    return ()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}
  },[mounted,pending,onClose])
  if(!mounted)return null
  return createPortal(<div className="erp-confirm-overlay" onMouseDown={e=>{
    if(e.target===e.currentTarget&&!pending)onClose()
  }}>
    <section className="erp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="erp-confirm-header">
        <div className={'erp-confirm-symbol '+(isDanger?'danger':'')} aria-hidden="true">{isDanger?'!':'↩'}</div>
        <div className="erp-confirm-header-main">
          <span className="erp-confirm-eyebrow">{kind}</span>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="erp-confirm-close" type="button" onClick={onClose} disabled={pending} aria-label="Đóng">×</button>
      </header>
      <div className="erp-confirm-body">
        <div className="erp-confirm-target"><span>Đối tượng</span><b>{target}</b></div>
        {notice&&<p className="erp-confirm-note">{notice}</p>}
        {children}
        <label className="erp-confirm-label">Lý do <span>(không bắt buộc)</span>
          <textarea rows={2} value={reason} maxLength={1000} onChange={e=>onReasonChange(e.target.value)}
            placeholder={reasonPlaceholder??'Có thể bỏ trống hoặc ghi chú để tra soát sau.'} disabled={pending}/>
        </label>
        <p className="erp-confirm-history">Hệ thống lưu người thực hiện, thời gian, thao tác và lý do trong lịch sử.</p>
        {error&&<div className="erp-confirm-error" role="alert">{error}</div>}
      </div>
      <footer className="erp-confirm-footer">
        <button type="button" className="erp-confirm-back" onClick={onClose} disabled={pending}>Quay lại</button>
        <button type="button" className={'erp-confirm-submit '+(isDanger?'danger':'')} onClick={onConfirm} disabled={pending}>
          {pending?'Đang xử lý...':confirmLabel}
        </button>
      </footer>
    </section>
  </div>,document.body)
}
