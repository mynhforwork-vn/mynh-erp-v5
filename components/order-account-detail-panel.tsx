import Link from 'next/link'
import { SystemSlidebar } from '@/components/system-slidebar'
import { formatDateTime, formatMoney, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import type { AccountDeviceRow } from '@/lib/purchase-account-device-fields'
import { accountDeviceFields } from '@/lib/purchase-account-device-fields'

type UserRecord={
  id:string,username:string,phone?:string|null,email?:string|null,status?:string|null,
  platform?:string|null,note?:string|null,created_at?:string|null,archived_at?:string|null,
  order_count?:number|null,browser_name?:string|null,spc_st_secret_id?:string|null,
  spc_f_secret_id?:string|null,spc_st_encrypted?:string|null,spc_f_encrypted?:string|null
}
type UserOrder={
  id:string,shopee_order_id?:string|null,order_date?:string|null,
  cod?:number|null,order_status?:string|null,order_items?:{product_name?:string|null,variant?:string|null}[]|null,
  order_vouchers?:{voucher_tag?:string|null,voucher_type?:string|null,voucher_name?:string|null,voucher_code?:string|null}[]|null,
  href:string
}
type UserHistory={id:string,action:string,source?:string|null,created_at?:string|null}

export function OrderAccountDetailPanel({
  account,devices,orders,history,earliestDate,tab,closeHref,infoHref,ordersHref,historyHref,
}:{
  account:UserRecord|null,devices:AccountDeviceRow[],orders:UserOrder[],history:UserHistory[],
  earliestDate?:string|null,tab:string,closeHref:string,infoHref:string,ordersHref:string,historyHref:string
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
  const effectiveDate=earliestDate&&account.created_at&&Date.parse(earliestDate)<Date.parse(account.created_at)
    ?earliestDate:account.created_at
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
      </>}
      {tab==='orders'&&<>
        <div className="panel-section-head"><div><h3>Đơn hàng của User</h3><span>{orders.length} đơn gần nhất</span></div></div>
        <div className="user-order-list detailed">
          {!orders.length?<div className="empty compact">User này chưa có đơn hàng.</div>
            :orders.map(order=><Link key={order.id} className="user-order-card detailed" href={order.href}>
              <div className="user-order-card-top">
                <div><b>{order.shopee_order_id??order.id.slice(0,8)}</b><span>{formatDateTime(order.order_date)}</span></div>
                <strong>{formatMoney(order.cod)}</strong>
              </div>
              <div className="order-detail-strip"><span>Trạng thái <b>{statusLabel(order.order_status)}</b></span></div>
              <div className="user-order-products">
                {(order.order_items??[]).slice(0,2).map((item,i)=><div key={i}>
                  <span>{[item.product_name,item.variant].filter(Boolean).join(' · ')||'Sản phẩm'}</span>
                </div>)}
              </div>
            </Link>)}
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
