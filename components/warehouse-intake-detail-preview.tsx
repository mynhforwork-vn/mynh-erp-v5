'use client'

import {useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {saveWarehouseItemDecision,addWarehouseVariantAndMap,finalizeWarehouseItemDecisions} from '@/lib/actions/warehouse-item-decisions'
import {formatDateTime,formatMoney,formatPhone,statusLabel} from '@/lib/format'
import {prepaidSourceLabel,resolveOrderValue} from '@/lib/order-prepaid'
import {VoucherTags} from '@/components/voucher-tags'
import {WarehouseReceivedSkuCorrection} from '@/components/warehouse-received-sku-correction'
import type {HistoricalSuggestion} from '@/lib/warehouse-sku-suggestions'

type SkuProduct={id:string;sku:string;name:string}
type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{id?:string|null,sku?:string|null,name?:string|null}|null
}
type Item={
  id:string
  sku?:string|null
  product_name:string
  variant?:string|null
  quantity:number
  original_price?:number|string|null
  final_price?:number|string|null
  product_variant_id?:string|null
  inventory_multiplier?:number|null
  product_variants?:Variant|null
}
type Warehouse={
  id?:string|null
  code?:string|null
  name?:string|null
  address?:string|null
}
type Batch={warehouse_id?:string|null,received_at?:string|null,warehouses?:Warehouse|null}
type Order={
  id:string
  shopee_order_id?:string|null
  warehouse_status?:string|null
  receive_status?:string|null
  shipping_service?:string|null
  order_date?:string|null
  created_at?:string|null
  order_status?:string|null
  payment_status?:string|null
  cod?:number|string|null
  prepaid_amount?:number|string|null
  prepaid_source_type?:string|null
  prepaid_source_label?:string|null
  recipient_name?:string|null
  recipient_phone?:string|null
  recipient_address?:string|null
  area?:string|null
  destination_hub?:string|null
  erp_users?:{username?:string|null}|null
  shipments?:Array<{carrier?:string|null,tracking_number?:string|null,current_tracking_status?:string|null,is_active?:boolean}>|null
  order_vouchers?:Array<{voucher_code?:string|null,voucher_name?:string|null,voucher_type?:string|null,voucher_tag?:string|null}>|null
  receive_batch_details?:{receive_batches?:Batch|Batch[]|null}|Array<{receive_batches?:Batch|Batch[]|null}>|null
  order_items:Item[]
}
type Audit={
  id:number|string
  entity_id?:string|null
  action:string
  created_at:string
  old_value?:Record<string,unknown>|null
  new_value?:Record<string,unknown>|null
}
type Suggestion=HistoricalSuggestion
type Mode='existing'|'variant'|'new'
type Decision='IN'|'SKIP'
type Draft={
  mode:Mode
  variantId:string
  query:string
  salePrice:string
  newSku:string
  productId:string
  newName:string
  newVariant:string
  multiplier:string
  decision:Decision
  reason:string
}
type Choice={action:Decision,sku:string,price:string,multiplier:number,quantity:number,reason?:string}
type ItemDecision={
  order_item_id:string;order_id:string;product_variant_id:string|null
  decision:'IN'|'SKIP';sale_price:number|string;multiplier:number
  skip_reason?:string|null;processing_state:'DRAFT'|'FINALIZED';updated_at?:string
}
type Tab='products'|'info'|'history'
const normalizeSku=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'')
  .replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleUpperCase('vi').trim()

function batchOf(order:Order){
  const detail=Array.isArray(order.receive_batch_details)?order.receive_batch_details[0]:order.receive_batch_details
  const source=detail?.receive_batches
  return Array.isArray(source)?source[0]??null:source??null
}
function displayMoney(value?:number|string|null){
  return value===null||value===undefined||value===''?'Chưa có':formatMoney(value)
}
function sourceTotal(items:Item[],name:'original_price'|'final_price'){
  if(!items.length||items.some(item=>item[name]===undefined||item[name]===null||item[name]===''))return null
  return items.reduce((sum,item)=>sum+Number(item[name])*Number(item.quantity),0)
}
function actionLabel(action:string){
  if(action==='MAP_INVENTORY_SKU')return 'Bóc tách SKU'
  if(action==='RECEIVE_INTO_STOCK'||action==='RECEIVE_ORDERS_INTO_WAREHOUSE')return 'Nhập kho'
  if(action==='SKIP_WAREHOUSE')return 'Bỏ qua kho'
  if(action==='SAVE_ITEM_DECISION')return 'Lưu SKU và quyết định sản phẩm'
  if(action==='FINALIZE_ITEM_DECISION')return 'Chốt xử lý sản phẩm'
  if(action==='FINALIZE_ORDER_WAREHOUSE')return 'Hoàn tất xử lý kho'
  if(action==='CORRECT_RECEIVED_SKU')return 'Điều chỉnh SKU sau nhập kho'
  return 'Thao tác kho'
}
function initialDraft(item:Item,saved?:ItemDecision):Draft{
  return {
    mode:'existing',variantId:saved?.product_variant_id??item.product_variant_id??'',query:'',
    salePrice:saved?String(saved.sale_price):item.product_variants?.sale_price===null||item.product_variants?.sale_price===undefined
      ?'':String(item.product_variants.sale_price),
    newSku:'',productId:item.product_variants?.products?.id??'',
    newName:item.product_name,newVariant:item.variant??'Mặc định',
    multiplier:String(saved?.multiplier??item.inventory_multiplier??1),
    decision:saved?.decision??'IN',reason:saved?.skip_reason??'',
  }
}
const handled=new Set(['WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED','WAREHOUSE_MIXED'])
function stateLabel(order:Order){
  if(order.warehouse_status==='WAREHOUSE_RECEIVED')return 'Đã nhập kho'
  if(order.warehouse_status==='WAREHOUSE_SKIPPED')return 'Đã bỏ qua kho'
  if(order.warehouse_status==='WAREHOUSE_MIXED')return 'Đã xử lý hỗn hợp'
  return order.order_items.length>0&&order.order_items.every(item=>!!item.product_variant_id)
    ? 'Chờ nhập kho':'Chờ bóc tách'
}

