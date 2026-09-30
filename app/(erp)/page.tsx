import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { alertTypeLabel, formatDateTime, formatMoney, statusLabel } from '@/lib/format'

async function count(q:PromiseLike<{count:number|null}>){try{return (await q).count??0}catch{return 0}}

export default async function Dashboard(){
  const {supabase}=await requireUser(); const now=new Date().toISOString()
  const [active,due,alerts,failed,orders,waiting,recentOrders,recentAlerts,warehouses]=await Promise.all([
    count(supabase.from('shipments').select('*',{count:'exact',head:true}).eq('tracking_enabled',true).eq('is_active',true)),
    count(supabase.from('shipments').select('*',{count:'exact',head:true}).eq('tracking_enabled',true).lte('next_track_at',now)),
    count(supabase.from('alert_events').select('id,orders!inner(archived_at)',{count:'exact',head:true}).is('sent_at',null).is('orders.archived_at',null)),
    count(supabase.from('tracking_sync_logs').select('*',{count:'exact',head:true}).eq('result','FAILED')),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).is('archived_at',null)),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).is('archived_at',null).eq('receive_status','WAITING_RECEIVE')),
    supabase.from('orders').select('id,shopee_order_id,cod,destination_hub,receive_status,created_at,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active)').is('archived_at',null).order('created_at',{ascending:false}).limit(8),
    supabase.from('alert_events').select('id,alert_type,destination_hub,created_at,sent_at,orders!inner(archived_at)').is('orders.archived_at',null).order('created_at',{ascending:false}).limit(5),
    count(supabase.from('warehouses').select('*',{count:'exact',head:true}).eq('is_active',true)),
  ])

  const urgent=(recentOrders.data??[]).map((o:any)=>{
    const shipment=(o.shipments??[]).find((s:any)=>s.is_active)??o.shipments?.[0]
    return {...o,shipment}
  }).filter((o:any)=>['ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED'].includes(o.shipment?.current_tracking_status)).slice(0,6)

  return <>
    <header className="page-head"><div><h1>Tổng quan vận hành</h1><p>Tình trạng hoạt động của MYNH ERP</p></div><div className="head-actions"><Link className="button" href="/purchase/tracking">Theo dõi vận chuyển</Link><Link className="button primary" href="/purchase/orders?mode=create">+ Tạo đơn</Link></div></header>

    <div className="command-bar"><div className="command-range"><span className="active">Hôm nay</span><span>7 ngày</span><span>30 ngày</span><span>Tháng này</span><span>Tùy chọn</span></div><div className="command-health"><span>● Dữ liệu đã kết nối</span><span>Giờ nghỉ tự động 02:00–06:00</span><span>Lịch tự động mỗi phút</span></div></div>

    <section className="kpi-grid">
      <Link href="/purchase/orders" className="kpi-card"><span>Tổng đơn</span><b>{orders}</b><small>Đơn hàng đang lưu trong hệ thống</small></Link>
      <Link href="/purchase/tracking" className="kpi-card"><span>Đang theo dõi</span><b>{active}</b><small>Vận đơn đang tự động cập nhật</small></Link>
      <Link href="/purchase/tracking?due=1" className="kpi-card warning"><span>Đến hạn cập nhật</span><b>{due}</b><small>Cần đồng bộ trạng thái vận chuyển</small></Link>
      <Link href="/purchase/orders?receive=WAITING_RECEIVE" className="kpi-card"><span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đã giao nhưng chưa xác nhận nhận hàng</small></Link>
      <Link href="/purchase/tracking" className="kpi-card"><span>Cảnh báo chờ xử lý</span><b>{alerts}</b><small>Cảnh báo chưa đánh dấu đã gửi</small></Link>
      <Link href="/purchase/tracking" className="kpi-card danger"><span>Lỗi đồng bộ</span><b>{failed}</b><small>Cần kiểm tra nhật ký cập nhật</small></Link>
    </section>

    <section className="dashboard-ops-grid">
      <div className="card dashboard-orders"><div className="card-head"><div><h2>Đơn cần xử lý ngay</h2><span className="muted">Chuyển trạng thái vận chuyển và nghiệp vụ nhận hàng</span></div><span className="badge">{urgent.length} đơn</span></div><div className="dashboard-table-wrap"><table className="table"><thead><tr><th>Mã đơn</th><th>Mã vận đơn</th><th>Trạng thái</th><th>Kho đích</th><th>Tiền thu hộ</th></tr></thead><tbody>{!urgent.length?<tr><td colSpan={5} className="empty">Không có đơn cần xử lý ngay.</td></tr>:urgent.map((o:any)=><tr key={o.id}><td><Link className="table-link" href={`/purchase/orders?order=${o.id}`}>{o.shopee_order_id??o.id.slice(0,8)}</Link></td><td>{o.shipment?.tracking_number??'—'}</td><td><span className={`status-pill status-${String(o.shipment?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(o.shipment?.current_tracking_status)}</span></td><td>{o.destination_hub??'—'}</td><td className="money">{formatMoney(o.cod)}</td></tr>)}</tbody></table></div><div className="dashboard-footer"><span>Ưu tiên: Đang giao → Đến kho đích → Giao thất bại → Chờ nhận</span><Link href="/purchase/orders">Xem tất cả đơn</Link></div></div>

      <div className="dashboard-side-stack">
        <div className="card"><div className="card-head"><div><h2>Tình trạng tự động</h2><span className="muted">Theo dõi hệ thống</span></div></div><div className="ops-row"><span>Vận đơn đến hạn</span><b>{due}</b></div><div className="ops-row"><span>Lỗi đồng bộ</span><b>{failed}</b></div><div className="ops-row"><span>Kho đang hoạt động</span><b>{warehouses}</b></div><div className="ops-row"><span>Giờ nghỉ</span><b>02:00–06:00</b></div></div>
        <div className="card"><div className="card-head"><div><h2>Cảnh báo mới</h2><span className="muted">Theo chuyển trạng thái, không gửi lặp</span></div></div>{!recentAlerts.data?.length?<div className="empty compact">Chưa có cảnh báo.</div>:recentAlerts.data.map((a:any)=><div className="alert-preview-row" key={a.id}><div><b>{alertTypeLabel(a.alert_type)}</b><span>{a.destination_hub??'Chưa rõ kho'}</span></div><small>{formatDateTime(a.created_at)}</small></div>)}</div>
      </div>
    </section>

    <section className="summary-strip"><div><span>Đơn chờ nhận</span><b>{waiting}</b></div><div><span>Cảnh báo chưa gửi</span><b>{alerts}</b></div><div><span>Đang theo dõi</span><b>{active}</b></div><div><span>Đến hạn cập nhật</span><b>{due}</b></div><div><span>Kho hoạt động</span><b>{warehouses}</b></div></section>
  </>
}
