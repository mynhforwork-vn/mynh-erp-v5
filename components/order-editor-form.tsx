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

  return <form action={action} className="panel-form panel-scroll order-editor">
    <input type="hidden" name="return_query" value={returnQuery}/>
    <input type="hidden" name="erp_user_id" value={selectedUserId}/>
    <input type="hidden" name="shipping_service" value={shippingService}/>
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
        <label>Kho đích<input name="destination_hub" defaultValue={values.destination_hub??''}/></label>
      </div>

      <div className="shipping-service-picker">
        <span>Dịch vụ vận chuyển</span>
        <div>
          <button type="button" className={shippingService==='STANDARD'?'active':''} onClick={()=>setShippingService('STANDARD')}>Tiêu chuẩn</button>
          <button type="button" className={shippingService==='EXPRESS'?'active express':''} onClick={()=>setShippingService('EXPRESS')}>Hỏa tốc</button>
        </div>
      </div>

      <label>COD<input name="cod" inputMode="numeric" defaultValue={values.cod??0}/></label>
    </section>

    <section className="form-section">
      <h3>Người nhận</h3>
      <div className="form-grid">
        <label>Tên người nhận<input name="recipient_name" defaultValue={values.recipient_name??''}/></label>
        <label>SĐT người nhận<input name="recipient_phone" defaultValue={values.recipient_phone??''}/></label>
      </div>
      <label>Địa chỉ nhận<textarea name="recipient_address" rows={3} defaultValue={values.recipient_address??''}/></label>
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

    <div className="form-actions">
      <a className="button" href={cancelHref}>Hủy</a>
      <button className="button primary">{mode==='create'?'Tạo đơn':'Lưu thay đổi'}</button>
    </div>
  </form>
}