export function WarehouseIntakeDetailPreview({
  order,variants,skuProducts=[],auditLogs,suggestions,itemDecisions={},previewOnly=true,simulate=true,canCorrectFinalizedSku=false,onClose
}:{
  order:Order
  variants:Variant[]
  skuProducts?:SkuProduct[]
  auditLogs:Audit[]
  suggestions:Record<string,Suggestion[]>
  itemDecisions?:Record<string,ItemDecision>
  previewOnly?:boolean
  simulate?:boolean
  canCorrectFinalizedSku?:boolean
  onClose:()=>void
}){
  const [tab,setTab]=useState<Tab>('products')
  const [skuLetter,setSkuLetter]=useState('Tất cả')
  const [skuBrowseOpen,setSkuBrowseOpen]=useState(false)
  const [focusedId,setFocusedId]=useState<string>(
    (handled.has(order.warehouse_status??'')
      ?order.order_items.find(item=>itemDecisions[item.id]?.processing_state==='FINALIZED')
      :order.order_items.find(item=>!item.product_variant_id)
    )?.id??order.order_items[0]?.id??''
  )
  const router=useRouter()
  const [drafts,setDrafts]=useState<Record<string,Draft>>({})
  const [choices,setChoices]=useState<Record<string,Choice>>(()=>{
    const saved:Record<string,Choice>={}
    for(const item of order.order_items){
      const record=itemDecisions[item.id]
      if(!record)continue
      const variant=variants.find(v=>v.id===record.product_variant_id)
      saved[item.id]={
        action:record.decision,
        sku:record.decision==='SKIP'&&!record.product_variant_id?'Bỏ qua kho (không ghép SKU)':
          variant?.products?.sku??item.product_variants?.products?.sku??'Đã ghép SKU',
        price:String(record.sale_price),multiplier:Number(record.multiplier),
        quantity:Number(item.quantity)*Number(record.multiplier),
        reason:record.skip_reason??undefined
      }
    }
    return saved
  })
  const [busy,setBusy]=useState(false)
  const [confirmFinalize,setConfirmFinalize]=useState(false)
  const [liveStatus,setLiveStatus]=useState<string|null>(null)
  const [notice,setNotice]=useState('')
  const [toast,setToast]=useState('')
  const [showSummary,setShowSummary]=useState(false)
  const [copied,setCopied]=useState(false)
  const processed=handled.has(liveStatus??order.warehouse_status??'')
  const isReadOnly=previewOnly&&!simulate
  const selected=order.order_items.find(item=>item.id===focusedId)??null
  const draft=selected?(drafts[selected.id]??initialDraft(selected,itemDecisions[selected.id])):null
  const selectedVariant=draft
    ?variants.find(variant=>variant.id===draft.variantId)??(selected?.product_variants?.id===draft.variantId?selected.product_variants:null)
    :null
  const availableProducts=skuProducts.length?skuProducts:
    [...new Map(variants.filter(v=>v.products?.id).map(v=>[v.products!.id!,{
      id:v.products!.id!,sku:String(v.products?.sku??''),name:String(v.products?.name??'')
    }])).values()]
  const variantProduct=availableProducts.find(p=>p.id===draft?.productId)
  const duplicatedClassification=!!variantProduct&&variants.some(v=>
    v.products?.id===variantProduct.id&&
    v.variant_name.trim().toLocaleLowerCase('vi')===
      String(draft?.newVariant??'').trim().toLocaleLowerCase('vi'))
  const suggestionOptions=selected?(suggestions[selected.id]??[]):[]
  const countSaved=order.order_items.filter(item=>!!item.product_variant_id||(!simulate&&!!choices[item.id])).length
  const totalChoices=Object.keys(choices).length
  const activeShipment=order.shipments?.find(s=>s.is_active)??order.shipments?.[0]??null
  const warehouse=batchOf(order)?.warehouses
  const selectedSkuId=selectedVariant?.products?.id||draft?.productId||''
  const selectedSkuProduct=availableProducts.find(p=>p.id===selectedSkuId)
  const skuProductLetters=[...new Set(availableProducts.map(p=>
    normalizeSku(p.sku).charAt(0)||'#'))].sort((a,b)=>a.localeCompare(b,'en'))
  const matchingSkuProducts=availableProducts.filter(p=>
    (skuLetter==='Tất cả'||(normalizeSku(p.sku).charAt(0)||'#')===skuLetter)&&
    normalizeSku([p.sku,p.name].join(' ')).includes(normalizeSku(draft?.query??'')))
    .sort((a,b)=>normalizeSku(a.sku).localeCompare(normalizeSku(b.sku),'en'))
    .slice(0,80)
  const matchVariants=variants.filter(v=>v.products?.id===selectedSkuId)
    .sort((a,b)=>a.variant_name.localeCompare(b.variant_name,'vi'))
  const logs=auditLogs.filter(log=>String(log.entity_id??'')===order.id||
    order.order_items.some(item=>item.id===String(log.entity_id??'')))

  useEffect(()=>{
    if(!toast)return
    const timer=window.setTimeout(()=>setToast(''),5000)
    return ()=>window.clearTimeout(timer)
  },[toast])
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    window.addEventListener('keydown',escape)
    return ()=>window.removeEventListener('keydown',escape)
  },[onClose])

  function focus(item:Item){
    setSkuBrowseOpen(false)
    setFocusedId(item.id)
    setNotice('')
    setShowSummary(false)
  }
  function change(patch:Partial<Draft>){
    if(!selected)return
    setDrafts(current=>({
      ...current,[selected.id]:{...(current[selected.id]??initialDraft(selected,itemDecisions[selected.id])),...patch}
    }))
    setNotice('')
  }
  function chooseVariant(id:string){
    const variant=variants.find(v=>v.id===id)
    change({variantId:id,productId:variant?.products?.id??'',salePrice:variant?.sale_price===null||variant?.sale_price===undefined
      ?'':String(variant.sale_price)})
  }
  function applySuggestion(suggestion:Suggestion){
    const variant=variants.find(v=>v.id===suggestion.variant_id)
    if(!variant){setNotice('SKU gợi ý không còn trong danh mục. Hãy chọn SKU khác.');return}
    const multiplier=Number(suggestion.multiplier)
    setSkuBrowseOpen(false)
    change({mode:'existing',productId:variant.products?.id??'',variantId:variant.id,
      salePrice:variant.sale_price===null||variant.sale_price===undefined?'':String(variant.sale_price),
      multiplier:Number.isInteger(multiplier)&&multiplier>0?String(multiplier):'1'})
    setNotice('Đã chọn gợi ý để đối chiếu. Chưa lưu SKU hoặc nhập kho.')
  }
  async function recordChoice(){
    if(!selected||!draft||processed||isReadOnly||busy)return
    if(draft.mode==='existing'&&!selectedVariant){
      setNotice('Vui lòng chọn SKU bán có sẵn trước khi ghi nhận.');return
    }
    if(draft.mode==='variant'&&(!variantProduct||!draft.newVariant.trim()||draft.newVariant.trim().length>255)){
      setNotice('Chọn SKU đã có và nhập phân loại bán mới.');return
    }
    if(draft.mode==='variant'&&duplicatedClassification){
      setNotice('Phân loại này đã tồn tại trong SKU. Hãy chọn phân loại có sẵn.');return
    }
    if(draft.mode==='new'&&(!draft.newSku.trim()||!draft.newName.trim()||!draft.newVariant.trim())){
      setNotice('Nhập đủ mã SKU, tên sản phẩm và phân loại để tạo SKU mới.');return
    }
    if(draft.mode==='new'&&variants.some(v=>String(v.products?.sku??'').toUpperCase()===draft.newSku.trim().toUpperCase())){
      setNotice('Mã SKU đã tồn tại trong danh mục. Hãy chọn SKU có sẵn.');return
    }
    const price=Number(draft.salePrice)
    if(draft.salePrice===''||!Number.isFinite(price)||price<0){
      setNotice('Giá bán phải là số không âm.');return
    }
    const multiplier=Number(draft.multiplier)
    if(!Number.isInteger(multiplier)||multiplier<=0){
      setNotice('Hệ số quy đổi phải là số nguyên lớn hơn 0.');return
    }
    if(draft.decision==='SKIP'&&!draft.reason.trim()){
      setNotice('Cần nhập lý do cho sản phẩm Bỏ qua kho.');return
    }
    const sku=draft.mode==='existing'?(selectedVariant?.products?.sku??'Chưa có mã SKU'):
      draft.mode==='variant'?(variantProduct?.sku??'Chưa có mã SKU'):draft.newSku.trim().toUpperCase()
    const nextChoice:Choice={
      action:draft.decision,sku,price:draft.salePrice,multiplier,
      quantity:Number(selected.quantity)*multiplier,
      reason:draft.decision==='SKIP'?draft.reason.trim():undefined
    }
    if(simulate){
      setChoices(current=>({...current,[selected.id]:nextChoice}))
      setNotice('Đã ghi nhận lựa chọn thử. Không ghi SKU, giá hoặc tồn kho vào Supabase.')
      return
    }
    setBusy(true)
    try{
      const result=draft.mode==='variant'
        ?await addWarehouseVariantAndMap({
          orderItemId:selected.id,productId:variantProduct!.id,
          variantName:draft.newVariant.trim(),salePrice:price,multiplier,
          decision:draft.decision,skipReason:draft.decision==='SKIP'?draft.reason.trim():null
        })
        :await saveWarehouseItemDecision({
          orderItemId:selected.id,
          variantId:draft.mode==='existing'?selectedVariant?.id??null:null,
          newSku:draft.mode==='new'?draft.newSku.trim():null,
          newName:draft.mode==='new'?draft.newName.trim():null,
          newVariant:draft.mode==='new'?draft.newVariant.trim():null,
          salePrice:price,multiplier,decision:draft.decision,
          skipReason:draft.decision==='SKIP'?draft.reason.trim():null
        })
      setChoices(current=>({...current,[selected.id]:nextChoice}))
      setDrafts(current=>({...current,
        [selected.id]:{...draft,mode:'existing',variantId:result.product_variant_id}
      }))
      setNotice('')
      setToast('Đã lưu SKU, giá và quyết định kho. Chưa ghi tăng tồn kho.')
      router.refresh()
    }catch(error){
      setNotice(error instanceof Error?error.message:'Không thể lưu bóc tách')
    }finally{setBusy(false)}
  }

  async function finalizeOrder(){
    if(processed||previewOnly||simulate||busy)return
    setBusy(true)
    try{
      const result=await finalizeWarehouseItemDecisions(order.id)
      setLiveStatus(result.warehouse_status)
      setConfirmFinalize(false)
      setNotice('')
      setToast('Đã chốt xử lý kho. Tồn kho và lịch sử đã được cập nhật.')
      router.refresh()
    }catch(error){
      setNotice(error instanceof Error?error.message:'Không thể chốt xử lý kho')
    }finally{setBusy(false)}
  }

  const express=order.shipping_service==='EXPRESS'
  const value=resolveOrderValue({
    paymentStatus:order.payment_status,prepaidAmount:order.prepaid_amount,cod:order.cod
  })
  const voucherText=(order.order_vouchers??[]).map(v=>
    String(v.voucher_tag||v.voucher_type||v.voucher_name||v.voucher_code||'').trim()
  ).filter(Boolean).join(' · ')

  return <aside className="whx-detail-panel warehouse-intake-panel warehouse-detail-v2 mynh-slide-panel" data-system-slidebar="true"
    aria-label={'Bóc tách đơn '+(order.shopee_order_id??order.id)}>
    {toast&&<div className="warehouse-detail-v2-toast" role="status" aria-live="polite">
      <span>{toast}</span><button type="button" aria-label="Đóng thông báo" onClick={()=>setToast('')}>×</button>
    </div>}
    <header className="whx-panel-head warehouse-detail-v2-head">
      <div className="warehouse-detail-v2-title">
        <span className="module-eyebrow">CHI TIẾT BÓC TÁCH · KHO {warehouse?.code??'CHƯA XÁC ĐỊNH'}</span>
        <div className="warehouse-detail-v2-order">
          <h2>{order.shopee_order_id??order.id.slice(0,8)}</h2>
          <button type="button" className="warehouse-detail-v2-copy" title="Sao chép mã đơn"
            aria-label="Sao chép mã đơn" onClick={async()=>{
              try{await navigator.clipboard.writeText(order.shopee_order_id??order.id);setCopied(true)}
              catch{setNotice('Không sao chép được mã đơn.')}
            }}>{copied?'Đã chép':'⧉'}</button>
        </div>
      </div>
      <button className="close" type="button" onClick={onClose} aria-label="Đóng slidebar">×</button>
    </header>
    <div className="context-stack-breadcrumb warehouse-detail-v2-meta">
      <span>{batchOf(order)?.received_at?formatDateTime(batchOf(order)?.received_at):'Chưa có ngày nhận'}</span>
      <i>›</i><b>{order.order_items.length} sản phẩm</b><i>›</i><strong>{stateLabel(order)}</strong>
    </div>
    <nav className="panel-tabs warehouse-detail-v2-tabs" aria-label="Các tab chi tiết bóc tách" role="tablist">
      <button type="button" role="tab" aria-selected={tab==='products'} className={tab==='products'?'active':''} onClick={()=>setTab('products')}>Sản phẩm</button>
      <button type="button" role="tab" aria-selected={tab==='info'} className={tab==='info'?'active':''} onClick={()=>setTab('info')}>Thông tin đơn</button>
      <button type="button" role="tab" aria-selected={tab==='history'} className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử</button>
    </nav>
    <div className="panel-scroll whx-panel-scroll warehouse-detail-v2-scroll">
      {tab==='products'&&<div className="warehouse-detail-v2-content">
        <div className="warehouse-detail-v2-progress">
          <b>{countSaved}/{order.order_items.length} đã có quyết định SKU/kho</b>
          {!processed&&<span>{totalChoices} {simulate?'lựa chọn dự kiến':'quyết định đang lưu'}</span>}
        </div>
        <div className="warehouse-detail-v2-products">
          {order.order_items.map((item,index)=><button type="button" key={item.id}
            className={'warehouse-detail-v2-product '+(item.id===focusedId?'active':'')}
            onClick={()=>focus(item)}>
            <span className="warehouse-detail-v2-product-main">
              <b title={item.product_name}>{index+1}. {item.product_name}</b>
              <small>SL {item.quantity} · {item.sku||'Chưa có SKU mua'}</small>
            </span>
            <span className={'warehouse-detail-v2-product-state '+(choices[item.id]
              ?(choices[item.id].action==='IN'?'state-in':'state-skip')
              :item.product_variant_id?'state-mapped':'state-unmapped')}>
              {processed&&itemDecisions[item.id]?.decision==='IN'?'Đã nhập kho':
                processed&&itemDecisions[item.id]?.decision==='SKIP'?'Đã bỏ qua kho':
                choices[item.id]?(choices[item.id].action==='IN'?(simulate?'Dự kiến nhập':'Đã chọn nhập'):(simulate?'Dự kiến bỏ':'Đã chọn bỏ'))
                :item.product_variant_id?'Đã ghép SKU':'Chưa bóc tách'}
            </span>
          </button>)}
        </div>
        {selected&&draft&&<section className="warehouse-detail-v2-editor" aria-label="Bóc tách sản phẩm đang chọn">
          <div className="warehouse-detail-v2-section-title">Đối chiếu giá mua</div>
          <div className="warehouse-detail-v2-prices">
            <div><span>Giá gốc/SP</span><b>{displayMoney(selected.original_price)}</b></div>
            <div><span>Sau giảm/SP</span><b>{displayMoney(selected.final_price)}</b></div>
            <div><span>Số lượng</span><b>{selected.quantity}</b></div>
          </div>
          <p className="warehouse-detail-v2-source">{selected.product_name} · {selected.variant||'Mặc định'}</p>
          {processed&&<div className="warehouse-detail-v2-processed" role="status">
            Đơn đã chốt kho. Chọn chỉnh sửa SKU bên dưới để đối soát và lập bút toán điều chỉnh; không nhập kho lại.
          </div>}
          {processed&&canCorrectFinalizedSku&&
            itemDecisions[selected.id]?.processing_state==='FINALIZED'&&
            <WarehouseReceivedSkuCorrection key={selected.id}
              orderItemId={selected.id}
              previousVariantId={itemDecisions[selected.id].decision==='IN'
                ?itemDecisions[selected.id].product_variant_id:null}
              previousMultiplier={Number(itemDecisions[selected.id].multiplier??1)}
              products={skuProducts} variants={variants}
              previewOnly={previewOnly||simulate}
              onSuccess={result=>{
                const target=variants.find(v=>v.id===result.targetVariantId)
                setChoices(current=>({...current,[selected.id]:{
                  action:'IN',sku:target?.products?.sku??'SKU đã sửa',
                  price:String(target?.sale_price??0),multiplier:result.multiplier,
                  quantity:Number(selected.quantity)*result.multiplier
                }}))
                setLiveStatus(result.warehouse_status)
                setToast('Đã điều chỉnh SKU và tồn kho, có nhật ký đối soát.')
                router.refresh()
              }}/>}
          {processed&&canCorrectFinalizedSku&&itemDecisions[selected.id]?.processing_state!=='FINALIZED'&&
            <p className="warehouse-detail-v2-source">Sản phẩm này là dữ liệu xử lý lịch sử, chưa có quyết định SKU V2. Cần đối soát riêng trước khi cho phép chỉnh sửa tồn.</p>}
          {processed&&!canCorrectFinalizedSku&&
            <p className="warehouse-detail-v2-source">Chức năng chỉnh sửa sau nhập kho chưa mở cho tài khoản hoặc môi trường này.</p>}
          {!processed&&<>
          <div className="warehouse-detail-v2-section-title">Ghép SKU bán và quyết định giá</div>
          <div className="warehouse-detail-v2-switch">
            <button type="button" disabled={processed||isReadOnly||busy}
              className={draft.mode!=='new'?'active':''}
              onClick={()=>{
                setSkuBrowseOpen(false)
                change({mode:'existing',newVariant:'',variantId:draft.mode==='variant'?'':draft.variantId,
                  salePrice:draft.mode==='variant'?'':draft.salePrice})
              }}>Chọn SKU có sẵn</button>
            <button type="button" disabled={processed||isReadOnly||busy} className={draft.mode==='new'?'active':''}
              onClick={()=>change({mode:'new',variantId:'',salePrice:'',multiplier:'1'})}>Tạo SKU mới</button>
          </div>
          {draft.mode==='existing'?<div className="warehouse-detail-v2-fields">
            <div className="warehouse-detail-v2-browser" aria-label="Chọn SKU bán theo ABC">
              <div className="warehouse-sku-step-caption">Bước 1 · Chọn SKU sản phẩm</div>
              {selectedSkuProduct&&!skuBrowseOpen?
                <div className="warehouse-detail-v2-product-selected" aria-label="SKU sản phẩm đã chọn">
                  <span className="warehouse-detail-v2-product-summary">
                    <b>{selectedSkuProduct.sku}</b><small>{selectedSkuProduct.name}</small>
                  </span>
                  <button type="button" disabled={processed||isReadOnly||busy}
                    aria-label="Đổi SKU sản phẩm" onClick={()=>{setSkuBrowseOpen(true);change({variantId:'',salePrice:''})}}>Đổi SKU</button>
                </div>:
                <>
                  <label className="warehouse-detail-v2-field"><span>Tìm SKU theo mã hoặc tên</span>
                    <input type="search" aria-label="Tìm SKU theo mã hoặc tên"
                      placeholder="Tìm SKU sản phẩm…" disabled={processed||isReadOnly||busy}
                      value={draft.query} onChange={e=>change({query:e.target.value})}/>
                  </label>
                  <div className="warehouse-detail-v2-abc" role="group" aria-label="Lọc chữ cái SKU bán">
                    {['Tất cả',...skuProductLetters].map(letter=><button type="button" key={letter}
                      aria-pressed={skuLetter===letter} className={skuLetter===letter?'active':''}
                      disabled={processed||isReadOnly||busy} onClick={()=>setSkuLetter(letter)}>{letter}</button>)}
                  </div>
                  <div className="warehouse-detail-v2-sku-results warehouse-detail-v2-product-results"
                    role="group" aria-label="Danh sách SKU sản phẩm">
                    {matchingSkuProducts.map(p=><button type="button" key={p.id}
                      aria-pressed={selectedSkuId===p.id} className={selectedSkuId===p.id?'active':''}
                      disabled={processed||isReadOnly||busy}
                      onClick={()=>{change({productId:p.id,variantId:'',salePrice:'',query:'',multiplier:'1'});setSkuBrowseOpen(false)}}>
                      <b>{p.sku}</b><span>{p.name}</span>
                      {suggestionOptions.some(o=>variants.some(v=>v.id===o.variant_id&&v.products?.id===p.id))&&
                        <small>Đã có gợi ý ghép từ lịch sử</small>}
                    </button>)}
                    {matchingSkuProducts.length===0&&<small>Không tìm thấy SKU sản phẩm.</small>}
                  </div>
                </>}
              {selectedSkuProduct&&!skuBrowseOpen&&<>
                <div className="warehouse-sku-step-caption">Bước 2 · Chọn phân loại của {selectedSkuProduct.sku}</div>
                <div className="warehouse-detail-v2-sku-results warehouse-detail-v2-classification-results"
                  role="group" aria-label="Phân loại của SKU đã chọn">
                  {matchVariants.map(v=>{
                    const history=suggestionOptions.find(option=>option.variant_id===v.id)
                    return <button key={v.id} type="button"
                      className={draft.variantId===v.id?'active':''} aria-pressed={draft.variantId===v.id}
                      disabled={processed||isReadOnly||busy}
                      onClick={()=>history?applySuggestion(history):chooseVariant(v.id)}>
                      <b>{v.products?.sku||selectedSkuProduct.sku}</b><span>{v.variant_name}</span>
                      <small>{v.sale_price!=null?formatMoney(v.sale_price):'Chưa có giá bán'}
                        {history?' · '+history.history_count+' đơn trước đã ghép · Quy đổi ×'+history.multiplier:''}</small>
                    </button>
                  })}
                  {matchVariants.length===0&&<small>SKU này chưa có phân loại.</small>}
                </div>
                <button type="button" className="warehouse-detail-v2-add-classification"
                  disabled={processed||isReadOnly||busy}
                  onClick={()=>{
                    change({mode:'variant',productId:selectedSkuId,
                      variantId:'',newVariant:'',salePrice:'',multiplier:'1'})
                  }}>+ Thêm phân loại mới</button>
              </>}
            </div>
          </div>:draft.mode==='variant'&&variantProduct?<div className="warehouse-detail-v2-fields warehouse-detail-v2-pair">
            <div className="warehouse-sku-step-caption warehouse-detail-v2-full">Bước 1 · SKU sản phẩm đã chọn</div>
            <div className="warehouse-detail-v2-product-selected warehouse-detail-v2-full" aria-label="SKU sản phẩm đã chọn">
              <span className="warehouse-detail-v2-product-summary">
                <b>{variantProduct.sku}</b><small title={variantProduct.name}>{variantProduct.name}</small>
              </span>
              <button type="button" disabled={processed||isReadOnly||busy}
                aria-label="Đổi SKU sản phẩm" onClick={()=>{
                  setSkuBrowseOpen(true)
                  change({mode:'existing',productId:'',variantId:'',newVariant:'',salePrice:'',multiplier:'1'})
                }}>Đổi SKU</button>
            </div>
            <div className="warehouse-detail-v2-classification-actions warehouse-detail-v2-full">
              <span className="warehouse-sku-step-caption">Bước 2 · Thêm phân loại mới</span>
              <button type="button" disabled={processed||isReadOnly||busy}
                onClick={()=>change({mode:'existing',variantId:'',newVariant:'',salePrice:''})}>
                Chọn phân loại có sẵn
              </button>
            </div>
            <label className="warehouse-detail-v2-field warehouse-detail-v2-full"><span>Phân loại mới</span>
              <input aria-label="Nhập phân loại mới của SKU cũ" disabled={processed||isReadOnly||busy}
                maxLength={255} value={draft.newVariant} placeholder="Ví dụ: Đỏ / Size M"
                onChange={e=>change({newVariant:e.target.value})}/>
              {duplicatedClassification&&<small role="alert">Phân loại đã tồn tại, hãy chọn phân loại có sẵn.</small>}
            </label>
          </div>:<div className="warehouse-detail-v2-fields warehouse-detail-v2-pair">
            <label className="warehouse-detail-v2-field"><span>Mã SKU bán mới</span>
              <input disabled={processed||isReadOnly||busy} value={draft.newSku} onChange={e=>change({newSku:e.target.value})} placeholder="Ví dụ: SKU-001"/>
            </label>
            <label className="warehouse-detail-v2-field"><span>Tên sản phẩm</span>
              <input disabled={processed||isReadOnly||busy} value={draft.newName} onChange={e=>change({newName:e.target.value})}/>
            </label>
            <label className="warehouse-detail-v2-field warehouse-detail-v2-full"><span>Phân loại</span>
              <input disabled={processed||isReadOnly||busy} value={draft.newVariant} onChange={e=>change({newVariant:e.target.value})}/>
            </label>
          </div>}
          {(draft.mode==='new'||draft.mode==='variant'&&!!variantProduct||draft.mode==='existing'&&!!selectedVariant)&&<div className="warehouse-detail-v2-pair warehouse-detail-v2-numeric">
            <label className="warehouse-detail-v2-field"><span>Giá bán (sửa được)</span>
              <input type="number" disabled={processed||isReadOnly||busy} min="0" step="1" value={draft.salePrice}
                onChange={e=>change({salePrice:e.target.value})}/>
            </label>
            <label className="warehouse-detail-v2-field"><span>Hệ số quy đổi</span>
              <input type="number" disabled={processed||isReadOnly||busy} min="1" step="1" value={draft.multiplier}
                onChange={e=>change({multiplier:e.target.value})}/>
            </label>
          </div>}
          {(draft.mode==='new'||draft.mode==='variant'&&!!variantProduct||draft.mode==='existing'&&!!selectedVariant)&&<div className="warehouse-detail-v2-conversion">Số lượng nhập dự kiến:
            <b>{Number.isInteger(Number(draft.multiplier))&&Number(draft.multiplier)>0
              ?Number(selected.quantity)*Number(draft.multiplier):'—'}</b>
          </div>}
          {(draft.mode==='new'||draft.mode==='variant'&&!!variantProduct||draft.mode==='existing'&&!!selectedVariant)&&<div className="warehouse-detail-v2-section-title">Quyết định kho theo sản phẩm</div>}
          {(draft.mode==='new'||draft.mode==='variant'&&!!variantProduct||draft.mode==='existing'&&!!selectedVariant)&&<div className="warehouse-detail-v2-switch warehouse-detail-v2-decisions">
            <button type="button" disabled={processed||isReadOnly||busy} className={draft.decision==='IN'?'active':''}
              onClick={()=>change({decision:'IN',reason:''})}>Nhập kho</button>
            <button type="button" disabled={processed||isReadOnly||busy} className={draft.decision==='SKIP'?'active':''}
              onClick={()=>change({decision:'SKIP'})}>Bỏ qua kho</button>
          </div>}
          {draft.decision==='SKIP'&&<label className="warehouse-detail-v2-field"><span>Lý do bỏ qua kho (bắt buộc)</span>
            <textarea rows={2} disabled={processed||isReadOnly||busy} value={draft.reason}
              onChange={e=>change({reason:e.target.value})} placeholder="Nhập lý do bỏ qua"/>
          </label>}
          {notice&&<div className="warehouse-detail-v2-notice" role="status">{notice}</div>}
          {(draft.mode==='new'||draft.mode==='variant'&&!!variantProduct||draft.mode==='existing'&&!!selectedVariant)&&<button type="button" className="button primary warehouse-detail-v2-record"
            onClick={recordChoice} disabled={processed||isReadOnly||busy}>
            {busy?'Đang xử lý…':simulate?'Ghi nhận lựa chọn thử':'Lưu bóc tách và quyết định'}
          </button>}
          <p className="warehouse-detail-v2-disclaimer">
            {simulate?'Chỉ mô phỏng · không tạo SKU hoặc ghi tồn kho vào Supabase'
              :isReadOnly?'Bạn không có quyền chỉnh sửa kho'
              :'Lưu bóc tách chưa nhập tồn. Nhấn Chốt xử lý kho sau khi hoàn tất tất cả sản phẩm.'}
          </p>
          </>}
        </section>}
      </div>}
      {tab==='info'&&<div className="warehouse-detail-v2-content warehouse-detail-v2-order-info">
        <div className="panel-section-head"><div><h3>Chi tiết đơn hàng</h3><span>Thông tin lấy từ đơn nhập hàng hiện có</span></div></div>
        <div className="detail-grid compact-detail-grid">
          <div><span>User</span><b>{order.erp_users?.username??'Chưa có'}</b></div>
          <div><span>Ngày đặt</span><b>{order.order_date?formatDateTime(order.order_date):'Chưa có'}</b></div>
          <div><span>Trạng thái đơn</span><b>{statusLabel(order.order_status)}</b></div>
          <div><span>Thanh toán</span><b>{statusLabel(order.payment_status)}</b></div>
          {order.prepaid_amount!=null&&<>
            <div><span>Đã thanh toán trước</span><b>{displayMoney(order.prepaid_amount)}</b></div>
            <div><span>Loại tài khoản/thẻ</span><b>{prepaidSourceLabel(order.prepaid_source_type)}</b></div>
            {order.prepaid_source_label&&<div className="full"><span>Tài khoản/thẻ sử dụng</span><b>{order.prepaid_source_label}</b></div>}
          </>}
          <div><span>COD</span><b>{displayMoney(order.cod)}</b></div>
          <div><span>Giá trị đơn hàng</span><b>{value===null?'Chưa đủ dữ liệu':formatMoney(value)}</b></div>
          <div><span>Tổng giá gốc</span><b>{displayMoney(sourceTotal(order.order_items,'original_price'))}</b></div>
          <div><span>Tổng sau giảm</span><b>{displayMoney(sourceTotal(order.order_items,'final_price'))}</b></div>
          <div><span>Dịch vụ</span><b>{express?'Hỏa tốc':order.shipping_service==='STANDARD'?'Tiêu chuẩn':order.shipping_service||'Chưa có'}</b></div>
          <div><span>Nhận hàng</span><b>{statusLabel(order.receive_status)}</b></div>
          <div><span>Người nhận</span><b>{order.recipient_name??'Chưa có'}</b></div>
          <div><span>SĐT</span><b>{order.recipient_phone?formatPhone(order.recipient_phone):'Chưa có'}</b></div>
          <div className="full"><span>Địa chỉ</span><b>{order.recipient_address??'Chưa có'}</b></div>
          <div><span>Khu vực</span><b>{order.area??'Chưa có'}</b></div>
          <div><span>Kho đích / HUB</span><b>{order.destination_hub??'Chưa có'}</b></div>
          <div><span>Mã vận đơn</span><b>{activeShipment?.tracking_number??'Chưa có'}</b></div>
          <div><span>ĐVVC</span><b>{express?'Hỏa tốc':activeShipment?.carrier??'Chưa có'}</b></div>
          <div><span>Tracking</span><b>{express?'Thủ công':statusLabel(activeShipment?.current_tracking_status)}</b></div>
          <div><span>Kho</span><b>{stateLabel(order)}</b></div>
          <div><span>Ngày nhận</span><b>{batchOf(order)?.received_at?formatDateTime(batchOf(order)?.received_at):'Chưa có'}</b></div>
          <div className="full"><span>Kho nhận thực tế</span><b>{[warehouse?.code,warehouse?.address??warehouse?.name].filter(Boolean).join(' · ')||'Chưa xác định'}</b></div>
        </div>

        <div className="panel-section-head"><div><h3>Sản phẩm</h3><span>{order.order_items.length} dòng sản phẩm</span></div></div>
        <div className="context-order-items warehouse-detail-v2-order-items">
          {!order.order_items.length
            ?<div className="empty compact">Đơn chưa có sản phẩm.</div>
            :order.order_items.map(item=><div key={item.id}>
                <span><button type="button" className="warehouse-detail-v2-product-link"
                  onClick={()=>{focus(item);setTab('products')}} aria-label={'Bóc tách '+item.product_name}>
                  <b title={item.product_name}>{item.product_name}</b>
                  <small>{[item.sku,item.variant].filter(Boolean).join(' · ')||'Không SKU'}</small>
                </button></span>
                <span>×{item.quantity}</span>
                <strong>{displayMoney(item.final_price??item.original_price)}</strong>
              </div>)}
        </div>

        {voucherText&&<>
          <div className="panel-section-head"><div><h3>Voucher</h3></div></div>
          <VoucherTags value={voucherText}/>
        </>}
        <div className="panel-meta">Tạo đơn: {order.created_at?formatDateTime(order.created_at):'Chưa có'}</div>
      </div>}
      {tab==='history'&&<div className="warehouse-detail-v2-content">
        <div className="warehouse-detail-v2-section-title">Lịch sử xử lý kho</div>
        {logs.length?logs.map(log=><div className="warehouse-detail-v2-log" key={log.id}>
          <b>{actionLabel(log.action)}</b><time>{formatDateTime(log.created_at)}</time>
          {log.action==='MAP_INVENTORY_SKU'&&log.new_value&&
            <small>SKU đã ghép · Hệ số quy đổi: {String(log.new_value.inventory_multiplier??'Chưa có')}</small>}
          {['SAVE_ITEM_DECISION','FINALIZE_ITEM_DECISION'].includes(log.action)&&log.new_value&&
            <small>
              {String(log.new_value.order_item_id??'')}
              {' · '}{log.new_value.decision==='IN'?'Nhập kho':'Bỏ qua kho'}
              {' · '}SL {String(log.new_value.quantity??'Chưa có')}
              {' · '}Giá {displayMoney(log.new_value.sale_price as number|string|null)}
              {log.new_value.skip_reason?' · Lý do: '+String(log.new_value.skip_reason):''}
            </small>}
          {log.action==='FINALIZE_ORDER_WAREHOUSE'&&log.new_value&&
            <small>Nhập {String(log.new_value.in_items??0)} sản phẩm · Bỏ qua {String(log.new_value.skip_items??0)} sản phẩm</small>}
          {log.action==='CORRECT_RECEIVED_SKU'&&log.new_value&&
            <small>Đổi SKU sang {String(log.new_value.target_variant_id??'')}
              {' · '}SL {String(log.new_value.quantity_removed??0)} → {String(log.new_value.quantity_added??0)}
              {' · '}Lý do: {String(log.new_value.reason??'')}</small>}
        </div>):<div className="empty compact">Chưa có lịch sử bóc tách của đơn.</div>}
      </div>}
    </div>
    <footer className="warehouse-detail-v2-footer">
      {processed?<p>{canCorrectFinalizedSku?'Đơn đã chốt. Chọn sản phẩm phía trên để chỉnh sửa SKU có đối soát và xem lịch sử.':'Đơn đã chốt. Dữ liệu chỉ đọc khi chưa được mở quyền điều chỉnh.'}</p>:<>
      {showSummary&&<div className="warehouse-detail-v2-summary" aria-label="Các lựa chọn dự kiến">
        <b>{simulate?'Danh sách lựa chọn dự kiến':'Danh sách quyết định kho'} ({totalChoices}/{order.order_items.length})</b>
        {order.order_items.map(item=><div key={item.id}>
          <span>{item.product_name}</span>
          <strong>{choices[item.id]?(choices[item.id].action==='IN'?'Nhập kho':'Bỏ qua kho')+' · '+choices[item.id].sku+' · SL '+choices[item.id].quantity:'Chưa chọn'}</strong>
          {choices[item.id]?.reason&&<small>Lý do: {choices[item.id].reason}</small>}
        </div>)}
      </div>}
      <div className="warehouse-detail-v2-footer-actions">
        <span><b>{totalChoices}/{order.order_items.length}</b> {simulate?'lựa chọn thử':'đã lưu quyết định'}</span>
        <button type="button" className="button small" onClick={()=>setShowSummary(x=>!x)}
          aria-expanded={showSummary}>{showSummary?'Thu gọn':simulate?'Xem lựa chọn dự kiến':'Xem quyết định kho'}</button>
      </div>
      {!simulate&&!isReadOnly&&!processed&&totalChoices===order.order_items.length&&order.order_items.length>0&&
        (confirmFinalize?<div className="warehouse-detail-v2-confirm">
          <p>Chốt xử lý cả đơn theo các quyết định đã lưu? Chỉ sản phẩm chọn Nhập kho được ghi tăng tồn.</p>
          <button type="button" className="button primary small" disabled={busy} onClick={finalizeOrder}>Xác nhận ghi tồn kho</button>
          <button type="button" className="button small" disabled={busy} onClick={()=>setConfirmFinalize(false)}>Hủy</button>
        </div>:<button type="button" className="button primary small" onClick={()=>{setShowSummary(true);setConfirmFinalize(true)}}>
          Chốt xử lý kho
        </button>)}
      <p>{simulate?'Preview chỉ mô phỏng, chưa ghi dữ liệu kho':
        processed?'Đơn đã được xử lý kho. Không nhập lại.':
        isReadOnly?'Chỉ xem · không có quyền xử lý kho.':
        'Lưu từng sản phẩm trước, sau đó xác nhận chốt kho một lần.'}</p>
      </>}
    </footer>
  </aside>
}
