'use client'

import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {useRouter} from 'next/navigation'
import {formatMoney} from '@/lib/format'
import {saveWarehouseItemDecision,skipWarehouseItemWithoutSku,addWarehouseVariantAndMap} from '@/lib/actions/warehouse-item-decisions'
import type {HistoricalSuggestion} from '@/lib/warehouse-sku-suggestions'

type SkuProduct={id:string;sku:string;name:string}
type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{id?:string|null,sku?:string|null,name?:string|null}|null
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
  initialVariantId:string|null
  initialSalePrice:string|null
  initialMultiplier:number
  initialDecision:'IN'|'SKIP'|null
  initialSkipReason:string|null
  isEditing:boolean
}
type Decision='IN'|'SKIP'
type Mode='existing'|'variant'|'new'

function matchText(match:HistoricalSuggestion['match_kind']){
  if(match==='exact')return 'Khớp mã, tên và phân loại'
  if(match==='sku_variant')return 'Khớp SKU mua và phân loại'
  return 'Khớp tên và phân loại'
}

export function WarehouseInlineSkuHistoryPicker({
  target,history,variants,skuProducts=[],previewOnly,onClose,onSaved
}:{
  target:Target
  history:HistoricalSuggestion[]
  variants:Variant[]
  skuProducts?:SkuProduct[]
  previewOnly:boolean
  onClose:()=>void
  onSaved:(label:string)=>void
}){
  const router=useRouter()
  const panelRef=useRef<HTMLElement>(null)
  const busyRef=useRef(false)
  // Prefill the highest-ranked saved-history match IN MEMORY only. This is
  // not a persisted decision or an inventory transaction until confirmed.
  const preferred=history.find(option=>variants.some(variant=>variant.id===option.variant_id))
  const preferredVariant=variants.find(variant=>variant.id===preferred?.variant_id)
  // A saved mapping always wins over history suggestions. Never prefill
  // another SKU when the operator is correcting an existing decision.
  const initialVariant=target.isEditing
    ?variants.find(variant=>variant.id===target.initialVariantId)
    :preferredVariant
  const [mounted,setMounted]=useState(false)
  const [mode,setMode]=useState<Mode>('existing')
  const [variantId,setVariantId]=useState(initialVariant?.id??'')
  const [catalogQuery,setCatalogQuery]=useState('')
  const [catalogLetter,setCatalogLetter]=useState('Tất cả')
  const [catalogProductId,setCatalogProductId]=useState(initialVariant?.products?.id??'')
  const [catalogProductBrowserOpen,setCatalogProductBrowserOpen]=useState(false)
  const [newSku,setNewSku]=useState('')
  const [newName,setNewName]=useState(target.productName)
  const [newVariant,setNewVariant]=useState(target.sourceVariant||'Mặc định')
  const [existingProductId,setExistingProductId]=useState(initialVariant?.products?.id??'')
  const [productQuery,setProductQuery]=useState('')
  const [productLetter,setProductLetter]=useState('Tất cả')
  const [productBrowserOpen,setProductBrowserOpen]=useState(false)
  const [salePrice,setSalePrice]=useState(target.isEditing
    ?target.initialSalePrice??''
    :initialVariant?.sale_price===null||initialVariant?.sale_price===undefined
      ?'':String(initialVariant.sale_price))
  const [multiplier,setMultiplier]=useState(String(target.isEditing
    ?target.initialMultiplier:preferred?.multiplier??1))
  const [decision,setDecision]=useState<Decision|null>(
    target.isEditing?target.initialDecision:preferredVariant?'IN':null)
  const [skipReason,setSkipReason]=useState(target.isEditing?target.initialSkipReason??'':'')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>setMounted(true),[])

  // Suggestions are exclusively the persisted matching history supplied by
  // the existing engine. Unknown/deleted catalog variants are never offered.
  const available=history.filter(item=>variants.some(variant=>variant.id===item.variant_id))
  const selected=variants.find(variant=>variant.id===variantId)
  // Sort and navigate by normalized SKU code; Vietnamese accents do not
  // affect alphabetic lookup. Search and filters never mutate saved mappings.
  const normalizeCatalog=(value:string)=>value.normalize('NFD')
    .replace(/\p{M}/gu,'').replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLocaleUpperCase('vi').trim()
  // Parent product SKU is chosen before its sellable classification.
  const catalogProducts=skuProducts.length?skuProducts:
    [...new Map(variants.filter(v=>v.products?.id).map(v=>[v.products!.id!,{
      id:v.products!.id!,sku:String(v.products?.sku??''),name:String(v.products?.name??'')
    }])).values()]
  const alphabet=[...new Set(catalogProducts.map(p=>normalizeCatalog(p.sku).charAt(0)||'#'))]
    .sort((a,b)=>a.localeCompare(b,'en'))
  const catalogMatchedProducts=catalogProducts.filter(product=>
    (catalogLetter==='Tất cả'||(normalizeCatalog(product.sku).charAt(0)||'#')===catalogLetter)&&
    normalizeCatalog([product.sku,product.name].join(' ')).includes(normalizeCatalog(catalogQuery)))
    .sort((a,b)=>normalizeCatalog(a.sku).localeCompare(normalizeCatalog(b.sku),'en'))
  const catalogSelectedProduct=catalogProducts.find(product=>product.id===catalogProductId)
  const catalogVariants=variants.filter(v=>v.products?.id===catalogProductId)
    .sort((a,b)=>a.variant_name.localeCompare(b.variant_name,'vi'))
  const catalogHistory=available.filter(option=>catalogVariants.some(v=>v.id===option.variant_id))
  const newCode=newSku.trim().toUpperCase()
  const duplicatedSku=!!newCode&&variants.some(variant=>
    String(variant.products?.sku??'').trim().toUpperCase()===newCode)
  const validNew=!!newCode&&newCode.length<=100&&newName.trim().length>0&&
    newName.trim().length<=255&&newVariant.trim().length>0&&newVariant.trim().length<=255&&!duplicatedSku
  const existingProduct=skuProducts.find(product=>product.id===existingProductId)
  const productLetters=[...new Set(skuProducts.map(p=>normalizeCatalog(p.sku).charAt(0)||'#'))]
    .sort((left,right)=>left.localeCompare(right,'en'))
  const productsMatched=skuProducts.filter(product=>
    (productLetter==='Tất cả'||(normalizeCatalog(product.sku).charAt(0)||'#')===productLetter)&&
    normalizeCatalog([product.sku,product.name].join(' ')).includes(normalizeCatalog(productQuery)))
    .sort((left,right)=>normalizeCatalog(left.sku).localeCompare(normalizeCatalog(right.sku),'en'))
  const visibleProducts=productsMatched.slice(0,80)
  const duplicateVariant=!!existingProduct&&variants.some(variant=>
    variant.products?.id===existingProduct.id&&
    variant.variant_name.trim().toLocaleLowerCase('vi')===
      newVariant.trim().toLocaleLowerCase('vi'))
  const validVariant=!!existingProduct&&newVariant.trim().length>0&&
    newVariant.trim().length<=255&&!duplicateVariant
  function chooseCatalog(id:string){
    const variant=variants.find(item=>item.id===id)
    setVariantId(id)
    setCatalogProductId(variant?.products?.id??'')
    setSalePrice(variant?.sale_price===null||variant?.sale_price===undefined?'':String(variant.sale_price))
    setMultiplier('1')
    setDecision(target.isEditing?decision:null)
    setSkipReason(target.isEditing?skipReason:'')
    setError('')
  }
  function chooseCatalogProduct(id:string){
    if(id!==catalogProductId){
      // Invalidate the previous classification and price when parent SKU changes.
      setVariantId('')
      setSalePrice('')
      setMultiplier('1')
      setDecision(target.isEditing?decision:null)
      setSkipReason('')
    }
    setCatalogProductId(id)
    setCatalogProductBrowserOpen(false)
    setError('')
  }
  function changeMode(next:Mode){
    setMode(next)
    setDecision(target.isEditing?decision:null)
    setSkipReason(target.isEditing?skipReason:'')
    if(next==='new'||next==='variant'){
      if(next==='variant'){
        // A new classification must begin by choosing its parent SKU, never
        // silently inherit a prior variant or history suggestion.
        setExistingProductId('')
        setProductBrowserOpen(true)
        setProductQuery('')
        setProductLetter('Tất cả')
        setNewVariant('')
      }
      // New classifications must enter their own price, not reuse old price.
      setSalePrice('')
      setMultiplier('1')
      if(next==='variant')setNewVariant('')
    }else if(selected){
      setCatalogProductId(selected.products?.id??'')
      setSalePrice(selected.sale_price===null||selected.sale_price===undefined?'':String(selected.sale_price))
    }
    setError('')
  }
  function choose(option:HistoricalSuggestion){
    const variant=variants.find(item=>item.id===option.variant_id)
    if(!variant)return
    setVariantId(variant.id)
    setCatalogProductId(variant.products?.id??'')
    setCatalogProductBrowserOpen(false)
    setSalePrice(variant.sale_price===null||variant.sale_price===undefined?'':String(variant.sale_price))
    setMultiplier(String(option.multiplier))
    // Another verified historical mapping is also only an unsaved IN draft.
    setDecision('IN')
    setSkipReason('')
    setError('')
  }

  useEffect(()=>{
    // Clicking a mapped SKU in a lower warehouse may auto-scroll the table
    // just before the portal mounts. Ignore that activation scroll, but
    // continue to dismiss the picker on subsequent intentional scrolling.
    const debugClose=(reason:string)=>{
      // CI fixture only; no production logging or user data.
      if(window.location.protocol==='about:'){
        (window as Window & {__skuDebugClose?:string}).__skuDebugClose=reason
      }
      onClose()
    }
    const viewportWidth=window.innerWidth
    const viewportHeight=window.innerHeight
    const pointer=(event:PointerEvent)=>{
      if(busyRef.current||panelRef.current?.contains(event.target as Node))return
      debugClose('outside-pointer')
    }
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){
        event.preventDefault()
        event.stopPropagation()
        debugClose('escape')
      }
    }
    // Changing the SKU expands its alphabetical list. Browser auto-scroll
    // during that expansion must not close the picker mid-selection.
    // Outside click/Esc still dismiss it; real viewport resizes do too.
    const resize=()=>{
      if(Math.abs(window.innerWidth-viewportWidth)>4||
         Math.abs(window.innerHeight-viewportHeight)>4)debugClose('viewport-resize')
    }
    document.addEventListener('pointerdown',pointer,true)
    document.addEventListener('keydown',escape,true)
    window.addEventListener('resize',resize)
    return ()=>{
      document.removeEventListener('pointerdown',pointer,true)
      document.removeEventListener('keydown',escape,true)
      window.removeEventListener('resize',resize)
    }
  },[onClose])

  const price=Number(salePrice)
  const factor=Number(multiplier)
  const validPrice=salePrice.trim()!==''&&Number.isFinite(price)&&price>=0&&price<=999999999
  const validFactor=Number.isInteger(factor)&&factor>=1&&factor<=100000
  const unmappedSkip=target.isEditing&&target.initialVariantId===null&&
    mode==='existing'&&!selected&&decision==='SKIP'
  const validTarget=mode==='new'?validNew:mode==='variant'?validVariant:!!selected||unmappedSkip
  const canSave=!previewOnly&&!busy&&validTarget&&
    (unmappedSkip||validPrice&&validFactor)&&
    !!decision&&(decision!=='SKIP'||skipReason.trim().length>0&&skipReason.trim().length<=500)
  async function save(){
    if(!canSave||!decision||busyRef.current)return
    busyRef.current=true
    setBusy(true)
    setError('')
    try{
      if(mode==='variant'){
        await addWarehouseVariantAndMap({
          orderItemId:target.orderItemId,productId:existingProductId,
          variantName:newVariant.trim(),salePrice:price,multiplier:factor,decision,
          skipReason:decision==='SKIP'?skipReason.trim():null
        })
      }else if(unmappedSkip){
        await skipWarehouseItemWithoutSku({
          orderItemId:target.orderItemId,reason:skipReason.trim()
        })
      }else{
        await saveWarehouseItemDecision({
          orderItemId:target.orderItemId,
          variantId:mode==='existing'?selected?.id??null:null,
          newSku:mode==='new'?newCode:null,
          newName:mode==='new'?newName.trim():null,
          newVariant:mode==='new'?newVariant.trim():null,
          salePrice:price,multiplier:factor,decision,
          skipReason:decision==='SKIP'?skipReason.trim():null,
        })
      }
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

  if(!mounted)return null
  const narrow=window.innerWidth<=600
  const width=Math.min(380,window.innerWidth-20)
  const left=Math.max(10,Math.min(target.left,window.innerWidth-width-10))
  // Reserve the entire possible picker height before placing it. A short
  // initial suggestion list grows when the user selects one; its footer must
  // remain clickable even when the source row is near the viewport bottom.
  const maxPanelHeight=Math.min(540,Math.floor(window.innerHeight*.8))
  const top=Math.max(8,Math.min(target.bottom+5,window.innerHeight-maxPanelHeight-8))
  const position:CSSProperties=narrow
    ?{left:10,right:10,bottom:10,maxHeight:'min(75dvh,540px)'}
    :{left,top,maxWidth:width,maxHeight:'min(80dvh,540px)'}

  return createPortal(
    <section ref={panelRef} role="dialog" aria-label={target.isEditing?'Sửa ghép SKU':'Ghép SKU nhanh'}
      data-warehouse-inline-sku-history={target.orderItemId}
      className="warehouse-inline-sku-history" style={position}
      onClick={event=>event.stopPropagation()}>
      <div className="warehouse-inline-sku-history-head">
        <div>
          <strong>{target.isEditing?'Sửa ghép SKU':'Ghép SKU nhanh'}</strong>
          <small>{target.orderLabel} · {target.productName}</small>
          {target.sourceVariant&&<small>Phân loại mua: {target.sourceVariant}</small>}
        </div>
        <button type="button" aria-label="Đóng gợi ý ghép SKU" onClick={onClose} disabled={busy}>×</button>
      </div>
      <div className="warehouse-inline-sku-history-content">
        <div className="warehouse-inline-sku-history-modes" role="group" aria-label="Cách ghép SKU">
          <button type="button" className={mode==='existing'?'active':''} aria-pressed={mode==='existing'}
            disabled={busy} onClick={()=>changeMode('existing')}>Chọn SKU có sẵn</button>
          <button type="button" className={mode==='variant'?'active':''} aria-pressed={mode==='variant'}
            disabled={busy} onClick={()=>changeMode('variant')}>Thêm phân loại</button>
          <button type="button" className={mode==='new'?'active':''} aria-pressed={mode==='new'}
            disabled={busy} onClick={()=>changeMode('new')}>Tạo SKU mới</button>
        </div>
        {mode==='existing'&&<>
          {target.isEditing&&<p className="warehouse-inline-sku-draft-note">
            Đang sửa quyết định đã lưu; chưa thay đổi tồn kho.
          </p>}
          <div className="warehouse-sku-browser warehouse-sku-browser-compact">
            <div className="warehouse-sku-step-caption">Bước 1 · Chọn SKU sản phẩm</div>
            {catalogSelectedProduct&&!catalogProductBrowserOpen?
              <div className="warehouse-sku-product-selected" aria-label="SKU sản phẩm đã chọn">
                <span className="warehouse-sku-product-summary">
                  <b>{catalogSelectedProduct.sku}</b><small>{catalogSelectedProduct.name}</small>
                </span>
                <button type="button" disabled={busy} aria-label="Đổi SKU sản phẩm"
                  onClick={()=>{setCatalogProductBrowserOpen(true);setVariantId('');setSalePrice('')}}>Đổi SKU</button>
              </div>:
              <>
                <label className="warehouse-inline-sku-history-catalog">Tìm SKU sản phẩm
                  <input type="search" aria-label="Tìm SKU bán ghép nhanh"
                    placeholder="Tìm mã hoặc tên SKU…" value={catalogQuery}
                    disabled={busy} onChange={e=>setCatalogQuery(e.target.value)}/>
                </label>
                <div className="warehouse-sku-alphabet" role="group" aria-label="Lọc SKU theo chữ cái">
                  {['Tất cả',...alphabet].map(letter=><button type="button" key={letter}
                    disabled={busy} aria-pressed={catalogLetter===letter}
                    className={catalogLetter===letter?'active':''}
                    onClick={()=>setCatalogLetter(letter)}>{letter}</button>)}
                </div>
                <div className="warehouse-sku-sku-results warehouse-sku-browser-results"
                  role="group" aria-label="Danh sách SKU sản phẩm">
                  {catalogMatchedProducts.slice(0,80).map(product=><button type="button"
                    key={product.id} disabled={busy} aria-pressed={catalogProductId===product.id}
                    className={catalogProductId===product.id?'active':''}
                    onClick={()=>chooseCatalogProduct(product.id)}>
                    <b>{product.sku}</b><span>{product.name}</span>
                  </button>)}
                  {catalogMatchedProducts.length===0&&<p>Không tìm thấy SKU sản phẩm.</p>}
                </div>
              </>}
            {catalogSelectedProduct&&!catalogProductBrowserOpen&&<>
              <div className="warehouse-sku-step-caption">Bước 2 · Chọn phân loại của {catalogSelectedProduct.sku}</div>
              {catalogHistory.length>0&&<div className="warehouse-inline-sku-history-options">
                {catalogHistory.map(option=><button type="button" key={option.variant_id}
                  className={variantId===option.variant_id?'active':''}
                  aria-pressed={variantId===option.variant_id}
                  disabled={busy} onClick={()=>choose(option)}>
                  <b>{option.variant_name||'Mặc định'} · Đã ghép {option.history_count} đơn</b>
                  <small>Gợi ý lịch sử · Quy đổi ×{option.multiplier}</small>
                </button>)}
              </div>}
              <div className="warehouse-sku-browser-results warehouse-sku-classification-results"
                role="group" aria-label="Phân loại của SKU đã chọn">
                {catalogVariants.map(variant=><button type="button" key={variant.id}
                  className={variantId===variant.id?'active':''}
                  aria-pressed={variantId===variant.id} disabled={busy}
                  onClick={()=>chooseCatalog(variant.id)}>
                  <b>{variant.products?.sku||catalogSelectedProduct.sku}</b>
                  <span>{variant.variant_name}</span>
                  <small>{variant.sale_price!=null?formatMoney(Number(variant.sale_price)):'Chưa có giá bán'}</small>
                </button>)}
                {catalogVariants.length===0&&<p>SKU này chưa có phân loại. Hãy dùng mục Thêm phân loại.</p>}
              </div>
            </>}
          </div>
        </>}
        {mode==='variant'&&<div className="warehouse-inline-sku-history-new warehouse-inline-sku-variant-compact">
          <div className="warehouse-sku-step-caption">Bước 1 · Chọn SKU sản phẩm</div>
          {existingProduct&&!productBrowserOpen?
            <div className="warehouse-sku-product-selected" aria-label="SKU gốc đã chọn">
              <span className="warehouse-sku-product-summary">
                <b>{existingProduct.sku}</b>
                <small title={existingProduct.name}>{existingProduct.name}</small>
              </span>
              <button type="button" aria-label="Đổi SKU gốc" disabled={busy}
                onClick={()=>{setExistingProductId('');setNewVariant('');setProductBrowserOpen(true)}}>Đổi SKU</button>
            </div>:
            <div className="warehouse-sku-browser warehouse-sku-browser-compact">
              <label>Tìm SKU sản phẩm hiện có
                <input type="search" aria-label="Tìm SKU để thêm phân loại"
                  disabled={busy} value={productQuery} placeholder="Tìm mã hoặc tên SKU…"
                  onChange={event=>setProductQuery(event.target.value)}/>
              </label>
              <div className="warehouse-sku-alphabet" role="group" aria-label="Lọc SKU gốc theo ABC">
                {['Tất cả',...productLetters].map(letter=><button type="button" key={letter}
                  className={productLetter===letter?'active':''} aria-pressed={productLetter===letter}
                  disabled={busy} onClick={()=>setProductLetter(letter)}>{letter}</button>)}
              </div>
              <div className="warehouse-sku-browser-results" role="group" aria-label="Chọn SKU gốc để thêm phân loại">
                {existingProduct&&!productsMatched.some(p=>p.id===existingProduct.id)&&
                  <button type="button" className="active" disabled={busy} aria-pressed="true"
                    onClick={()=>setProductBrowserOpen(false)}>
                    <b>{existingProduct.sku}</b><span>{existingProduct.name}</span>
                  </button>}
                {visibleProducts.map(product=><button type="button" key={product.id}
                  disabled={busy} aria-pressed={existingProductId===product.id}
                  className={existingProductId===product.id?'active':''}
                  onClick={()=>{setExistingProductId(product.id);setProductBrowserOpen(false);setNewVariant('');setError('')}}>
                  <b>{product.sku}</b><span>{product.name}</span>
                </button>)}
                {productsMatched.length===0&&<p>Không tìm thấy SKU phù hợp</p>}
              </div>
              {productsMatched.length>80&&<small>{productsMatched.length} SKU · Hiển thị 80 kết quả đầu</small>}
            </div>}
          {existingProduct&&<div className="warehouse-sku-step-caption">Bước 2 · Thêm phân loại cho {existingProduct.sku}</div>}
          {existingProduct&&<label>Phân loại bán mới
            <input type="text" maxLength={255} disabled={busy}
              aria-label="Tên phân loại mới của SKU cũ" placeholder="Ví dụ: Đỏ / Size M"
              value={newVariant} onChange={event=>setNewVariant(event.target.value)}/>
          </label>}
          {!existingProduct&&<small className="warehouse-sku-step-hint">Chọn SKU phía trên để hiện bước phân loại và giá bán.</small>}
          {duplicateVariant&&<small role="alert" className="warehouse-inline-sku-history-error">
            Phân loại này đã tồn tại trong SKU. Hãy chọn phân loại có sẵn.
          </small>}
        </div>}
        {mode==='new'&&<div className="warehouse-inline-sku-history-new">
          <p>Tạo SKU bán mới từ sản phẩm mua này. Nhập mã SKU mới; kiểm tra lại tên và phân loại trước khi lưu.</p>
          <label>Mã SKU bán mới
            <input type="text" aria-label="Mã SKU bán mới ghép nhanh" maxLength={100}
              placeholder="Nhập mã SKU mới" value={newSku} disabled={busy}
              onChange={e=>setNewSku(e.target.value)}/>
          </label>
          <label>Tên sản phẩm
            <input type="text" aria-label="Tên SKU mới ghép nhanh" maxLength={255}
              value={newName} disabled={busy} onChange={e=>setNewName(e.target.value)}/>
          </label>
          <label>Phân loại
            <input type="text" aria-label="Phân loại SKU mới ghép nhanh" maxLength={255}
              value={newVariant} disabled={busy} onChange={e=>setNewVariant(e.target.value)}/>
          </label>
          {duplicatedSku&&<small className="warehouse-inline-sku-history-error">Mã SKU đã có trong danh mục. Hãy chọn SKU có sẵn.</small>}
        </div>}
        {(mode==='new'||(mode==='variant'&&!!existingProduct)||(mode==='existing'&&!!selected)||unmappedSkip)&&<div className="warehouse-inline-sku-history-edit">
          <strong>Đối chiếu trước khi lưu</strong>
          {!unmappedSkip&&<div className="warehouse-inline-sku-history-numbers">
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
          </div>}
          {!unmappedSkip&&<small>Số lượng dự kiến: {validFactor?target.quantity*factor:'—'} · Giá bán: {validPrice?formatMoney(price):'Chưa có'}</small>}
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
          <small>{unmappedSkip?'Giữ quyết định bỏ qua kho, không tạo SKU bán.':
            'Chỉ lưu ghép SKU và quyết định; chưa ghi tăng tồn kho.'}</small>
        </div>}
        {previewOnly&&<p className="warehouse-inline-sku-history-readonly">Preview chỉ xem và thử ghép SKU, không ghi dữ liệu kho.</p>}
        {error&&<p role="alert" className="warehouse-inline-sku-history-error">{error}</p>}
      </div>
      <footer className="warehouse-inline-sku-history-footer">
        <button type="button" className="button small" disabled={busy} onClick={onClose}>Đóng</button>
        <button type="button" className="button primary small"
          disabled={!canSave} onClick={()=>void save()}>{busy?'Đang lưu…':
            target.isEditing?'Lưu thay đổi':'Lưu ghép SKU'}</button>
      </footer>
    </section>,document.body)
}
