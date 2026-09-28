'use client'

import { useState } from 'react'
import { createOrder, updateOrder } from '@/lib/actions/core'

type UserOption={id:string,username:string}
type Item={
  sku?:string|null
  product_name?:string|null
  variant?:string|null
  quantity?:number|null
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
  area?:string|null
  destination_hub?:string|null
}

function emptyItem():Item{return {sku:'',product_name:'',variant:'',quantity:1,original_price:'',final_price:''}}
function emptyVoucher():Voucher{return {voucher_code:'',voucher_name:'',voucher_type:'',voucher_tag:'',voucher_account:''}}

export function OrderEditorForm({
  mode,
  users,
  values={},
  initialItems=[],
  initialVouchers=[],
  cancelHref='/orders',
}:{
  mode:'create'|'edit'
  users:UserOption[]
  values?:Values
  initialItems?:Item[]
  initialVouchers?:Voucher[]
  cancelHref?:string
}){
  const [items,setItems]=useState<Item[]>(initialItems.length?initialItems:[emptyItem()])
  const [vouchers,setVouchers]=useState<Voucher[]>(initialVouchers.length?initialVouchers:[emptyVoucher()])
  const action=mode==='create'?createOrder:updateOrder

  return <form action={action} className="panel-form panel-scroll order-editor">
    {mode==='edit'&&<input type="hidden" name="order_id" value={values.id}/>}

    <section className="form-section">
      <h3>Thông tin đơn</h3>
      <div className="form-grid">
        <label>Mã đơn Shopee<input name="shopee_order_id" defaultValue={values.shopee_order_id??''}/></label>
        <label>Username
          <select name="erp_user_id" defaultValue={values.erp_user_id??''}>
            <option value="">— Chọn tài khoản —</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>Ngày đặt<input name="order_date" type="datetime-local" defaultValue={values.order_date_local??''}/></label>
        <label>Khu vực<input name="area" defaultValue={values.area??''} placeholder="Ví dụ: Hà Nội"/></label>
      </div>
      <div className="form-grid">
        <label>Trạng thái đơn
          <select name="order_status" defaultValue={values.order_status??'PENDING'}>
            <option value="PENDING">Đang chờ</option>
            <option value="CONFIRMED">Đã xác nhận</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="RETURNED">Đã trả hàng</option>
          </select>
        </label>
        <label>Thanh toán
          <select name="payment_status" defaultValue={values.payment_status??'UNPAID'}>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="PENDING">Đang chờ</option>
            <option value="PARTIAL">Thanh toán một phần</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </select>
        </label>
      </div>
    </section>

    <section className="form-section">
      <h3>Vận chuyển</h3>
      <div className="form-grid">
        <label>Mã vận đơn<input name="tracking_number" defaultValue={values.tracking_number??''}/></label>
        <label>Đơn vị vận chuyển<input name="carrier" defaultValue={values.carrier??''} placeholder="SPX Express"/></label>
      </div>
      <div className="form-grid">
        <label>COD<input name="cod" inputMode="numeric" defaultValue={values.cod??0}/></label>
        <label>Kho đích<input name="destination_hub" defaultValue={values.destination_hub??''}/></label>
      </div>
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
        {items.map((item,i)=><div className="repeat-card" key={i}>
          <div className="repeat-card-head"><b>Sản phẩm {i+1}</b>{items.length>1&&<button type="button" onClick={()=>setItems(v=>v.filter((_,x)=>x!==i))}>Xóa</button>}</div>
          <label>Tên sản phẩm<input name="item_product_name" defaultValue={item.product_name??''} required={i===0}/></label>
          <div className="form-grid">
            <label>SKU<input name="item_sku" defaultValue={item.sku??''}/></label>
            <label>Phân loại<input name="item_variant" defaultValue={item.variant??''}/></label>
          </div>
          <div className="form-grid three">
            <label>SL<input name="item_quantity" type="number" min="1" defaultValue={item.quantity??1}/></label>
            <label>Giá gốc<input name="item_original_price" inputMode="numeric" defaultValue={item.original_price??''}/></label>
            <label>Giá sau giảm<input name="item_final_price" inputMode="numeric" defaultValue={item.final_price??''}/></label>
          </div>
        </div>)}
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-head"><h3>Voucher</h3><button type="button" className="mini-add" onClick={()=>setVouchers(v=>[...v,emptyVoucher()])}>+ Thêm voucher</button></div>
      <div className="repeat-stack">
        {vouchers.map((v,i)=><div className="repeat-card" key={i}>
          <div className="repeat-card-head"><b>Voucher {i+1}</b>{vouchers.length>1&&<button type="button" onClick={()=>setVouchers(x=>x.filter((_,n)=>n!==i))}>Xóa</button>}</div>
          <div className="form-grid">
            <label>Mã voucher<input name="voucher_code" defaultValue={v.voucher_code??''}/></label>
            <label>Tag voucher<input name="voucher_tag" defaultValue={v.voucher_tag??''}/></label>
          </div>
          <label>Tên voucher<input name="voucher_name" defaultValue={v.voucher_name??''}/></label>
          <div className="form-grid">
            <label>Loại voucher<input name="voucher_type" defaultValue={v.voucher_type??''}/></label>
            <label>Tài khoản voucher<input name="voucher_account" defaultValue={v.voucher_account??''}/></label>
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
