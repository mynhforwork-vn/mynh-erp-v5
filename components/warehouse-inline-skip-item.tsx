'use client'

import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {useRouter} from 'next/navigation'
import {skipWarehouseItemWithoutSku} from '@/lib/actions/warehouse-item-decisions'

type Target={
  orderItemId:string
  orderLabel:string
  productName:string
  left:number
  top:number
  bottom:number
}

/** Item-level skip is independent of SKU matching. It saves only the
 * user's explicit decision; it neither invents a SKU nor books stock. */
export function WarehouseInlineSkipItem({
  target,previewOnly,onClose,onSaved
}:{
  target:Target
  previewOnly:boolean
  onClose:()=>void
  onSaved:(message:string)=>void
}){
  const router=useRouter()
  const panelRef=useRef<HTMLElement>(null)
  const inFlight=useRef(false)
  const [mounted,setMounted]=useState(false)
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>setMounted(true),[])
  useEffect(()=>{
    const pointer=(event:PointerEvent)=>{
      if(inFlight.current||panelRef.current?.contains(event.target as Node))return
      onClose()
    }
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!inFlight.current){
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    const onScroll=(event:Event)=>{
      if(inFlight.current||panelRef.current?.contains(event.target as Node))return
      onClose()
    }
    document.addEventListener('pointerdown',pointer,true)
    document.addEventListener('keydown',escape,true)
    document.addEventListener('scroll',onScroll,true)
    window.addEventListener('resize',onClose)
    return ()=>{
      document.removeEventListener('pointerdown',pointer,true)
      document.removeEventListener('keydown',escape,true)
      document.removeEventListener('scroll',onScroll,true)
      window.removeEventListener('resize',onClose)
    }
  },[onClose])

  const canSave=!previewOnly&&!busy&&reason.trim().length>0&&reason.trim().length<=500
  async function save(){
    if(!canSave||inFlight.current)return
    inFlight.current=true
    setBusy(true)
    setError('')
    try{
      await skipWarehouseItemWithoutSku({orderItemId:target.orderItemId,reason:reason.trim()})
      onSaved('Đã lưu bỏ qua kho · '+target.orderLabel+' · '+target.productName+
        '. Không cần ghép SKU; không ghi tăng tồn kho.')
      onClose()
      router.refresh()
    }catch(e){
      setError(e instanceof Error?e.message:'Không thể bỏ qua sản phẩm. Vui lòng thử lại.')
    }finally{
      inFlight.current=false
      setBusy(false)
    }
  }
  if(!mounted)return null
  const narrow=window.innerWidth<=600
  const width=Math.min(340,window.innerWidth-20)
  const maxPanelHeight=Math.min(330,Math.floor(window.innerHeight*.7))
  const left=Math.max(10,Math.min(target.left,window.innerWidth-width-10))
  const top=Math.max(8,Math.min(target.bottom+5,window.innerHeight-maxPanelHeight-8))
  const style:CSSProperties=narrow
    ?{left:10,right:10,bottom:10,maxHeight:'min(72dvh,350px)'}
    :{left,top,maxWidth:width,maxHeight:'min(72dvh,350px)'}

  return createPortal(
    <section ref={panelRef} role="dialog" aria-label="Bỏ qua kho sản phẩm"
      data-warehouse-inline-skip={target.orderItemId}
      className="warehouse-inline-sku-history warehouse-inline-item-skip" style={style}
      onClick={event=>event.stopPropagation()}>
      <div className="warehouse-inline-sku-history-head">
        <div>
          <strong>Bỏ qua kho</strong>
          <small>{target.orderLabel} · {target.productName}</small>
        </div>
        <button type="button" aria-label="Đóng bỏ qua kho" disabled={busy} onClick={onClose}>×</button>
      </div>
      <div className="warehouse-inline-sku-history-content">
        <p>Sản phẩm này sẽ không nhập kho. Không cần ghép hoặc tạo SKU bán.</p>
        <label className="warehouse-inline-skip-reason">
          <span>Lý do bỏ qua (bắt buộc)</span>
          <textarea rows={3} maxLength={500} value={reason} disabled={busy}
            onChange={event=>setReason(event.target.value)}
            aria-label="Lý do bỏ qua sản phẩm"
            placeholder="Ví dụ: Hàng tặng, không quản lý tồn kho"/>
        </label>
        {previewOnly&&<p className="warehouse-inline-sku-history-readonly">
          Preview chỉ xem; không lưu quyết định vào Supabase.
        </p>}
        {error&&<p role="alert" className="warehouse-inline-sku-history-error">{error}</p>}
      </div>
      <footer className="warehouse-inline-sku-history-footer">
        <button type="button" className="button small" disabled={busy} onClick={onClose}>Đóng</button>
        <button type="button" className="button primary small"
          disabled={!canSave} onClick={()=>void save()}>
          {busy?'Đang lưu…':'Xác nhận bỏ qua'}
        </button>
      </footer>
    </section>,document.body)
}
