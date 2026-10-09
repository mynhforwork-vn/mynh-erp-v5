import {suggestDestinationHub} from '@/lib/destination-hub-resolution'
'use client'

import { useMemo, useState } from 'react'
import { createOrder, updateOrder } from '@/lib/actions/core'
import { formatParsedOrderSummary, parseShopeeOrderText } from '@/lib/shopee-order-text-parser'

type UserOption={
  id:string
  username:string
  phone?:string|null
  status?:string|null
  archived_at?:string|null
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
  assigned_shippers?:Array<{id:string,name:string,phone?:string|null}>
  priority?:number|null
}
type CarrierConfig={
  id:string
  carrier_code:string
  display_name:string
  tracking_prefixes?:string[]|null
  supports_destination_hub?:boolean|null
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
  express_shipper_name?:string|null
  express_shipper_phone?:string|null
  express_shipper_note?:string|null
}

function emptyItem():Item{return {sku:'',product_name:'',variant:'',quantity:1,original_price:'',final_price:''}}
function emptyVoucher():Voucher{return {voucher_code:'',voucher_name:'',voucher_type:'',voucher_tag:'',voucher_account:''}}

function detectCarrierConfig(value:string,configs:CarrierConfig[]){
  const v=value.trim().toUpperCase()
  if(!v)return null
  return configs.find(row=>
    (row.tracking_prefixes??[]).some(prefix=>{
      const p=String(prefix??'').trim().toUpperCase()
      return Boolean(p)&&v.startsWith(p)
    })
  )??null
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

function moneyNumber(value:number|string|null|undefined){
  if(typeof value==='number')return Number.isFinite(value)?value:0
  const raw=String(value??'').replace(/[^0-9]/g,'')
  const n=Number(raw)
  return Number.isFinite(n)?n:0
}

function formatVnd(value:number){
  return new Intl.NumberFormat('vi-VN').format(Math.max(0,Math.round(value)))+' đ'
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
  carrierConfigs=[],
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
  carrierConfigs?:CarrierConfig[]
}){
  const selectableUsers=useMemo(
    ()=>users.filter(u=>(!u.archived_at&&u.status!=='Blocked')||u.id===values.erp_user_id),
    [users,values.erp_user_id]
  )
  const initialUser=selectableUsers.find(u=>u.id===values.erp_user_id)??null
  const [selectedUserId,setSelectedUserId]=useState(values.erp_user_id??'')
  const [userQuery,setUserQuery]=useState(initialUser?.username??'')
  const [userOpen,setUserOpen]=useState(false)
  const [shopeeOrderId,setShopeeOrderId]=useState(String(values.shopee_order_id??''))
  const [orderDateLocal,setOrderDateLocal]=useState(String(values.order_date_local??''))
  const [paymentStatus,setPaymentStatus]=useState(String(values.payment_status??'UNPAID'))
  const [recipientName,setRecipientName]=useState(String(values.recipient_name??''))
  const [recipientPhone,setRecipientPhone]=useState(String(
    values.recipient_phone??(mode==='create'?initialUser?.phone??'':'')
  ))
  const [recipientPhoneAuto,setRecipientPhoneAuto]=useState(Boolean(
    mode==='create'&&!values.recipient_phone&&initialUser?.phone
  ))
  const [cod,setCod]=useState<number|string>(values.cod??0)
  const [orderText,setOrderText]=useState('')
  const [recognitionMessage,setRecognitionMessage]=useState('')
  const [items,setItems]=useState<Item[]>(initialItems.length?initialItems:[emptyItem()])
  const [vouchers,setVouchers]=useState<Voucher[]>(initialVouchers.length?initialVouchers:[emptyVoucher()])
  const [trackingNumber,setTrackingNumber]=useState(String(values.tracking_number??''))
  const initialCarrierConfig=detectCarrierConfig(String(values.tracking_number??''),carrierConfigs)
  const [carrier,setCarrier]=useState(String(values.carrier??initialCarrierConfig?.display_name??''))
  const [carrierEdited,setCarrierEdited]=useState(Boolean(values.carrier))
  const [shippingService,setShippingService]=useState(values.shipping_service==='EXPRESS'?'EXPRESS':'STANDARD')
  const [recipientAddress,setRecipientAddress]=useState(String(values.recipient_address??''))
  const [destinationHub,setDestinationHub]=useState(String(values.destination_hub??''))
  const [derivedArea,setDerivedArea]=useState(String(values.area??''))
  const [derivedRegion,setDerivedRegion]=useState(
    destinationHubs.find(h=>h.hub_code===values.destination_hub)?.region??''
  )
  const [expressShipperName,setExpressShipperName]=useState(String(values.express_shipper_name??''))
  const [expressShipperPhone,setExpressShipperPhone]=useState(String(values.express_shipper_phone??''))
  const [expressShipperNote,setExpressShipperNote]=useState(String(values.express_shipper_note??''))
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
    ()=>[...new Set([...voucherTypes,...vouchers.map(v=>String(v.voucher_type??'')).filter(Boolean)])],
    [voucherTypes,vouchers]
  )
  const voucherTagOptions=useMemo(
    ()=>[...new Set([...voucherTags,...vouchers.map(v=>String(v.voucher_tag??'')).filter(Boolean)])],
    [voucherTags,vouchers]
  )
  const sortedHubs=useMemo(
    ()=>[...destinationHubs].sort((a,b)=>Number(a.priority??100)-Number(b.priority??100)||a.hub_code.localeCompare(b.hub_code,'vi')),
    [destinationHubs]
  )
  const totalOriginal=useMemo(
    ()=>items.reduce((sum,item)=>sum+moneyNumber(item.original_price)*Math.max(1,Number(item.quantity??1)||1),0),
    [items]
  )
  const assignedHub=useMemo(
    ()=>sortedHubs.find(h=>h.hub_code===destinationHub)??null,
    [sortedHubs,destinationHub]
  )
  const selectedCarrierConfig=useMemo(
    ()=>carrierConfigs.find(x=>x.display_name===carrier)??null,
    [carrierConfigs,carrier]
  )
  const usesDestinationHub=Boolean(selectedCarrierConfig?.supports_destination_hub)

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
    if(mode==='create'&&(recipientPhoneAuto||!recipientPhone.trim())){
      setRecipientPhone(String(user.phone??''))
      setRecipientPhoneAuto(Boolean(user.phone))
    }
  }

  function onTrackingChange(value:string){
    setTrackingNumber(value)
    if(carrierEdited)return

    const detected=detectCarrierConfig(value,carrierConfigs)
    setCarrier(detected?.display_name??'')
    if(detected?.supports_destination_hub){
      if(recipientAddress.trim())resolveDestination(recipientAddress)
    }else{
      setDestinationHub('')
      setDerivedArea('')
      setDerivedRegion('')
    }
  }

  function selectCarrier(value:string){
    setCarrier(value)
    setCarrierEdited(Boolean(value))
    const config=carrierConfigs.find(x=>x.display_name===value)??null
    if(config?.supports_destination_hub){
      if(recipientAddress.trim())resolveDestination(recipientAddress)
    }else{
      setDestinationHub('')
      setDerivedArea('')
      setDerivedRegion('')
    }
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
    const wardMatches=sortedHubs
      .map(h=>{
        const wardMatched=containsKeyword(normalized,h.district_keywords)
        const extraMatched=containsKeyword(normalized,h.address_keywords)
        const provinceMatched=containsKeyword(normalized,h.province_keywords)
        const hasWardRules=Boolean(h.district_keywords?.length)
        return {
          hub:h,
          eligible:hasWardRules?wardMatched:extraMatched,
          score:
            (wardMatched?100:0)+
            (provinceMatched?20:0)+
            (extraMatched?10:0)-
            Math.min(Number(h.priority??100),99)/100,
        }
      })
      .filter(x=>x.eligible)
      .sort((a,b)=>b.score-a.score)

    // Use the same ambiguity-safe routing rule as quick-MVD and backend.
    // The unique Bắc Giang/Bắc Ninh province configuration is allowed,
    // while multiple Hà Nội HUBs require a matching ward/district.
    const bestHub=suggestDestinationHub(address,sortedHubs,'SPX')
    const bestArea=bestHub??provinceMatches[0]??null

    setDerivedArea(bestArea?.area??'')
    setDerivedRegion(bestArea?.region??'')
    setDestinationHub(bestHub?.hub_code??'')
  }

  function setShippingMode(mode:'STANDARD'|'EXPRESS'){
    setShippingService(mode)
    if(mode==='EXPRESS'){
      setCarrier('')
      setCarrierEdited(false)
      setDestinationHub('')
      setDerivedArea('')
      setDerivedRegion('')
      return
    }
    if(usesDestinationHub&&recipientAddress.trim())resolveDestination(recipientAddress)
  }

  function onAddressChange(value:string){
    setRecipientAddress(value)
    if(shippingService==='STANDARD'&&usesDestinationHub)resolveDestination(value)
  }

  function selectDestinationHub(value:string){
    setDestinationHub(value)
    const hub=sortedHubs.find(x=>x.hub_code===value)
    if(hub){
      setDerivedArea(hub.area)
      setDerivedRegion(hub.region)
    }
  }

  function recognizeOrderText(){
    const parsed=parseShopeeOrderText(orderText)
    const summary=formatParsedOrderSummary(parsed)
    if(!summary){
      setRecognitionMessage('Chưa nhận diện được dữ liệu đơn Shopee. Hãy dán nội dung trang Chi tiết đơn hàng.')
      return
    }

    if(parsed.shopee_order_id)setShopeeOrderId(parsed.shopee_order_id)
    if(parsed.order_date_local)setOrderDateLocal(parsed.order_date_local)

    let detectedCarrier:CarrierConfig|null=null
    if(parsed.tracking_number){
      setTrackingNumber(parsed.tracking_number)
      detectedCarrier=detectCarrierConfig(parsed.tracking_number,carrierConfigs)
      setCarrier(detectedCarrier?.display_name??'')
      setCarrierEdited(false)
      setShippingService('STANDARD')
    }

    if(parsed.recipient_name)setRecipientName(parsed.recipient_name)
    if(parsed.recipient_phone){
      setRecipientPhone(parsed.recipient_phone)
      setRecipientPhoneAuto(false)
    }
    if(parsed.recipient_address){
      setRecipientAddress(parsed.recipient_address)
      if(detectedCarrier?.supports_destination_hub){
        resolveDestination(parsed.recipient_address)
      }
    }

    if(parsed.products.length){
      setItems(parsed.products.map(item=>({
        sku:'',
        product_name:item.product_name,
        variant:item.variant??'',
        quantity:item.quantity,
        original_price:item.original_price??'',
        final_price:item.final_price??'',
      })))
    }

    if(parsed.vouchers.length){
      setVouchers(parsed.vouchers.map(v=>({
        voucher_code:v.voucher_code??'',
        voucher_name:v.voucher_name??'',
        voucher_type:v.voucher_type??'',
        voucher_tag:v.voucher_tag??'',
        voucher_account:v.voucher_account??'',
      })))
    }

    if(parsed.cod!==undefined)setCod(parsed.cod)

    const parsedGoodsTotal=parsed.products.reduce(
      (sum,item)=>sum+Number(item.original_price??item.final_price??0)*Math.max(1,Number(item.quantity??1)||1),
      0
    )
    const goodsCheck=parsed.total_goods!==undefined
      ? (parsedGoodsTotal===parsed.total_goods
          ? ' · Giá gốc khớp '+formatVnd(parsed.total_goods)
          : ' · CẢNH BÁO giá SP '+formatVnd(parsedGoodsTotal)+' ≠ Tổng tiền hàng '+formatVnd(parsed.total_goods))
      : ''
    setRecognitionMessage(
      'Đã nhận diện: '+summary+
      goodsCheck+
      (parsed.detected_status==='DELIVERED'?' · trạng thái Shopee: Giao thành công':'')
    )
  }

  return <form action={action} className="panel-form panel-scroll order-editor">
    <input type="hidden" name="return_query" value={returnQuery}/>
    <input type="hidden" name="erp_user_id" value={selectedUserId}/>
    <input type="hidden" name="shipping_service" value={shippingService}/>
    <input type="hidden" name="area" value={shippingService==='EXPRESS'?'':derivedArea}/>
    {mode==='edit'&&<input type="hidden" name="order_id" value={values.id}/>}

    {mode==='create'&&<section className="form-section order-text-recognizer">
      <div className="form-section-head">
        <div>
          <h3>Nhận diện từ nội dung Shopee</h3>
          <small>Dán toàn bộ nội dung trang Chi tiết đơn hàng; hệ thống tự điền mã đơn, MVĐ, người nhận, sản phẩm, voucher và thành tiền.</small>
        </div>
      </div>
      <textarea
        rows={5}
        value={orderText}
        onChange={e=>{setOrderText(e.target.value);setRecognitionMessage('')}}
        placeholder="Dán nội dung Chi tiết đơn hàng Shopee vào đây..."
      />
      <div className="order-text-recognizer-actions">
        <span className={recognitionMessage.startsWith('Đã')?'success':''}>{recognitionMessage||'Không tự tạo đơn cho đến khi bạn kiểm tra và bấm Tạo đơn.'}</span>
        <button type="button" className="button small primary" disabled={!orderText.trim()} onClick={recognizeOrderText}>Nhận diện đơn</button>
      </div>
    </section>}

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
        {selectedUser&&<small>{selectedUser.archived_at?'User đã lưu trữ · chỉ giữ liên kết đơn cũ':selectedUser.status==='Blocked'?'Tài khoản Blocked chỉ được giữ ở đơn cũ':'Liên kết tự động từ User'}</small>}
      </div>

      <div className="form-grid">
        <label>Mã đơn Shopee<input name="shopee_order_id" value={shopeeOrderId} onChange={e=>setShopeeOrderId(e.target.value.toUpperCase())}/></label>
        <label>Thời gian đặt
          <input name="order_date" type="datetime-local" value={orderDateLocal} onChange={e=>setOrderDateLocal(e.target.value)} placeholder="Để trống = hiện tại"/>
          <small className="field-help">Để trống sẽ tự lấy thời điểm tạo đơn.</small>
        </label>
      </div>

      <div className="form-grid">
        <label>Thanh toán
          <select name="payment_status" value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)}>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="PENDING">Đang chờ</option>
            <option value="PARTIAL">Thanh toán một phần</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </select>
        </label>
        <div className="derived-order-state">
          <span>Trạng thái đơn</span>
          <b>{shippingService==='EXPRESS'
            ? trackingNumber.trim()?'Đang xử lý · Hỏa tốc':'Hỏa tốc · Chưa có MVĐ'
            : trackingNumber.trim()?'Đang xử lý · Theo Tracking':'Đang chờ duyệt'}</b>
          <small>{shippingService==='EXPRESS'
            ? trackingNumber.trim()?'Có MVĐ · trạng thái giao cập nhật thủ công · không Tracking/HUB':'Cần bổ sung Mã vận đơn Hỏa tốc'
            : trackingNumber.trim()?'Trạng thái vận chuyển tự cập nhật từ MVĐ':'Chờ mã vận đơn'}</small>
        </div>
      </div>
    </section>

    <section className="form-section">
      <h3>Vận chuyển</h3>

      <div className="shipping-service-picker">
        <span>Dịch vụ vận chuyển</span>
        <div>
          <button type="button" className={shippingService==='STANDARD'?'active':''} onClick={()=>setShippingMode('STANDARD')}>Tiêu chuẩn</button>
          <button type="button" className={shippingService==='EXPRESS'?'active express':''} onClick={()=>setShippingMode('EXPRESS')}>Hỏa tốc</button>
        </div>
      </div>

      {shippingService==='STANDARD'
        ? <>
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
                <select
                  name="carrier"
                  value={carrier}
                  onChange={e=>selectCarrier(e.target.value)}
                >
                  <option value="">— Chọn / tự nhận diện theo MVĐ —</option>
                  {carrier&& !carrierConfigs.some(x=>x.display_name===carrier)&&<option value={carrier}>{carrier}</option>}
                  {carrierConfigs.map(row=><option key={row.id} value={row.display_name}>{row.carrier_code} · {row.display_name}</option>)}
                </select>
              </label>

              {usesDestinationHub
                ? <label>Kho đích SPX
                    <select name="destination_hub" value={destinationHub} onChange={e=>selectDestinationHub(e.target.value)}>
                      <option value="">— Tự nhận diện / Chưa xác định —</option>
                      {sortedHubs.map(h=><option key={h.id} value={h.hub_code}>{h.hub_code}</option>)}
                    </select>
                  </label>
                : <div className="carrier-routing-state">
                    <span>Kho đích</span>
                    <b>{carrier?'Không áp dụng':'Chưa xác định ĐVVC'}</b>
                    <small>{carrier?'Chỉ SPX sử dụng HUB kho đích':'Nhập MVĐ hoặc chọn ĐVVC'}</small>
                  </div>}
            </div>
          </>
        : <div className="express-shipper-box">
            <div className="express-shipper-title">
              <b>Thông tin vận chuyển Hỏa tốc</b>
              <span>Có Mã vận đơn để nhận diện đơn; trạng thái giao cập nhật thủ công, không chạy Tracking/HUB.</span>
            </div>

            <label>Mã vận đơn
              <input
                name="tracking_number"
                value={trackingNumber}
                onChange={e=>setTrackingNumber(e.target.value)}
                onBlur={()=>setTrackingNumber(v=>v.trim().toUpperCase())}
                placeholder="Nhập Mã vận đơn Hỏa tốc"
              />
              <small className="field-help">MVĐ Hỏa tốc không kích hoạt Tracking tự động.</small>
            </label>

            <div className="form-grid">
              <label>Tên Shipper
                <input
                  name="express_shipper_name"
                  value={expressShipperName}
                  onChange={e=>setExpressShipperName(e.target.value)}
                  placeholder="Tên Shipper"
                />
              </label>
              <label>SĐT Shipper
                <input
                  name="express_shipper_phone"
                  value={expressShipperPhone}
                  onChange={e=>setExpressShipperPhone(e.target.value)}
                  placeholder="Số điện thoại"
                />
              </label>
            </div>
            <label>Ghi chú Shipper
              <input
                name="express_shipper_note"
                value={expressShipperNote}
                onChange={e=>setExpressShipperNote(e.target.value)}
                placeholder="Biển số / thời gian dự kiến / ghi chú..."
              />
            </label>
          </div>}
    </section>

    <section className="form-section">
      <h3>Người nhận</h3>
      <div className="form-grid">
        <label>Tên người nhận<input name="recipient_name" value={recipientName} onChange={e=>setRecipientName(e.target.value)}/></label>
        <label>SĐT người nhận
          <input
            name="recipient_phone"
            value={recipientPhone}
            onChange={e=>{setRecipientPhone(e.target.value);setRecipientPhoneAuto(false)}}
            placeholder={selectedUser?.phone?'Tự điền từ tài khoản: '+selectedUser.phone:'Số điện thoại người nhận'}
          />
          {selectedUser?.phone&&recipientPhoneAuto&&<small className="field-help">Đã tự điền từ SĐT liên kết của Username; có thể sửa.</small>}
        </label>
      </div>
      <label>Địa chỉ nhận
        <textarea
          name="recipient_address"
          rows={3}
          value={recipientAddress}
          onChange={e=>onAddressChange(e.target.value)}
          placeholder={shippingService==='EXPRESS'?'Nhập địa chỉ giao hỏa tốc':'Nhập đầy đủ phường/xã, tỉnh/thành để tự nhận diện HUB kho đích'}
        />
      </label>
      {shippingService==='STANDARD'&&<div className="address-routing-strip">
        <div><span>Khu vực</span><b>{derivedArea||'Chưa xác định'}</b></div>
        <div><span>Miền</span><b>{derivedRegion||'Chưa xác định'}</b></div>
        <div><span>HUB đích</span><b>{destinationHub||'Chưa đủ dữ liệu để nhận diện'}</b></div>
        <div className="assigned-shipper">
          <span>Shipper phụ trách</span>
          {assignedHub?.assigned_shippers?.length
            ? <div className="assigned-shipper-list">
                {assignedHub.assigned_shippers.map(s=><span className="assigned-shipper-chip" key={s.id}>
                  <b>{s.name}</b>{s.phone&&<small>{s.phone}</small>}
                </span>)}
              </div>
            : <b>Chưa cấu hình</b>}
        </div>
      </div>}
    </section>

    <section className="form-section">
      <div className="form-section-head"><h3>Sản phẩm</h3><button type="button" className="mini-add" onClick={()=>setItems(v=>[...v,emptyItem()])}>+ Thêm dòng</button></div>
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
      <div className="product-total-bar">
        <span>Tổng giá gốc</span>
        <b>{formatVnd(totalOriginal)}</b>
        <small>Σ Giá gốc × Số lượng</small>
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
          <input type="hidden" name="voucher_name" value={v.voucher_name??''}/>
          <input type="hidden" name="voucher_account" value={v.voucher_account??''}/>
          <label>Mã voucher
            <input
              name="voucher_code"
              value={v.voucher_code??''}
              onChange={e=>updateVoucher(i,{voucher_code:e.target.value})}
              placeholder={v.voucher_name||'Nhập mã voucher'}
            />
            {v.voucher_name&&<small className="field-help">{v.voucher_name}</small>}
          </label>
          <div className="form-grid">
            <label>Loại Voucher
              <input
                name="voucher_type"
                value={v.voucher_type??''}
                onChange={e=>updateVoucher(i,{voucher_type:e.target.value})}
                list="voucher-type-options"
                placeholder="Nhập hoặc chọn loại..."
                autoComplete="off"
              />
            </label>
            <label>Tag Voucher
              <input
                name="voucher_tag"
                value={v.voucher_tag??''}
                onChange={e=>updateVoucher(i,{voucher_tag:e.target.value})}
                list="voucher-tag-options"
                placeholder="Nhập hoặc chọn tag..."
                autoComplete="off"
              />
            </label>
          </div>
        </div>)}
      </div>
      <datalist id="voucher-type-options">
        {voucherTypeOptions.map(option=><option key={option} value={option}/>)}
      </datalist>
      <datalist id="voucher-tag-options">
        {voucherTagOptions.map(option=><option key={option} value={option}/>)}
      </datalist>
    </section>

    <section className="form-section order-cod-section">
      <h3>Giá trị đơn</h3>
      <label>COD
        <input name="cod" inputMode="numeric" value={cod} onChange={e=>setCod(e.target.value)} placeholder="Nhập COD sau khi hoàn tất sản phẩm / voucher"/>
        <small className="field-help">Nhập cuối cùng sau khi đã kiểm tra sản phẩm và voucher.</small>
      </label>
    </section>

    <div className="form-actions">
      <a className="button" href={cancelHref}>Hủy</a>
      <button className="button primary">{mode==='create'?'Tạo đơn':'Lưu thay đổi'}</button>
    </div>
  </form>
}
