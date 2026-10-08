import Link from 'next/link'
import { SystemSlidebar } from '@/components/system-slidebar'
import { formatDateTime,formatMoney,formatPhone,sourceLabel,statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'

type Props={
  order:any
  items:any[]
  vouchers:any[]
  trackingEvents:any[]
  auditRows:any[]
  activeTab:'info'|'tracking'|'history'
  backHref:string
  closeHref:string
  infoHref:string
  trackingHref:string
  historyHref:string
  openModuleHref:string
  parentLabel?:string
  floating?:boolean
}

function activeShipment(order:any){
  return (order?.shipments??[]).find((x:any)=>x.is_active)??order?.shipments?.[0]??null
}
function voucherLabel(v:any){
  return String(v?.voucher_tag||v?.voucher_type||v?.voucher_name||v?.voucher_code||'').trim()
}

export function ContextOrderPanel({
  order,items,vouchers,trackingEvents,auditRows,activeTab,
  backHref,closeHref,infoHref,trackingHref,historyHref,openModuleHref,parentLabel='User',floating=false,
}:Props){
  const shipment=activeShipment(order)
  const voucherText=(vouchers??[]).map(voucherLabel).filter(Boolean).join(' · ')
  const totalOriginal=(items??[]).reduce(
    (sum:number,it:any)=>sum+Number(it.original_price??0)*Math.max(1,Number(it.quantity??1)||1),
    0
  )
  const isExpress=order.shipping_service==='EXPRESS'

  return <SystemSlidebar className={"detail-panel context-order-panel"+(floating?" floating":"")}>
    <div className="panel-head context-stack-head">
      <Link className="context-stack-back" href={backHref} aria-label="Quay lại">←</Link>
      <div className="context-stack-title">
        <span className="eyebrow">CHI TIẾT ĐƠN · TRONG {parentLabel.toUpperCase()}</span>
        <h2>{order.shopee_order_id??String(order.id).slice(0,8)}</h2>
        <small>{order.erp_users?.username??'User'}</small>
      </div>
      <Link className="close" href={closeHref} aria-label="Đóng toàn bộ">×</Link>
    </div>

    <div className="context-stack-breadcrumb">
      <span>{parentLabel}</span><i>›</i><b>Đơn {order.shopee_order_id??String(order.id).slice(0,8)}</b>
      {activeTab!=='info'&&<><i>›</i><strong>{activeTab==='tracking'?'Tracking':'Lịch sử'}</strong></>}
    </div>

    <div className="panel-tabs context-order-tabs">
      <Link className={activeTab==='info'?'active':''} href={infoHref}>Thông tin</Link>
      {!isExpress&&<Link className={activeTab==='tracking'?'active':''} href={trackingHref}>Tracking</Link>}
      <Link className={activeTab==='history'?'active':''} href={historyHref}>Lịch sử</Link>
    </div>

    <div className="panel-scroll context-order-scroll">
      {activeTab==='info'&&<>
        <div className="detail-grid compact-detail-grid">
          <div><span>User</span><b>{order.erp_users?.username??'—'}</b></div>
          <div><span>Ngày đặt</span><b>{formatDateTime(order.order_date)}</b></div>
          <div><span>Trạng thái đơn</span><b>{order.archived_at?'Đã lưu trữ':statusLabel(order.order_status)}</b></div>
          <div><span>Thanh toán</span><b>{statusLabel(order.payment_status)}</b></div>
          <div><span>COD</span><b>{formatMoney(order.cod)}</b></div>
          <div><span>Tổng giá gốc</span><b>{formatMoney(totalOriginal)}</b></div>
          <div><span>Dịch vụ</span><b>{isExpress?'Hỏa tốc':'Tiêu chuẩn'}</b></div>
          <div><span>Nhận hàng</span><b>{statusLabel(order.receive_status)}</b></div>
          <div><span>Người nhận</span><b>{order.recipient_name??'—'}</b></div>
          <div><span>SĐT</span><b>{formatPhone(order.recipient_phone)}</b></div>
          <div className="full"><span>Địa chỉ</span><b>{order.recipient_address??'—'}</b></div>
          <div><span>Kho đích</span><b>{order.destination_hub??'—'}</b></div>
          <div><span>Mã vận đơn</span><b>{shipment?.tracking_number??'Chưa có'}</b></div>
          <div><span>ĐVVC</span><b>{isExpress?'Hỏa tốc':shipment?.carrier??'—'}</b></div>
          <div><span>Tracking</span><b>{isExpress?'Thủ công':statusLabel(shipment?.current_tracking_status)}</b></div>
          <div><span>Kho</span><b>{statusLabel(order.warehouse_status)}</b></div>
        </div>

        <div className="panel-section-head">
          <div><h3>Sản phẩm</h3><span>{items.length} dòng sản phẩm</span></div>
        </div>
        <div className="context-order-items">
          {!items.length
            ? <div className="empty compact">Đơn chưa có sản phẩm.</div>
            : items.map((it:any,i:number)=><div key={it.id??i}>
                <span><b>{it.product_name??'Sản phẩm'}</b><small>{[it.sku,it.variant].filter(Boolean).join(' · ')||'Không SKU'}</small></span>
                <span>×{it.quantity??1}</span>
                <strong>{formatMoney(it.final_price??it.original_price)}</strong>
              </div>)}
        </div>

        {voucherText&&<>
          <div className="panel-section-head"><div><h3>Voucher</h3></div></div>
          <VoucherTags value={voucherText}/>
        </>}

        <div className="context-order-module-link">
          <Link className="button small" href={openModuleHref}>Mở trong module Đơn ↗</Link>
        </div>
      </>}

      {activeTab==='tracking'&&<>
        <div className="panel-section-head">
          <div><h3>Vận đơn</h3><span>{order.shipments?.length??0} mã đã ghi nhận</span></div>
        </div>
        <div className="context-shipment-list">
          {!order.shipments?.length
            ? <div className="empty compact">Chưa có mã vận đơn.</div>
            : [...order.shipments].sort((a:any,b:any)=>Number(b.is_active)-Number(a.is_active)).map((s:any)=><div className={'shipment-box '+(s.is_active?'active-shipment':'')} key={s.id}>
                <div className="shipment-top">
                  <div><span className="muted">{s.carrier??'ĐVVC'} {s.is_active?'· ĐANG DÙNG':'· ĐÃ THAY'}</span><b>{s.tracking_number??'—'}</b></div>
                  <span className={'status-pill status-'+String(s.current_tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(s.current_tracking_status)}</span>
                </div>
                <div className="meta-row">
                  <span>Đồng bộ cuối: {formatDateTime(s.last_track_at)}</span>
                  <span>{s.is_active?'Kế tiếp: '+formatDateTime(s.next_track_at):'Thay lúc: '+formatDateTime(s.replaced_at)}</span>
                </div>
              </div>)}
        </div>

        <h3>Hành trình vận chuyển</h3>
        <div className="timeline">
          {!trackingEvents.length
            ? <div className="empty compact">Chưa có sự kiện vận chuyển.</div>
            : trackingEvents.map((e:any)=><div className="timeline-item" key={e.id}>
                <i></i><div>
                  <b>{statusLabel(e.normalized_status)}</b>
                  <span>{e.raw_description??e.raw_status??'—'}</span>
                  <small>{formatDateTime(e.event_time)}{e.raw_location?' · '+e.raw_location:''}</small>
                </div>
              </div>)}
        </div>
      </>}

      {activeTab==='history'&&<>
        <h3>Lịch sử hệ thống</h3>
        <div className="timeline">
          {!auditRows.length
            ? <div className="empty compact">Chưa có lịch sử hệ thống cho đơn này.</div>
            : auditRows.map((a:any)=><div className="timeline-item" key={a.id}>
                <i></i><div>
                  <b>{a.action??'CẬP NHẬT'}</b>
                  <span>{sourceLabel(a.source??a.module??'SYSTEM')}</span>
                  <small>{formatDateTime(a.created_at??a.time)}</small>
                </div>
              </div>)}
        </div>
      </>}

      <div className="panel-meta">Tạo đơn: {formatDateTime(order.created_at)}</div>
    </div>
  </SystemSlidebar>
}
