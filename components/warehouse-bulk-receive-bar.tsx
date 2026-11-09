'use client'

import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {formatMoney} from '@/lib/format'
import {useRouter} from 'next/navigation'
import {bulkReceiveWarehouseOrders,type WarehouseBulkResult} from '@/lib/actions/warehouse-bulk-receive'

export type BulkItemPreview={
  id:string
  name:string
  variant:string|null
  sku:string|null
  skuName:string|null
  quantity:number
  multiplier:number
  stockUnits:number
  originalPrice:number|string|null
  purchasePrice:number|string|null
  salePrice:number|string|null
  salePriceSource:'SAVED'|'CATALOG'|'MISSING'
  decision:'IN'|'SKIP'
  decisionSaved:boolean
  reason:string|null
}

export type BulkOrderPreview={
  id:string
  label:string
  mode:'LEGACY'|'V2'
  lines:number
  inLines:number
  skippedLines:number
  stockUnits:number
  items:BulkItemPreview[]
}

function price(value:number|string|null){return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'Chưa có':formatMoney(value)}

export function WarehouseBulkReceiveBar({
  warehouseId,warehouseCode,orders,previewOnly,reviewOpen,onReview,onCancel,onOpenOrder,onResult
}:{
  warehouseId:string
  warehouseCode:string
  orders:BulkOrderPreview[]
  previewOnly:boolean
  reviewOpen:boolean
  onReview:()=>void
  onCancel:()=>void
  onOpenOrder:(id:string)=>void
  onResult:(result:WarehouseBulkResult)=>void
}){
  const router=useRouter()
  const titleId=useId()
  const closeRef=useRef<HTMLButtonElement>(null)
  const [mounted,setMounted]=useState(false)
  useEffect(()=>setMounted(true),[])
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState('')
  const [error,setError]=useState('')
  const [confirmText,setConfirmText]=useState(false)
  const [expandedOrders,setExpandedOrders]=useState<string[]>([])
  useEffect(()=>{
    if(!reviewOpen){setError('');setConfirmText(false)}
    else setExpandedOrders(orders[0]?[orders[0].id]:[])
  },[reviewOpen])
  useEffect(()=>{
    if(!reviewOpen)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busy){event.stopPropagation();onCancel()}
    }
    document.addEventListener('keydown',keydown,true)
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',keydown,true)}
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
  return <>
    <div className="warehouse-bulk-bar" data-bulk-warehouse={warehouseCode}>
    <div className="warehouse-bulk-toolbar">
      <span><b>{orders.length}</b> đơn được chọn · Kho {warehouseCode}</span>
      <div className="warehouse-bulk-actions">
        <button type="button" className="button primary small" disabled={busy}
          onClick={onReview} aria-expanded={reviewOpen}>
          Xem trước nhập hàng loạt
        </button>
        <button type="button" className="button small" disabled={busy} onClick={onCancel}>
          Bỏ chọn
        </button>
      </div>
    </div>
    </div>
    {reviewOpen&&mounted&&createPortal(
      <div className="receive-confirm-backdrop warehouse-bulk-backdrop" role="presentation"
        onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onCancel()}}>
        <section role="dialog" aria-modal="true" aria-labelledby={titleId}
          className="receive-confirm-modal warehouse-bulk-modal" data-warehouse-bulk-popup={warehouseCode}>
          <header className="receive-confirm-head warehouse-bulk-modal-head">
            <div><span className="module-eyebrow">XEM TRƯỚC · NHẬP KHO HÀNG LOẠT</span>
              <h3 id={titleId}>Kho {warehouseCode} · Đối chiếu SKU và giá</h3>
              <p>{orders.length} đơn · {lines} sản phẩm · {stockUnits} đơn vị dự kiến nhập</p>
            </div>
            <button ref={closeRef} className="close" type="button" aria-label="Đóng xem trước"
              disabled={busy} onClick={onCancel}>×</button>
          </header>
          <div className="warehouse-bulk-modal-scroll">
            <div className="warehouse-bulk-summary">
              <span><b>{orders.length}</b> đơn</span>
              <span><b>{inLines}</b> dòng nhập</span>
              <span><b>{skippedLines}</b> dòng bỏ qua</span>
              <span><b>{stockUnits}</b> đơn vị nhập</span>
            </div>
            <p className="warehouse-bulk-explain">{legacy} đơn nhập toàn bộ · {v2} đơn theo quyết định sản phẩm.
              Giá nhập dùng giá sau giảm/SP đã có; giá bán ưu tiên giá đã lưu khi bóc tách. Giá thiếu không tự đoán.</p>
            <div className="warehouse-bulk-review-toolbar">
              <div>
                <strong>Đối chiếu từng đơn</strong>
                <span>Mỗi đơn một nhóm, chỉ mở chi tiết khi cần kiểm tra.</span>
              </div>
              <button type="button" className="button small" disabled={busy}
                onClick={()=>setExpandedOrders(expandedOrders.length===orders.length?[]:orders.map(order=>order.id))}>
                {expandedOrders.length===orders.length?'Thu gọn tất cả':'Mở tất cả'}
              </button>
            </div>
            <div className="warehouse-bulk-review" aria-label="Đối chiếu sản phẩm mua, SKU, giá và quyết định kho">
              {orders.map((order,index)=>{
                const expanded=expandedOrders.includes(order.id)
                return <section className={'warehouse-bulk-order-group'+(expanded?' expanded':'')}
                  key={order.id} data-review-order={order.id}>
                  <div className="warehouse-bulk-order-heading">
                    <button type="button" className="warehouse-bulk-order-toggle" disabled={busy}
                      aria-expanded={expanded}
                      onClick={()=>setExpandedOrders(current=>current.includes(order.id)
                        ?current.filter(id=>id!==order.id):[...current,order.id])}>
                      <span className="warehouse-bulk-order-number">{index+1}</span>
                      <span className="warehouse-bulk-order-identity">
                        <b>{order.label}</b>
                        <small>{order.lines} sản phẩm · {order.inLines} nhập · {order.skippedLines} bỏ qua · {order.stockUnits} đơn vị</small>
                      </span>
                      <span aria-hidden="true" className="warehouse-bulk-expand-icon">{expanded?'⌄':'›'}</span>
                    </button>
                    <button type="button" className="warehouse-bulk-edit-order" disabled={busy}
                      onClick={()=>onOpenOrder(order.id)} title={'Mở bóc tách đơn '+order.label}>
                      Sửa bóc tách
                    </button>
                  </div>
                  {expanded&&<div className="warehouse-bulk-order-details">
                    <table className="warehouse-bulk-review-table">
                      <thead><tr><th>Sản phẩm mua</th><th>SKU bán ghép</th>
                        <th>SL mua → nhập</th><th>Giá nhập/SP</th>
                        <th>Giá bán/SP</th><th>Quyết định</th></tr></thead>
                      <tbody>{order.items.map(item=>
                        <tr key={item.id} className={item.decision==='SKIP'?'warehouse-bulk-skip-row':''}>
                          <td data-label="Sản phẩm mua" title={item.name}><b>{item.name}</b>
                            {item.variant&&<small>{item.variant}</small>}</td>
                          <td data-label="SKU bán ghép" title={item.skuName??''}><b>{item.sku??'Chưa ghép'}</b>
                            <small>{item.skuName??'Chưa có tên SKU'}</small></td>
                          <td data-label="SL mua → nhập"><b>{item.quantity} → {item.decision==='SKIP'?0:item.stockUnits}</b>
                            <small>Quy đổi ×{item.multiplier}</small></td>
                          <td data-label="Giá nhập/SP" title={'Giá gốc/SP: '+price(item.originalPrice)}>
                            <b>{price(item.purchasePrice)}</b><small>Sau giảm/SP</small></td>
                          <td data-label="Giá bán/SP"><b>{price(item.salePrice)}</b><small>
                            {item.salePriceSource==='SAVED'?'Đã lưu khi bóc tách':
                              item.salePriceSource==='CATALOG'?'Giá bán danh mục':'Chưa có giá bán'}</small></td>
                          <td data-label="Quyết định"><b className={'warehouse-bulk-decision '+(item.decision==='IN'?'in':'skip')}>
                            {item.decision==='IN'?'Nhập kho':'Bỏ qua kho'}</b>
                            <small>{item.decisionSaved?'Đã lưu quyết định':'Theo luồng nhập toàn bộ'}</small>
                            {item.reason&&<small title={item.reason}>Lý do: {item.reason}</small>}</td>
                        </tr>)}</tbody>
                    </table>
                  </div>}
                </section>
              })}
            </div>
            <div className="warehouse-bulk-note-info"><b>Kiểm tra trước khi ghi tồn</b>
              <span>Dòng Bỏ qua không làm tăng tồn. Bấm mã đơn để quay lại slidebar và sửa SKU, giá bán hoặc quyết định kho.</span></div>
            <label className="warehouse-bulk-note"><span>Ghi chú nhập kho (không bắt buộc)</span>
              <input value={note} maxLength={500} disabled={busy} onChange={e=>setNote(e.target.value)}
                placeholder="Ghi chú cho lượt nhập"/></label>
            <label className="warehouse-bulk-agreement"><input type="checkbox" checked={confirmText}
              disabled={busy||previewOnly} onChange={e=>setConfirmText(e.target.checked)}/>
              <span>Tôi đã đối chiếu đơn, SKU, giá nhập, giá bán và quyết định Nhập/Bỏ qua.</span></label>
            {previewOnly&&<p className="warehouse-bulk-preview-note">Preview chỉ xem, không ghi tồn kho.</p>}
            {error&&<p role="alert" className="warehouse-bulk-error">{error}</p>}
          </div>
          <footer className="receive-confirm-actions warehouse-bulk-modal-footer">
            <button className="button" type="button" disabled={busy} onClick={onCancel}>Hủy</button>
            <button className="button primary" type="button" disabled={previewOnly||busy||!confirmText}
              onClick={confirm}>{busy?'Đang xử lý…':'Xác nhận nhập '+orders.length+' đơn'}</button>
          </footer>
        </section>
      </div>,document.body)}
  </>
}
