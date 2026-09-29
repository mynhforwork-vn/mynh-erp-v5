'use client'

import { useMemo, useState } from 'react'
import { createOrder, updateOrder } from '@/lib/actions/core'

type UserOption={
  id:string
  username:string
  phone?:string|null
  status?:string|null
}
type Item={
  sku?:string|null
  product_name?:string|null
  variant?:string|null
  quantity?:number|null
  original_price?:number|string|null
  final_price?:number|string|null
}
type SkuCatalogItem={
  sku:string
  product_name?:string|null
  variant?:string|null
  original_price?:number|string|null
  final_price?:number|string|null
}
type DestinationHubConfig={
  id:string
  hub_code:string
  area:string
  region:string
  province_keywords?:string[]|null
  district_keywords?:string[]|null
  address_keywords?:string[]|null
  priority?:number|null
}
type Voucher={
  voucher_code?:string|null
  voucher_name?:string|null
  voucher_type?:string|null
  voucher_tag?:string|null
  voucher_account?:string|null
}
type Values={
  id?:string
  shopee_order_id?:string|null
  erp_user_id?:string|null
  order_date_local?:string
  tracking_number?:string|null
  carrier?:string|null
  cod?:number|string|null
  order_status?:string|null
  payment_status?:string|null
  recipient_name?:string|null
  recipient_phone?:string|null
  recipient_address?:string|null
  area?:string|null
  destination_hub?:string|null
  shipping_service?:string|null
}

function emptyItem():Item{return {sku:'',product_name:'',variant:'',quantity:1,original_price:'',final_price:''}}
function emptyVoucher():Voucher{return {voucher_code:'',voucher_name:'',voucher_type:'',voucher_tag:'',voucher_account:''}}

function detectCarrier(value:string){
  const v=value.trim().toUpperCase()
  if(!v)return ''
  if(v.startsWith('SPX'))return 'SPX Express'
  if(v.startsWith('GHN'))return 'Giao Hàng Nhanh'
  if(v.startsWith('GHTK'))return 'Giao Hàng Tiết Kiệm'
  if(v.startsWith('VTP')||v.startsWith('VTPN'))return 'Viettel Post'
  if(v.startsWith('JNT')||v.startsWith('JT'))return 'J&T Express'
  return ''
}

function normalizePhone(value?:string|null){
  const s=String(value??'').trim()
  return s||'Chưa có SĐT'
}

function normalizeText(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
}

function containsKeyword(haystack:string,keywords?:string[]|null){
  if(!keywords?.length)return false
  return keywords.some(keyword=>{
    const k=normalizeText(String(keyword))
    return Boolean(k)&&haystack.includes(k)
  })
}

function parseNumberToken(value:string){
  const raw=value.replace(/[^0-9]/g,'')
  if(!raw)return ''
  const n=Number(raw)
  return Number.isFinite(n)?n:''
}

