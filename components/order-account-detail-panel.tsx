import Link from 'next/link'
import { SystemSlidebar } from '@/components/system-slidebar'
import { formatDateTime, formatMoney, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import type { AccountDeviceRow } from '@/lib/purchase-account-device-fields'
import { accountDeviceFields } from '@/lib/purchase-account-device-fields'
import { updateERPUser } from '@/lib/actions/core'
import { orderIsCancelled } from '@/lib/purchase-order-cancellation'
import { prepaidSourceLabel } from '@/lib/order-prepaid'

type UserRecord={
  id:string,username:string,phone?:string|null,email?:string|null,status?:string|null,
  platform?:string|null,note?:string|null,created_at?:string|null,archived_at?:string|null,
  order_count?:number|null,browser_name?:string|null,spc_st_secret_id?:string|null,
  spc_f_secret_id?:string|null,spc_st_encrypted?:string|null,spc_f_encrypted?:string|null
}
type UserOrder={
  id:string,shopee_order_id?:string|null,order_date?:string|null,
  cod?:number|null,order_status?:string|null,receive_status?:string|null,payment_status?:string|null,
  prepaid_amount?:number|null,prepaid_source_type?:string|null,prepaid_source_label?:string|null,
  shipments?:{tracking_number?:string|null,carrier?:string|null,current_tracking_status?:string|null,is_active?:boolean|null}[]|null,
  area?:string|null,recipient_name?:string|null,recipient_phone?:string|null,
  recipient_address?:string|null,destination_hub?:string|null,archived_at?:string|null,
  order_items?:{product_name?:string|null,variant?:string|null,sku?:string|null,quantity?:number|null,final_price?:number|null,original_price?:number|null}[]|null,
  order_vouchers?:{voucher_tag?:string|null,voucher_type?:string|null,voucher_name?:string|null,voucher_code?:string|null}[]|null,
  href:string
}
type UserHistory={id:string,action:string,source?:string|null,created_at?:string|null}

export function OrderAccountDetailPanel({
  account,devices,orders,history,earliestDate,tab,closeHref,infoHref,ordersHref,historyHref,
  canEdit=false,editMode=false,editHref,returnQuery,
}:{
  account:UserRecord|null,devices:AccountDeviceRow[],orders:UserOrder[],history:UserHistory[],
  earliestDate?:string|null,tab:string,closeHref:string,infoHref:string,ordersHref:string,historyHref:string,
  canEdit?:boolean,editMode?:boolean,editHref:string,returnQuery:string
}){
  if(!account)return <SystemSlidebar className="detail-panel account-detail-panel">
    <div className="panel-head"><div><span className="eyebrow">CHI TIẾT USER</span><h2>Không tìm thấy tài khoản</h2></div><Link className="close" href={closeHref}>×</Link></div>
    <div className="panel-scroll"><p className="empty">Tài khoản không tồn tại hoặc bạn không có quyền xem.</p><Link className="button" href={closeHref}>Trở lại đơn nhập</Link></div>
  </SystemSlidebar>
  const fields=accountDeviceFields({all_devices:devices,browser_name:account.browser_name})
  const voucherCounts=new Map<string,number>()
  for(const order of orders){
    for(const voucher of order.order_vouchers??[]){
      const label=String(voucher.voucher_tag||voucher.voucher_type||voucher.voucher_name||voucher.voucher_code||'').trim()
      if(label)voucherCounts.set(label,(voucherCounts.get(label)??0)+1)
    }
  }
  const statusOf=(order:UserOrder)=>{
    const shipment=order.shipments?.find(s=>s.is_active)??order.shipments?.[0]
    if(orderIsCancelled(order))return 'Đã huỷ'
    if(shipment?.current_tracking_status&&shipment.current_tracking_status!=='UNKNOWN')
      return statusLabel(shipment.current_tracking_status)
    if(order.receive_status==='RECEIVED')return 'Đã nhận'
    return statusLabel(order.order_status)
  }
  const effectiveDate=earliestDate&&account.created_at&&Date.parse(earliestDate)<Date.parse(account.created_at)
    ?earliestDate:account.created_at
  if(editMode&&canEdit)return <SystemSlidebar className="detail-panel account-detail-panel order-account-detail-panel">
    <div className="panel-head"><div><span className="eyebrow">TÀI KHOẢN MUA HÀNG</span><h2>Sửa {account.username}</h2></div>
      <Link className="close" href={infoHref} aria-label="Đóng sửa tài khoản">×</Link></div>
    <form className="panel-form panel-scroll" action={updateERPUser}>
      <input type="hidden" name="return_path" value="orders"/>
      <input type="hidden" name="return_query" value={returnQuery}/>
      <input type="hidden" name="user_id" value={account.id}/>
      <section className="form-section"><h3>Thông tin tài khoản</h3>
        <label>Username<input name="username" required defaultValue={account.username}/></label>
        <div className="form-grid"><label>Số điện thoại<input name="phone" defaultValue={account.phone??''}/></label>
          <label>Email<input name="email" type="email" defaultValue={account.email??''}/></label></div>
        <label>Trạng thái<select name="status" defaultValue={account.status??'Active'}>
          {['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'].map(value=>
            <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select></label>
        <label>Ghi chú<textarea name="note" rows={2} defaultValue={account.note??''}/></label>
      </section>
      <section className="form-section"><h3>Đăng nhập & phiên</h3>
        <label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" placeholder="Để trống nếu không đổi"/></label>
        <label>SPC_ST mới<textarea name="spc_st" rows={2} placeholder="Để trống nếu không đổi"/></label>
        <label>SPC_F mới<textarea name="spc_f" rows={2} placeholder="Để trống nếu không đổi"/></label>
      </section>
      <section className="form-section"><h3>Thiết bị</h3>
        <div className="form-grid purchase-two-device-fields">
          <label>Mobile — Loại thiết bị<input name="mobile_device_type" maxLength={120} defaultValue={fields.mobileType}/></label>
          <label>Browser — Tên<input name="browser_name" maxLength={120} defaultValue={fields.browserName}/></label>
        </div>
      </section>
      <div className="form-actions"><Link className="button" href={infoHref}>Huỷ</Link>
        <button className="button primary" type="submit">Lưu thay đổi</button></div>
    </form>
  </SystemSlidebar>
  return <SystemSlidebar className="detail-panel account-detail-panel order-account-detail-panel">
    <div className="panel-head">
      <div><span className="eyebrow">CHI TIẾT USER</span><h2>{account.username}</h2></div>
      <Link className="close" href={closeHref} aria-label="Trở lại đơn nhập">×</Link>
    </div>
    <div className="panel-tabs user-panel-tabs">
      <Link className={tab==='info'?'active':''} href={infoHref}>Thông tin</Link>
      <Link className={tab==='orders'?'active':''} href={ordersHref}>Đơn hàng <span>{account.order_count??orders.length}</span></Link>
      <Link className={tab==='history'?'active':''} href={historyHref}>Lịch sử</Link>
    </div>
    <div className="panel-scroll">
      {tab==='info'&&<>
        <div className="detail-grid compact-detail-grid">
          <div><span>Username</span><b>{account.username}</b></div>
          <div><span>Trạng thái</span><b>{account.archived_at?'Đã lưu trữ':statusLabel(account.status)}</b></div>
          <div><span>SĐT</span><b>{formatPhone(account.phone)}</b></div>
          <div><span>Email</span><b>{account.email||'—'}</b></div>
          <div><span>SPC_ST</span><b>{account.spc_st_secret_id||account.spc_st_encrypted?'Đã có':'Chưa có'}</b></div>
          <div><span>SPC_F</span><b>{account.spc_f_secret_id||account.spc_f_encrypted?'Đã có':'Chưa có'}</b></div>
          <div><span>Số đơn</span><b>{account.order_count??orders.length} đơn</b></div>
          <div><span>Ngày tạo</span><b>{formatDateTime(effectiveDate)}</b></div>
        </div>
        <div className="panel-section-head"><div><h3>Thiết bị</h3></div></div>
        <div className="detail-grid compact-detail-grid purchase-device-detail-grid">
          <div><span>Mobile · Loại thiết bị</span><b title={fields.mobileType||undefined}>{fields.mobileType||'—'}</b></div>
          <div><span>Browser · Tên</span><b title={fields.browserName||undefined}>{fields.browserName||'—'}</b></div>
        </div>
        <div className="panel-section-head"><div><h3>Voucher đã dùng</h3></div></div>
        <div className="voucher-usage-box">
          <VoucherTags value={[...voucherCounts.keys()].join(' · ')}/>
          {!!voucherCounts.size&&<div className="voucher-counts">{[...voucherCounts.entries()].map(([label,count])=><span key={label}>{label} <b>×{count}</b></span>)}</div>}
        </div>
        <div className="panel-note-row"><span>Ghi chú</span><b>{account.note||'—'}</b></div>
        {canEdit&&!account.archived_at&&<div className="panel-action-row">
          <Link className="button primary" href={editHref}>Sửa tài khoản</Link>
        </div>}
      </>}
      {tab==='orders'&&<>
        <div className="panel-section-head"><div><h3>Đơn hàng của User</h3><span>{orders.length} đơn gần nhất</span></div></div>
        <div className="user-order-list detailed">
          {!orders.length?<div className="empty compact">User này chưa có đơn hàng.</div>
            :orders.map(order=>{
              const ship=order.shipments?.find(s=>s.is_active)??order.shipments?.[0]
              const voucherText=(order.order_vouchers??[]).map(v=>
                String(v.voucher_tag||v.voucher_type||v.voucher_name||v.voucher_code||'').trim()
              ).filter(Boolean).join(' · ')
              return <Link key={order.id} className="user-order-card detailed" href={order.href}>
                <div className="user-order-card-top">
                  <div><b>{order.shopee_order_id??order.id.slice(0,8)}</b>
                    <span>{formatDateTime(order.order_date)} · {order.area??'Chưa rõ khu vực'}</span></div>
                  <strong>{formatMoney(order.cod)}</strong>
                </div>
                <div className="order-detail-strip">
                  <span>Đơn <b>{statusOf(order)}</b></span>
                  <span>Thanh toán <b>{statusLabel(order.payment_status)}</b></span>
                  {order.prepaid_amount!=null&&<span>Đã trả <b>{formatMoney(order.prepaid_amount)}</b> · {prepaidSourceLabel(order.prepaid_source_type)}{order.prepaid_source_label?' · '+order.prepaid_source_label:''}</span>}
                  <span>Nhận <b>{statusLabel(order.receive_status)}</b></span>
                </div>
                <div className="user-order-products">
                  {(order.order_items??[]).map((item,i)=><div key={i}>
                    <span>{item.product_name??'Sản phẩm'}{item.variant?' · '+item.variant:''}</span>
                    <b>{item.sku??'—'} · ×{item.quantity??1} · {formatMoney(item.final_price??item.original_price)}</b>
                  </div>)}
                </div>
                <div className="user-order-recipient">
                  <span>{order.recipient_name??'—'} · {formatPhone(order.recipient_phone)}</span>
                  <small>{order.recipient_address??'—'}</small>
                </div>
                <div className="user-order-shipping">
                  <div><span>MVĐ</span><b>{ship?.tracking_number??'Chưa có'}</b>
                    <small>{ship?.carrier??'—'} · {order.destination_hub??'Chưa rõ kho đích'}</small></div>
                  <span className={'status-pill status-'+String(ship?.current_tracking_status??'UNKNOWN').toLowerCase()}>
                    {orderIsCancelled(order)?'Đã huỷ':statusOf(order)}
                  </span>
                  {order.archived_at&&<span className="status-pill archived">Lưu trữ</span>}
                </div>
                {voucherText&&<VoucherTags value={voucherText}/>}
              </Link>
            })}
        </div>
      </>}
      {tab==='history'&&<>
        <h3>Lịch sử User</h3>
        <div className="timeline user-history-scroll">
          {!history.length?<div className="empty compact">Chưa có lịch sử thay đổi.</div>
            :history.map(h=><div className="timeline-item" key={h.id}><i></i><div>
              <b>{h.action}</b><span>{sourceLabel(h.source)}</span><small>{formatDateTime(h.created_at)}</small>
            </div></div>)}
        </div>
      </>}
    </div>
  </SystemSlidebar>
}
