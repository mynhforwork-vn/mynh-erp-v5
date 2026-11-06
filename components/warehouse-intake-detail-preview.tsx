'use client'

import {useEffect,useMemo,useState} from 'react'
import {formatDateTime,formatMoney,formatPhone,statusLabel} from '@/lib/format'
import {prepaidSourceLabel,resolveOrderValue} from '@/lib/order-prepaid'
import {VoucherTags} from '@/components/voucher-tags'

type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{sku?:string|null,name?:string|null}|null
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
type Suggestion={
  variant_id:string
  sku?:string|null
  product_name?:string|null
  variant_name?:string|null
  multiplier:number
}
type Mode='existing'|'new'
type Decision='IN'|'SKIP'
type Draft={
  mode:Mode
  variantId:string
  query:string
  salePrice:string
  newSku:string
  newName:string
  newVariant:string
  multiplier:string
  decision:Decision
  reason:string
}
type Choice={action:Decision,sku:string,price:string,multiplier:number,quantity:number,reason?:string}
type Tab='products'|'info'|'history'

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
  return 'Thao tác kho'
}
function initialDraft(item:Item):Draft{
  return {
    mode:'existing',variantId:item.product_variant_id??'',query:'',
    salePrice:item.product_variants?.sale_price===null||item.product_variants?.sale_price===undefined
      ?'':String(item.product_variants.sale_price),
    newSku:'',newName:item.product_name,newVariant:item.variant??'Mặc định',
    multiplier:String(item.inventory_multiplier??1),decision:'IN',reason:'',
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
  order,variants,auditLogs,suggestions,onClose
}:{
  order:Order
  variants:Variant[]
  auditLogs:Audit[]
  suggestions:Record<string,Suggestion>
  onClose:()=>void
}){
  const [tab,setTab]=useState<Tab>('products')
  const [focusedId,setFocusedId]=useState<string>(
    order.order_items.find(item=>!item.product_variant_id)?.id??order.order_items[0]?.id??''
  )
  const [drafts,setDrafts]=useState<Record<string,Draft>>({})
  const [choices,setChoices]=useState<Record<string,Choice>>({})
  const [notice,setNotice]=useState('')
  const [showSummary,setShowSummary]=useState(false)
  const [copied,setCopied]=useState(false)
  const processed=handled.has(order.warehouse_status??'')
  const selected=order.order_items.find(item=>item.id===focusedId)??null
  const draft=selected?(drafts[selected.id]??initialDraft(selected)):null
  const selectedVariant=draft
    ?variants.find(variant=>variant.id===draft.variantId)??(selected?.product_variants?.id===draft.variantId?selected.product_variants:null)
    :null
  const suggestion=selected?suggestions[selected.id]:null
  const countSaved=order.order_items.filter(item=>!!item.product_variant_id).length
  const totalChoices=Object.keys(choices).length
  const activeShipment=order.shipments?.find(s=>s.is_active)??order.shipments?.[0]??null
  const warehouse=batchOf(order)?.warehouses
  const matchVariants=useMemo(()=>{
    const query=(draft?.query??'').trim().toLocaleLowerCase('vi')
    if(!query)return variants.slice(0,30)
    return variants.filter(variant=>
      [variant.products?.sku,variant.products?.name,variant.variant_name]
        .filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(query)
    ).slice(0,80)
  },[draft?.query,variants])
  const logs=auditLogs.filter(log=>String(log.entity_id??'')===order.id)

  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    window.addEventListener('keydown',escape)
    return ()=>window.removeEventListener('keydown',escape)
  },[onClose])

  function focus(item:Item){
    setFocusedId(item.id)
    setNotice('')
    setShowSummary(false)
  }
  function change(patch:Partial<Draft>){
    if(!selected)return
    setDrafts(current=>({
      ...current,[selected.id]:{...(current[selected.id]??initialDraft(selected)),...patch}
    }))
    setNotice('')
  }
  function chooseVariant(id:string){
    const variant=variants.find(v=>v.id===id)
    change({variantId:id,salePrice:variant?.sale_price===null||variant?.sale_price===undefined
      ?'':String(variant.sale_price)})
  }
  function applySuggestion(){
    if(!suggestion)return
    const variant=variants.find(v=>v.id===suggestion.variant_id)
    if(!variant){setNotice('SKU gợi ý không còn trong danh mục. Hãy chọn SKU khác.');return}
    const multiplier=Number(suggestion.multiplier)
    change({mode:'existing',variantId:variant.id,
      salePrice:variant.sale_price===null||variant.sale_price===undefined?'':String(variant.sale_price),
      multiplier:Number.isInteger(multiplier)&&multiplier>0?String(multiplier):'1'})
    setNotice('Đã chọn gợi ý để đối chiếu. Chưa lưu SKU hoặc nhập kho.')
  }
  function recordChoice(){
    if(!selected||!draft||processed)return
    if(draft.mode==='existing'&&!selectedVariant){
      setNotice('Vui lòng chọn SKU bán có sẵn trước khi ghi nhận.');return
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
    const sku=draft.mode==='existing'?(selectedVariant?.products?.sku??'Chưa có mã SKU'):draft.newSku.trim().toUpperCase()
    setChoices(current=>({...current,[selected.id]:{
      action:draft.decision,sku,price:draft.salePrice,multiplier,
      quantity:Number(selected.quantity)*multiplier,
      reason:draft.decision==='SKIP'?draft.reason.trim():undefined
    }}))
    setNotice('Đã ghi nhận lựa chọn thử. Không ghi SKU, giá hoặc tồn kho vào Supabase.')
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
        <p>{batchOf(order)?.received_at?formatDateTime(batchOf(order)?.received_at):'Chưa có ngày nhận'} · {order.order_items.length} sản phẩm · {stateLabel(order)}</p>
      </div>
      <button className="close" type="button" onClick={onClose} aria-label="Đóng slidebar">×</button>
    </header>
    <nav className="panel-tabs warehouse-detail-v2-tabs" aria-label="Các tab chi tiết bóc tách" role="tablist">
      <button type="button" role="tab" aria-selected={tab==='products'} className={tab==='products'?'active':''} onClick={()=>setTab('products')}>Sản phẩm</button>
      <button type="button" role="tab" aria-selected={tab==='info'} className={tab==='info'?'active':''} onClick={()=>setTab('info')}>Thông tin đơn</button>
      <button type="button" role="tab" aria-selected={tab==='history'} className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử</button>
    </nav>
    <div className="panel-scroll whx-panel-scroll warehouse-detail-v2-scroll">
      {tab==='products'&&<div className="warehouse-detail-v2-content">
        <div className="warehouse-detail-v2-progress">
          <b>{countSaved}/{order.order_items.length} đã ghép SKU</b>
          <span>{totalChoices} lựa chọn thử</span>
        </div>
        <div className="warehouse-detail-v2-products">
          {order.order_items.map((item,index)=><button type="button" key={item.id}
            className={'warehouse-detail-v2-product '+(item.id===focusedId?'active':'')}
            onClick={()=>focus(item)}>
            <span className="warehouse-detail-v2-product-main">
              <b title={item.product_name}>{index+1}. {item.product_name}</b>
              <small>SL {item.quantity} · {item.sku||'Chưa có SKU mua'}</small>
            </span>
            <span className={'warehouse-detail-v2-product-state '+(choices[item.id]?'chosen':'')}>
              {choices[item.id]?(choices[item.id].action==='IN'?'Dự kiến nhập':'Dự kiến bỏ')
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
            Đơn đã xử lý kho. Thông tin hiển thị chỉ đọc; không thể tạo lựa chọn mới.
          </div>}
          <div className="warehouse-detail-v2-section-title">Ghép SKU bán và quyết định giá</div>
          <div className="warehouse-detail-v2-switch">
            <button type="button" disabled={processed} className={draft.mode==='existing'?'active':''}
              onClick={()=>change({mode:'existing'})}>Chọn SKU có sẵn</button>
            <button type="button" disabled={processed} className={draft.mode==='new'?'active':''}
              onClick={()=>change({mode:'new',variantId:''})}>Tạo SKU mới</button>
          </div>
          {draft.mode==='existing'?<div className="warehouse-detail-v2-fields">
            {suggestion&&<div className="warehouse-detail-v2-suggestion">
              <span>GỢI Ý TỪ LẦN BÓC TÁCH TRƯỚC</span>
              <b>{suggestion.sku||'SKU bán'} · {suggestion.product_name||''}</b>
              <small>{suggestion.variant_name||'Mặc định'} · quy đổi từng dùng ×{suggestion.multiplier}</small>
              <button type="button" onClick={applySuggestion} disabled={processed}>Chọn gợi ý</button>
            </div>}
            <label className="warehouse-detail-v2-field"><span>Tìm SKU theo mã, tên hoặc phân loại</span>
              <input type="search" aria-label="Tìm SKU theo mã, tên hoặc phân loại"
                placeholder="Tìm trong danh mục SKU" disabled={processed}
                value={draft.query} onChange={e=>change({query:e.target.value})}/>
            </label>
            <label className="warehouse-detail-v2-field"><span>Chọn SKU bán trong danh mục</span>
              <select aria-label="Chọn SKU bán" disabled={processed} value={draft.variantId}
                onChange={e=>chooseVariant(e.target.value)}>
                <option value="">— Chọn SKU bán —</option>
                {selectedVariant&&!matchVariants.some(v=>v.id===selectedVariant.id)&&
                  <option value={selectedVariant.id}>
                    {selectedVariant.products?.sku||'Chưa có mã'} · {selectedVariant.products?.name||''} · {selectedVariant.variant_name}
                  </option>}
                {matchVariants.map(v=><option value={v.id} key={v.id}>
                  {v.products?.sku||'Chưa có mã'} · {v.products?.name||''} · {v.variant_name}
                </option>)}
              </select>
              <small>{draft.query?'Tối đa 80 kết quả phù hợp':'Nhập từ khóa để tìm trong danh mục'} · Chưa xác nhận SKU</small>
            </label>
          </div>:<div className="warehouse-detail-v2-fields warehouse-detail-v2-pair">
            <label className="warehouse-detail-v2-field"><span>Mã SKU bán mới</span>
              <input disabled={processed} value={draft.newSku} onChange={e=>change({newSku:e.target.value})} placeholder="Ví dụ: SKU-001"/>
            </label>
            <label className="warehouse-detail-v2-field"><span>Tên sản phẩm</span>
              <input disabled={processed} value={draft.newName} onChange={e=>change({newName:e.target.value})}/>
            </label>
            <label className="warehouse-detail-v2-field warehouse-detail-v2-full"><span>Phân loại</span>
              <input disabled={processed} value={draft.newVariant} onChange={e=>change({newVariant:e.target.value})}/>
            </label>
          </div>}
          <div className="warehouse-detail-v2-pair warehouse-detail-v2-numeric">
            <label className="warehouse-detail-v2-field"><span>Giá bán (sửa được)</span>
              <input type="number" disabled={processed} min="0" step="1" value={draft.salePrice}
                onChange={e=>change({salePrice:e.target.value})}/>
            </label>
            <label className="warehouse-detail-v2-field"><span>Hệ số quy đổi</span>
              <input type="number" disabled={processed} min="1" step="1" value={draft.multiplier}
                onChange={e=>change({multiplier:e.target.value})}/>
            </label>
          </div>
          <div className="warehouse-detail-v2-conversion">Số lượng nhập dự kiến:
            <b>{Number.isInteger(Number(draft.multiplier))&&Number(draft.multiplier)>0
              ?Number(selected.quantity)*Number(draft.multiplier):'—'}</b>
          </div>
          <div className="warehouse-detail-v2-section-title">Quyết định kho theo sản phẩm</div>
          <div className="warehouse-detail-v2-switch warehouse-detail-v2-decisions">
            <button type="button" disabled={processed} className={draft.decision==='IN'?'active':''}
              onClick={()=>change({decision:'IN',reason:''})}>Nhập kho</button>
            <button type="button" disabled={processed} className={draft.decision==='SKIP'?'active':''}
              onClick={()=>change({decision:'SKIP'})}>Bỏ qua kho</button>
          </div>
          {draft.decision==='SKIP'&&<label className="warehouse-detail-v2-field"><span>Lý do bỏ qua kho (bắt buộc)</span>
            <textarea rows={2} disabled={processed} value={draft.reason}
              onChange={e=>change({reason:e.target.value})} placeholder="Nhập lý do bỏ qua"/>
          </label>}
          {notice&&<div className="warehouse-detail-v2-notice" role="status">{notice}</div>}
          <button type="button" className="button primary warehouse-detail-v2-record"
            onClick={recordChoice} disabled={processed}>Ghi nhận lựa chọn thử</button>
          <p className="warehouse-detail-v2-disclaimer">Chỉ mô phỏng · không tạo SKU hoặc ghi tồn kho vào Supabase</p>
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
                <button type="button" className="warehouse-detail-v2-product-link"
                  onClick={()=>{focus(item);setTab('products')}} aria-label={'Bóc tách '+item.product_name}>
                  <b title={item.product_name}>{item.product_name}</b>
                  <small>{[item.sku,item.variant].filter(Boolean).join(' · ')||'Không SKU'}</small>
                </button>
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
        </div>):<div className="empty compact">Chưa có lịch sử bóc tách của đơn.</div>}
      </div>}
    </div>
    <footer className="warehouse-detail-v2-footer">
      {showSummary&&<div className="warehouse-detail-v2-summary" aria-label="Các lựa chọn dự kiến">
        <b>Danh sách lựa chọn dự kiến ({totalChoices}/{order.order_items.length})</b>
        {order.order_items.map(item=><div key={item.id}>
          <span>{item.product_name}</span>
          <strong>{choices[item.id]?(choices[item.id].action==='IN'?'Nhập kho':'Bỏ qua kho')+' · '+choices[item.id].sku+' · SL '+choices[item.id].quantity:'Chưa chọn'}</strong>
          {choices[item.id]?.reason&&<small>Lý do: {choices[item.id].reason}</small>}
        </div>)}
      </div>}
      <div className="warehouse-detail-v2-footer-actions">
        <span><b>{totalChoices}/{order.order_items.length}</b> lựa chọn thử</span>
        <button type="button" className="button small" onClick={()=>setShowSummary(x=>!x)}
          aria-expanded={showSummary}>{showSummary?'Thu gọn':'Xem lựa chọn dự kiến'}</button>
      </div>
      <p>Preview chỉ mô phỏng, chưa ghi dữ liệu kho.</p>
    </footer>
  </aside>
}