export function OrderEditorForm({
  mode,
  users,
  values={},
  initialItems=[],
  initialVouchers=[],
  cancelHref='/orders',
  returnQuery='',
  skuCatalog=[],
  voucherTypes=[],
  voucherTags=[],
  destinationHubs=[],
}:{
  mode:'create'|'edit'
  users:UserOption[]
  values?:Values
  initialItems?:Item[]
  initialVouchers?:Voucher[]
  cancelHref?:string
  returnQuery?:string
  skuCatalog?:SkuCatalogItem[]
  voucherTypes?:string[]
  voucherTags?:string[]
  destinationHubs?:DestinationHubConfig[]
}){
  const selectableUsers=useMemo(
    ()=>users.filter(u=>u.status!=='Blocked'||u.id===values.erp_user_id),
    [users,values.erp_user_id]
  )
  const initialUser=selectableUsers.find(u=>u.id===values.erp_user_id)??null
  const [selectedUserId,setSelectedUserId]=useState(values.erp_user_id??'')
  const [userQuery,setUserQuery]=useState(initialUser?.username??'')
  const [userOpen,setUserOpen]=useState(false)
  const [items,setItems]=useState<Item[]>(initialItems.length?initialItems:[emptyItem()])
  const [vouchers,setVouchers]=useState<Voucher[]>(initialVouchers.length?initialVouchers:[emptyVoucher()])
  const [trackingNumber,setTrackingNumber]=useState(String(values.tracking_number??''))
  const [carrier,setCarrier]=useState(String(values.carrier??detectCarrier(String(values.tracking_number??''))))
  const [carrierEdited,setCarrierEdited]=useState(Boolean(values.carrier))
  const [shippingService,setShippingService]=useState(values.shipping_service==='EXPRESS'?'EXPRESS':'STANDARD')
  const [recipientAddress,setRecipientAddress]=useState(String(values.recipient_address??''))
  const [destinationHub,setDestinationHub]=useState(String(values.destination_hub??''))
  const [derivedArea,setDerivedArea]=useState(String(values.area??''))
  const [derivedRegion,setDerivedRegion]=useState(
    destinationHubs.find(h=>h.hub_code===values.destination_hub)?.region??''
  )
  const [quickProductText,setQuickProductText]=useState('')
  const action=mode==='create'?createOrder:updateOrder
  const skuMap=useMemo(()=>{
    const map=new Map<string,SkuCatalogItem>()
    for(const item of skuCatalog){
      const key=String(item.sku??'').trim().toUpperCase()
      if(key&&!map.has(key))map.set(key,item)
    }
    return map
  },[skuCatalog])
  const voucherTypeOptions=useMemo(
    ()=>[...new Set([...voucherTypes,...initialVouchers.map(v=>String(v.voucher_type??'')).filter(Boolean)])],
    [voucherTypes,initialVouchers]
  )
  const voucherTagOptions=useMemo(
    ()=>[...new Set([...voucherTags,...initialVouchers.map(v=>String(v.voucher_tag??'')).filter(Boolean)])],
    [voucherTags,initialVouchers]
  )
  const sortedHubs=useMemo(
    ()=>[...destinationHubs].sort((a,b)=>Number(a.priority??100)-Number(b.priority??100)||a.hub_code.localeCompare(b.hub_code,'vi')),
    [destinationHubs]
  )

  const selectedUser=selectableUsers.find(u=>u.id===selectedUserId)??null
  const filteredUsers=useMemo(()=>{
    const q=userQuery.trim().toLowerCase()
    if(!q)return selectableUsers.slice(0,30)
    return selectableUsers.filter(u=>
      [u.username,u.phone].filter(Boolean).join(' ').toLowerCase().includes(q)
    ).slice(0,30)
  },[selectableUsers,userQuery])

  function pickUser(user:UserOption){
    setSelectedUserId(user.id)
    setUserQuery(user.username)
    setUserOpen(false)
  }

  function onTrackingChange(value:string){
    setTrackingNumber(value)
    if(!carrierEdited)setCarrier(detectCarrier(value))
  }

  function updateItem(index:number,patch:Partial<Item>){
    setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item))
  }

  function updateSku(index:number,value:string){
    const matched=skuMap.get(value.trim().toUpperCase())
    updateItem(index,matched
      ? {
          sku:value,
          product_name:matched.product_name??'',
          variant:matched.variant??'',
          original_price:matched.original_price??'',
          final_price:matched.final_price??'',
        }
      : {sku:value})
  }

  function updateVoucher(index:number,patch:Partial<Voucher>){
    setVouchers(current=>current.map((voucher,i)=>i===index?{...voucher,...patch}:voucher))
  }

  function resolveDestination(address:string){
    const normalized=normalizeText(address)
    if(!normalized){
      setDerivedArea('')
      setDerivedRegion('')
      setDestinationHub('')
      return
    }

    const provinceMatches=sortedHubs.filter(h=>containsKeyword(normalized,h.province_keywords))
    const districtMatches=sortedHubs
      .map(h=>({
        hub:h,
        score:
          (containsKeyword(normalized,h.district_keywords)?100:0)+
          (containsKeyword(normalized,h.address_keywords)?60:0)+
          (containsKeyword(normalized,h.province_keywords)?20:0)-
          Math.min(Number(h.priority??100),99)/100,
      }))
      .filter(x=>x.score>=60)
      .sort((a,b)=>b.score-a.score)

    const bestHub=districtMatches[0]?.hub??null
    const bestArea=bestHub??provinceMatches[0]??null

    setDerivedArea(bestArea?.area??'')
    setDerivedRegion(bestArea?.region??'')
    setDestinationHub(bestHub?.hub_code??'')
  }

  function onAddressChange(value:string){
    setRecipientAddress(value)
    resolveDestination(value)
  }

  function selectDestinationHub(value:string){
    setDestinationHub(value)
    const hub=sortedHubs.find(x=>x.hub_code===value)
    if(hub){
      setDerivedArea(hub.area)
      setDerivedRegion(hub.region)
    }
  }

  function parseQuickProductLine(line:string){
    const item:Item=emptyItem()
    const raw=line.trim()

    // Shopee compact format:
    // Tên SP xSL Giá gốc₫Giá sau giảm₫ (Phân loại)
    // Example: Dầu Đậu Nành Simply Nguyên chất chai 1 Lít x1 79.000₫78.921₫ (Đậu Nành 1 Lít)
    const shopeeCompact=raw.match(/^(.*?)\s+[x×]\s*(\d+)\s+([\d.,]+)\s*₫(?:\s*([\d.,]+)\s*₫)?(?:\s*\(([^)]+)\))?\s*$/i)
    if(shopeeCompact){
      item.product_name=shopeeCompact[1].trim()
      item.quantity=Math.max(1,Number(shopeeCompact[2]))
      const firstPrice=parseNumberToken(shopeeCompact[3])
      const secondPrice=shopeeCompact[4]?parseNumberToken(shopeeCompact[4]):''
      if(secondPrice!==''){
        item.original_price=firstPrice
        item.final_price=secondPrice
      }else{
        item.final_price=firstPrice
      }
      item.variant=shopeeCompact[5]?.trim()??''
      return item
    }

    const labeledSku=raw.match(/(?:^|\s)sku\s*[:=\-]?\s*([A-Za-z0-9._-]{2,60})/i)
    const labeledQty=raw.match(/(?:^|\s)(?:sl|qty|số lượng|so luong)\s*[:=\-]?\s*(\d+)/i)
    const labeledOriginal=raw.match(/(?:giá gốc|gia goc|original)\s*[:=\-]?\s*([\d.,]+)/i)
    const labeledFinal=raw.match(/(?:giá sau giảm|gia sau giam|giá bán|gia ban|final|price)\s*[:=\-]?\s*([\d.,]+)/i)
    const labeledName=raw.match(/(?:tên sản phẩm|ten san pham|tên sp|ten sp|sản phẩm|san pham)\s*[:=\-]?\s*(.+?)(?=\s+(?:phân loại|phan loai|variant|màu|mau|size|sl|qty|số lượng|so luong|giá gốc|gia goc|giá sau giảm|gia sau giam|giá bán|gia ban|final|price)\b|$)/i)
    const labeledVariant=raw.match(/(?:phân loại|phan loai|variant|màu|mau|size)\s*[:=\-]?\s*(.+?)(?=\s+(?:sl|qty|số lượng|so luong|giá gốc|gia goc|giá sau giảm|gia sau giam|giá bán|gia ban|final|price)\b|$)/i)

    if(labeledSku)item.sku=labeledSku[1].trim()
    if(labeledQty)item.quantity=Math.max(1,Number(labeledQty[1]))
    if(labeledOriginal)item.original_price=parseNumberToken(labeledOriginal[1])
    if(labeledFinal)item.final_price=parseNumberToken(labeledFinal[1])
    if(labeledName)item.product_name=labeledName[1].trim()
    if(labeledVariant)item.variant=labeledVariant[1].trim()

    const parts=raw.split(/\t|\||;/).map(x=>x.trim()).filter(Boolean)
    const free:string[]=[]

    for(const part of parts){
      let m:RegExpMatchArray|null
      if((m=part.match(/^\s*sku\s*[:\-=]?\s*(.+)$/i))){
        if(!item.sku)item.sku=m[1].trim().split(/\s+/)[0]
        continue
      }
      if((m=part.match(/^\s*(?:sl|qty|so luong|số lượng)\s*[:\-=]?\s*(\d+)/i))){
        if(item.quantity==null)item.quantity=Math.max(1,Number(m[1]))
        continue
      }
      if((m=part.match(/^\s*(?:phan loai|phân loại|variant|mau|màu|size)\s*[:\-=]?\s*(.+)$/i))){
        if(!item.variant)item.variant=m[1].trim()
        continue
      }
      if((m=part.match(/^\s*(?:ten sp|tên sp|ten san pham|tên sản phẩm|san pham|sản phẩm)\s*[:\-=]?\s*(.+)$/i))){
        if(!item.product_name)item.product_name=m[1].trim()
        continue
      }
      if((m=part.match(/^\s*(?:gia goc|giá gốc|original)\s*[:\-=]?\s*(.+)$/i))){
        if(item.original_price==null)item.original_price=parseNumberToken(m[1])
        continue
      }
      if((m=part.match(/^\s*(?:gia sau giam|giá sau giảm|gia ban|giá bán|final|price|gia|giá)\s*[:\-=]?\s*(.+)$/i))){
        if(item.final_price==null)item.final_price=parseNumberToken(m[1])
        continue
      }
      if(parts.length>1)free.push(part)
    }

    if(!item.sku){
      const known=free.find(x=>skuMap.has(x.trim().toUpperCase()))
      if(known){
        item.sku=known
        free.splice(free.indexOf(known),1)
      }else if(free[0]&&/^[A-Za-z0-9._-]{3,40}$/.test(free[0])){
        item.sku=free.shift()
      }
    }

    const numeric=free.filter(x=>/^\s*[\d.,]+\s*$/.test(x))
    const textParts=free.filter(x=>!/^\s*[\d.,]+\s*$/.test(x))
    if(!item.product_name&&textParts.length)item.product_name=textParts.shift()
    if(!item.variant&&textParts.length)item.variant=textParts.join(' · ')

    if(item.quantity==null&&numeric.length&&Number(String(numeric[0]).replace(/\D/g,''))<=100){
      item.quantity=Math.max(1,Number(String(numeric.shift()).replace(/\D/g,''))||1)
    }
    if(item.original_price==null&&numeric.length)item.original_price=parseNumberToken(numeric.shift()??'')
    if(item.final_price==null&&numeric.length)item.final_price=parseNumberToken(numeric.shift()??'')

    const matched=item.sku?skuMap.get(String(item.sku).trim().toUpperCase()):null
    if(matched){
      item.product_name=item.product_name||matched.product_name||''
      item.variant=item.variant||matched.variant||''
      item.original_price=item.original_price||matched.original_price||''
      item.final_price=item.final_price||matched.final_price||''
    }

    item.quantity=item.quantity??1
    return item
  }

  function recognizeQuickProducts(){
    const parsed=quickProductText
      .split(/\n+/)
      .map(line=>line.trim())
      .filter(Boolean)
      .map(parseQuickProductLine)
      .filter(item=>item.sku||item.product_name)

    if(!parsed.length)return
    const currentIsBlank=items.length===1&&!items[0].sku&&!items[0].product_name
    setItems(currentIsBlank?parsed:[...items,...parsed])
    setQuickProductText('')
  }

  return <form action={action} className="panel-form panel-scroll order-editor">
    <input type="hidden" name="return_query" value={returnQuery}/>
    <input type="hidden" name="erp_user_id" value={selectedUserId}/>
    <input type="hidden" name="shipping_service" value={shippingService}/>
    <input type="hidden" name="area" value={derivedArea}/>
    {mode==='edit'&&<input type="hidden" name="order_id" value={values.id}/>}

    <section className="form-section">
      <h3>Thông tin đơn</h3>

      <label className="user-picker-field">
        Username
        <div className="user-picker">
          <input
            value={userQuery}
            onChange={e=>{setUserQuery(e.target.value);setSelectedUserId('');setUserOpen(true)}}
            onFocus={()=>setUserOpen(true)}
            placeholder="Tìm Username hoặc SĐT..."
            autoComplete="off"
          />
          {userOpen&&<div className="user-picker-menu">
            {!filteredUsers.length
              ? <div className="user-picker-empty">Không tìm thấy User khả dụng.</div>
              : filteredUsers.map(u=><button type="button" key={u.id} onClick={()=>pickUser(u)}>
                  <b>{u.username}</b>
                  <span>{normalizePhone(u.phone)}</span>
                </button>)}
          </div>}
        </div>
      </label>

      <div className="linked-user-strip">
        <span>SĐT tài khoản</span>
        <b>{selectedUser?normalizePhone(selectedUser.phone):'Chọn Username để tự liên kết'}</b>
        {selectedUser&&<small>{selectedUser.status==='Blocked'?'Tài khoản Blocked chỉ được giữ ở đơn cũ':'Liên kết tự động từ User'}</small>}
      </div>

      <div className="form-grid">
        <label>Mã đơn Shopee<input name="shopee_order_id" defaultValue={values.shopee_order_id??''}/></label>
        <label>Thời gian đặt
          <input name="order_date" type="datetime-local" defaultValue={values.order_date_local??''} placeholder="Để trống = hiện tại"/>
          <small className="field-help">Để trống sẽ tự lấy thời điểm tạo đơn.</small>
        </label>
      </div>

      <div className="form-grid">
        <label>Thanh toán
          <select name="payment_status" defaultValue={values.payment_status??'UNPAID'}>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="PENDING">Đang chờ</option>
            <option value="PARTIAL">Thanh toán một phần</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </select>
        </label>
        <div className="derived-order-state">
          <span>Trạng thái đơn</span>
          <b>{trackingNumber.trim()?'Đang xử lý · Theo Tracking':'Đang chờ duyệt'}</b>
          <small>{trackingNumber.trim()?'Trạng thái vận chuyển tự cập nhật từ MVĐ':'Chờ mã vận đơn'}</small>
        </div>
      </div>
    </section>

    <section className="form-section">
      <h3>Vận chuyển</h3>
      <label>Mã vận đơn
        <input
          name="tracking_number"
          value={trackingNumber}
          onChange={e=>onTrackingChange(e.target.value)}
          onBlur={()=>setTrackingNumber(v=>v.trim().toUpperCase())}
          placeholder="Nhập MVĐ; hệ thống tự nhận diện ĐVVC"
        />
      </label>

      <div className="form-grid">
        <label>Đơn vị vận chuyển
          <input
            name="carrier"
            value={carrier}
            onChange={e=>{setCarrier(e.target.value);setCarrierEdited(true)}}
            placeholder="Tự nhận diện, có thể sửa"
          />
        </label>
        <label>Kho đích
          <select name="destination_hub" value={destinationHub} onChange={e=>selectDestinationHub(e.target.value)}>
            <option value="">— Tự nhận diện / Chưa xác định —</option>
            {sortedHubs.map(h=><option key={h.id} value={h.hub_code}>{h.hub_code}</option>)}
          </select>
        </label>
      </div>

      <div className="shipping-service-picker">
        <span>Dịch vụ vận chuyển</span>
        <div>
          <button type="button" className={shippingService==='STANDARD'?'active':''} onClick={()=>setShippingService('STANDARD')}>Tiêu chuẩn</button>
          <button type="button" className={shippingService==='EXPRESS'?'active express':''} onClick={()=>setShippingService('EXPRESS')}>Hỏa tốc</button>
        </div>
      </div>

    </section>

    <section className="form-section">
      <h3>Người nhận</h3>
      <div className="form-grid">
        <label>Tên người nhận<input name="recipient_name" defaultValue={values.recipient_name??''}/></label>
        <label>SĐT người nhận<input name="recipient_phone" defaultValue={values.recipient_phone??''}/></label>
      </div>
      <label>Địa chỉ nhận
        <textarea
          name="recipient_address"
          rows={3}
          value={recipientAddress}
          onChange={e=>onAddressChange(e.target.value)}
          placeholder="Nhập đầy đủ quận/huyện, tỉnh/thành để tự nhận diện kho đích"
        />
      </label>
      <div className="address-routing-strip">
        <div><span>Khu vực</span><b>{derivedArea||'Chưa xác định'}</b></div>
        <div><span>Miền</span><b>{derivedRegion||'Chưa xác định'}</b></div>
        <div><span>Kho đích</span><b>{destinationHub||'Chưa đủ dữ liệu để nhận diện'}</b></div>
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-head"><h3>Sản phẩm</h3><button type="button" className="mini-add" onClick={()=>setItems(v=>[...v,emptyItem()])}>+ Thêm dòng</button></div>
      <div className="quick-product-parser">
        <textarea
          rows={2}
          value={quickProductText}
          onChange={e=>setQuickProductText(e.target.value)}
          placeholder="Nhập nhanh: SKU123 | Áo thun nam | Đen XL | SL 2 | Giá gốc 199000 | Giá 149000. Có thể dán nhiều dòng."
        />
        <button type="button" className="button small" disabled={!quickProductText.trim()} onClick={recognizeQuickProducts}>Nhận diện</button>
      </div>
      <div className="repeat-stack">
        {items.map((item,i)=>{
          const matched=Boolean(item.sku&&skuMap.has(String(item.sku).trim().toUpperCase()))
          return <div className="repeat-card" key={i}>
            <div className="repeat-card-head">
              <b>Sản phẩm {i+1}</b>
              <div className="repeat-card-actions">
                {matched&&<span className="sku-match-badge">Đã lấy dữ liệu SKU gần nhất</span>}
                {items.length>1&&<button type="button" onClick={()=>setItems(v=>v.filter((_,x)=>x!==i))}>Xóa</button>}
              </div>
            </div>

            <div className="form-grid">
              <label>SKU
                <input
                  name="item_sku"
                  value={item.sku??''}
                  onChange={e=>updateSku(i,e.target.value)}
                  placeholder="Nhập SKU để tự điền"
                  autoComplete="off"
                />
              </label>
              <label>Phân loại
                <input
                  name="item_variant"
                  value={item.variant??''}
                  onChange={e=>updateItem(i,{variant:e.target.value})}
                />
              </label>
            </div>

            <label>Tên sản phẩm
              <input
                name="item_product_name"
                value={item.product_name??''}
                onChange={e=>updateItem(i,{product_name:e.target.value})}
                required={i===0}
              />
            </label>

            <div className="form-grid three">
              <label>SL
                <input
                  name="item_quantity"
                  type="number"
                  min="1"
                  value={item.quantity??1}
                  onChange={e=>updateItem(i,{quantity:Number(e.target.value||1)})}
                />
              </label>
              <label>Giá gốc
                <input
                  name="item_original_price"
                  inputMode="numeric"
                  value={item.original_price??''}
                  onChange={e=>updateItem(i,{original_price:e.target.value})}
                />
              </label>
              <label>Giá sau giảm
                <input
                  name="item_final_price"
                  inputMode="numeric"
                  value={item.final_price??''}
                  onChange={e=>updateItem(i,{final_price:e.target.value})}
                />
              </label>
            </div>
          </div>
        })}
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-head"><h3>Voucher</h3><button type="button" className="mini-add" onClick={()=>setVouchers(v=>[...v,emptyVoucher()])}>+ Thêm voucher</button></div>
      <div className="repeat-stack voucher-repeat-stack">
        {vouchers.map((v,i)=><div className="repeat-card voucher-entry-card" key={i}>
          <div className="repeat-card-head">
            <b>Voucher {i+1}</b>
            {vouchers.length>1&&<button type="button" onClick={()=>setVouchers(x=>x.filter((_,n)=>n!==i))}>Xóa</button>}
          </div>
          <label>Mã voucher
            <input
              name="voucher_code"
              value={v.voucher_code??''}
              onChange={e=>updateVoucher(i,{voucher_code:e.target.value})}
              placeholder="Nhập mã voucher"
            />
          </label>
          <div className="form-grid">
            <label>Loại Voucher
              <select
                name="voucher_type"
                value={v.voucher_type??''}
                onChange={e=>updateVoucher(i,{voucher_type:e.target.value})}
              >
                <option value="">— Chọn loại —</option>
                {voucherTypeOptions.map(option=><option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>Tag Voucher
              <select
                name="voucher_tag"
                value={v.voucher_tag??''}
                onChange={e=>updateVoucher(i,{voucher_tag:e.target.value})}
              >
                <option value="">— Chọn tag —</option>
                {voucherTagOptions.map(option=><option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>)}
      </div>
    </section>

    <section className="form-section order-cod-section">
      <h3>Giá trị đơn</h3>
      <label>COD
        <input name="cod" inputMode="numeric" defaultValue={values.cod??0} placeholder="Nhập COD sau khi hoàn tất sản phẩm / voucher"/>
        <small className="field-help">Nhập cuối cùng sau khi đã kiểm tra sản phẩm và voucher.</small>
      </label>
    </section>

    <div className="form-actions">
      <a className="button" href={cancelHref}>Hủy</a>
      <button className="button primary">{mode==='create'?'Tạo đơn':'Lưu thay đổi'}</button>
    </div>
  </form>
}
