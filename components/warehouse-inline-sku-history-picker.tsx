'use client'

import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {useRouter} from 'next/navigation'
import {formatMoney} from '@/lib/format'
import {saveWarehouseItemDecision} from '@/lib/actions/warehouse-item-decisions'
import type {HistoricalSuggestion} from '@/lib/warehouse-sku-suggestions'

type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{sku?:string|null,name?:string|null}|null
}
type Target={
  orderItemId:string
  orderLabel:string
  productName:string
  sourceVariant:string|null
  quantity:number
  left:number
  top:number
  bottom:number
}
type Decision='IN'|'SKIP'

function matchText(match:HistoricalSuggestion['match_kind']){
  if(match==='exact')return 'Khớp mã, tên và phân loại'
  if(match==='sku_variant')return 'Khớp SKU mua và phân loại'
  return 'Khớp tên và phân loại'
}

export function WarehouseInlineSkuHistoryPicker({
  target,history,variants,previewOnly,onClose,onSaved
}:{
  target:Target
  history:HistoricalSuggestion[]
  variants:Variant[]
  previewOnly:boolean
  onClose:()=>void
  onSaved:(label:string)=>void
}){
  const router=useRouter()
  const panelRef=useRef<HTMLElement>(null)
  const busyRef=useRef(false)
  const [mounted,setMounted]=useState(false)
  const [variantId,setVariantId]=useState('')
  const [salePrice,setSalePrice]=useState('')
  const [multiplier,setMultiplier]=useState('1')
  const [decision,setDecision]=useState<Decision|null>(null)
  const [skipReason,setSkipReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>setMounted(true),[])

  // Suggestions are exclusively the persisted matching history supplied by
  // the existing engine. Unknown/deleted catalog variants are never offered.
  const available=history.filter(item=>variants.some(variant=>variant.id===item.variant_id))
  const selected=variants.find(variant=>variant.id===variantId)
  function choose(option:HistoricalSuggestion){
    const variant=variants.find(item=>item.id===option.variant_id)
    if(!variant)return
    setVariantId(variant.id)
    setSalePrice(variant.sale_price===null||variant.sale_price===undefined?'':String(variant.sale_price))
    setMultiplier(String(option.multiplier))
    setDecision(null)
    setSkipReason('')
    setError('')
  }

  useEffect(()=>{
    const pointer=(event:PointerEvent)=>{
      if(busyRef.current||panelRef.current?.contains(event.target as Node))return
      onClose()
    }
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    const closeOnScroll=(event:Event)=>{
      if(busyRef.current||panelRef.current?.contains(event.target as Node))return
      onClose()
    }
    document.addEventListener('pointerdown',pointer,true)
    document.addEventListener('keydown',escape,true)
    document.addEventListener('scroll',closeOnScroll,true)
    window.addEventListener('resize',onClose)
    return ()=>{
      document.removeEventListener('pointerdown',pointer,true)
      document.removeEventListener('keydown',escape,true)
      document.removeEventListener('scroll',closeOnScroll,true)
      window.removeEventListener('resize',onClose)
    }
  },[onClose])

  const price=Number(salePrice)
  const factor=Number(multiplier)
  const validPrice=salePrice.trim()!==''&&Number.isFinite(price)&&price>=0&&price<=999999999
  const validFactor=Number.isInteger(factor)&&factor>=1&&factor<=100000
  const canSave=!previewOnly&&!busy&&!!selected&&validPrice&&validFactor&&
    !!decision&&(decision!=='SKIP'||skipReason.trim().length>0&&skipReason.trim().length<=500)
  async function save(){
    if(!canSave||!selected||!decision||busyRef.current)return
    busyRef.current=true
    setBusy(true)
    setError('')
    try{
      await saveWarehouseItemDecision({
        orderItemId:target.orderItemId,
        variantId:selected.id,
        newSku:null,newName:null,newVariant:null,
        salePrice:price,multiplier:factor,decision,
        skipReason:decision==='SKIP'?skipReason.trim():null,
      })
      onSaved(target.orderLabel)
      onClose()
      router.refresh()
    }catch(e){
      setError(e instanceof Error?e.message:'Không thể lưu ghép SKU. Vui lòng thử lại.')
    }finally{
      busyRef.current=false
      setBusy(false)
    }
  }

  if(!mounted||available.length===0)return null
  const narrow=window.innerWidth<=600
  const width=Math.min(380,window.innerWidth-20)
  const left=Math.max(10,Math.min(target.left,window.innerWidth-width-10))
  const roomBelow=window.innerHeight-target.bottom
  const top=roomBelow>=350?target.bottom+5:Math.max(8,target.top-400)
  const position:CSSProperties=narrow
    ?{left:10,right:10,bottom:10,maxHeight:'min(75dvh,540px)'}
    :{left,top,maxWidth:width,maxHeight:'min(80dvh,540px)'}

  return createPortal(
    <section ref={panelRef} role="dialog" aria-label="Gợi ý ghép SKU từ lịch sử"
      data-warehouse-inline-sku-history={target.orderItemId}
      className="warehouse-inline-sku-history" style={position}
      onClick={event=>event.stopPropagation()}>
      <div className="warehouse-inline-sku-history-head">
        <div>
          <strong>Ghép SKU từ lịch sử</strong>
          <small>{target.orderLabel} · {target.productName}</small>
          {target.sourceVariant&&<small>Phân loại mua: {target.sourceVariant}</small>}
        </div>
        <button type="button" aria-label="Đóng gợi ý ghép SKU" onClick={onClose} disabled={busy}>×</button>
      </div>
      <div className="warehouse-inline-sku-history-content">
        <p>Đã tìm thấy {available.length} SKU từng ghép với sản phẩm tương tự. Chọn và đối chiếu, không tự động ghép.</p>
        <div className="warehouse-inline-sku-history-options">
          {available.map(option=><button type="button" key={option.variant_id}
            className={variantId===option.variant_id?'active':''}
            aria-pressed={variantId===option.variant_id}
            disabled={busy} onClick={()=>choose(option)}>
            <b>{option.sku||'SKU chưa có mã'} · {option.product_name||'Chưa có tên'}</b>
            <small>{option.variant_name||'Mặc định'} · Quy đổi ×{option.multiplier}</small>
            <small>{option.history_count} đơn cũ · {matchText(option.match_kind)}</small>
          </button>)}
        </div>
        {selected&&<div className="warehouse-inline-sku-history-edit">
          <strong>Đối chiếu trước khi lưu</strong>
          <div className="warehouse-inline-sku-history-numbers">
            <label>Giá bán
              <input type="number" inputMode="decimal" min="0" max="999999999" step="1"
                value={salePrice} onChange={e=>setSalePrice(e.target.value)}
                aria-label="Giá bán ghép nhanh" disabled={busy} placeholder="Nhập giá bán"/>
            </label>
            <label>Hệ số quy đổi
              <input type="number" inputMode="numeric" min="1" max="100000" step="1"
                value={multiplier} onChange={e=>setMultiplier(e.target.value)}
                aria-label="Hệ số ghép nhanh" disabled={busy}/>
            </label>
          </div>
          <small>Số lượng dự kiến: {validFactor?target.quantity*factor:'—'} · Giá bán: {validPrice?formatMoney(price):'Chưa có'}</small>
          <div className="warehouse-inline-sku-history-decisions" aria-label="Quyết định kho">
            <span>Quyết định kho</span>
            <div>
              <button type="button" aria-pressed={decision==='IN'} className={decision==='IN'?'active':''}
                disabled={busy} onClick={()=>{setDecision('IN');setSkipReason('')}}>Nhập kho</button>
              <button type="button" aria-pressed={decision==='SKIP'} className={decision==='SKIP'?'active':''}
                disabled={busy} onClick={()=>setDecision('SKIP')}>Bỏ qua kho</button>
            </div>
          </div>
          {decision==='SKIP'&&<label>Lý do bỏ qua kho
            <input type="text" maxLength={500} value={skipReason}
              onChange={e=>setSkipReason(e.target.value)}
              aria-label="Lý do bỏ qua ghép nhanh" disabled={busy} placeholder="Nhập lý do"/>
          </label>}
          <small>Chỉ lưu ghép SKU và quyết định; chưa ghi tăng tồn kho.</small>
        </div>}
        {previewOnly&&<p className="warehouse-inline-sku-history-readonly">Preview chỉ xem gợi ý, không lưu vào kho.</p>}
        {error&&<p role="alert" className="warehouse-inline-sku-history-error">{error}</p>}
      </div>
      <footer className="warehouse-inline-sku-history-footer">
        <button type="button" className="button small" disabled={busy} onClick={onClose}>Đóng</button>
        <button type="button" className="button primary small"
          disabled={!canSave} onClick={()=>void save()}>{busy?'Đang lưu…':'Lưu ghép SKU'}</button>
      </footer>
    </section>,document.body)
}
