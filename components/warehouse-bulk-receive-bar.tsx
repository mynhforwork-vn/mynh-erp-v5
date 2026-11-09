'use client'

import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {bulkReceiveWarehouseOrders,type WarehouseBulkResult} from '@/lib/actions/warehouse-bulk-receive'

export type BulkOrderPreview={
  id:string
  label:string
  mode:'LEGACY'|'V2'
  lines:number
  inLines:number
  skippedLines:number
  stockUnits:number
}

export function WarehouseBulkReceiveBar({
  warehouseId,warehouseCode,orders,previewOnly,reviewOpen,onReview,onCancel,onResult
}:{
  warehouseId:string
  warehouseCode:string
  orders:BulkOrderPreview[]
  previewOnly:boolean
  reviewOpen:boolean
  onReview:()=>void
  onCancel:()=>void
  onResult:(result:WarehouseBulkResult)=>void
}){
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState('')
  const [error,setError]=useState('')
  const [confirmText,setConfirmText]=useState(false)
  useEffect(()=>{
    if(!reviewOpen){setError('');setConfirmText(false)}
  },[reviewOpen])
  useEffect(()=>{
    if(!reviewOpen)return
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busy)onCancel()
    }
    document.addEventListener('keydown',handleKey)
    return ()=>document.removeEventListener('keydown',handleKey)
  },[reviewOpen,busy,onCancel])
  const lines=orders.reduce((n,o)=>n+o.lines,0)
  const inLines=orders.reduce((n,o)=>n+o.inLines,0)
  const skippedLines=orders.reduce((n,o)=>n+o.skippedLines,0)
  const stockUnits=orders.reduce((n,o)=>n+o.stockUnits,0)
  const v2=orders.filter(o=>o.mode==='V2').length
  const legacy=orders.length-v2
  async function confirm(){
    if(previewOnly||busy||orders.length===0||orders.length>25||!confirmText)return
    setBusy(true)
    setError('')
    try{
      const result=await bulkReceiveWarehouseOrders({
        warehouseId,orderIds:orders.map(x=>x.id),note
      })
      setConfirmText(false)
      onResult(result)
      if(result.succeeded.length)router.refresh()
    }catch(e){
      setError(e instanceof Error?e.message:'Không thể xử lý hàng loạt. Vui lòng thử lại.')
    }finally{setBusy(false)}
  }
  return <div className="warehouse-bulk-bar" data-bulk-warehouse={warehouseCode}>
    <div className="warehouse-bulk-toolbar">
      <span><b>{orders.length}</b> đơn được chọn · Kho {warehouseCode}</span>
      <div className="warehouse-bulk-actions">
        <button type="button" className="button primary small" disabled={busy}
          onClick={onReview} aria-expanded={reviewOpen}>
          {reviewOpen?'Đang xem trước':'Xem trước nhập hàng loạt'}
        </button>
        <button type="button" className="button small" disabled={busy} onClick={onCancel}>
          Bỏ chọn
        </button>
      </div>
    </div>
    {reviewOpen&&<div className="warehouse-bulk-review" role="region" aria-label={'Xác nhận nhập hàng loạt kho '+warehouseCode}>
      <strong>Kiểm tra trước khi nhập kho</strong>
      <div className="warehouse-bulk-summary">
        <span><b>{orders.length}</b> đơn</span>
        <span><b>{lines}</b> sản phẩm</span>
        <span><b>{stockUnits}</b> đơn vị dự kiến nhập</span>
        <span><b>{skippedLines}</b> dòng bỏ qua</span>
      </div>
      <p>{legacy} đơn nhập toàn bộ sản phẩm · {v2} đơn theo quyết định từng sản phẩm.
        Chỉ sản phẩm chọn <b>Nhập kho</b> được ghi tăng tồn, {inLines} dòng sản phẩm nhập.
        Kho nhận lấy từ phiếu xác nhận thực tế, không theo HUB.</p>
      <div className="warehouse-bulk-review-list" aria-label="Các đơn trong lượt nhập">
        {orders.map(order=><div key={order.id}>
          <b title={order.label}>{order.label}</b>
          <span>{order.mode==='V2'?'Quyết định theo sản phẩm':'Nhập toàn bộ'} · {order.stockUnits} đơn vị nhập{order.skippedLines?' · '+order.skippedLines+' dòng bỏ qua':''}</span>
        </div>)}
      </div>
      <label className="warehouse-bulk-note">
        <span>Ghi chú nhập kho (không bắt buộc)</span>
        <input value={note} maxLength={500} disabled={busy}
          onChange={e=>setNote(e.target.value)} placeholder="Ghi chú cho lượt nhập"/>
      </label>
      <label className="warehouse-bulk-agreement">
        <input type="checkbox" checked={confirmText} disabled={busy||previewOnly}
          onChange={e=>setConfirmText(e.target.checked)}/>
        <span>Tôi đã kiểm tra các đơn và đồng ý ghi tăng tồn kho theo danh sách trên.</span>
      </label>
      {previewOnly&&<p className="warehouse-bulk-preview-note">Preview chỉ xem và thử chọn đơn; không ghi dữ liệu kho.</p>}
      {error&&<p role="alert" className="warehouse-bulk-error">{error}</p>}
      <div className="warehouse-bulk-review-actions">
        <button className="button primary small" type="button" disabled={previewOnly||busy||!confirmText}
          onClick={confirm}>{busy?'Đang xử lý…':'Xác nhận nhập '+orders.length+' đơn'}</button>
        <button className="button small" type="button" disabled={busy} onClick={onCancel}>Hủy</button>
      </div>
    </div>}
  </div>
}
