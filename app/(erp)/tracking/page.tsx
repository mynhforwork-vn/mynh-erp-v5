import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, sourceLabel, statusLabel } from '@/lib/format'
import { ManualSyncButton } from '@/components/manual-sync-button'

const rules=[
  ['READY_TO_SHIP','2 giờ','—'],
  ['PICKED_UP','2 giờ','—'],
  ['IN_TRANSIT','2 giờ','—'],
  ['ARRIVED_DESTINATION_HUB','2 giờ','ĐƠN ĐẾN KHO'],
  ['OUT_FOR_DELIVERY','1 giờ','ĐƠN ĐANG GIAO'],
  ['DELIVERY_FAILED','2 giờ','GIAO KHÔNG THÀNH CÔNG'],
  ['DELIVERED','Dừng','GIAO THÀNH CÔNG'],
  ['CANCELLED','Dừng','—'],
  ['RETURNED','Dừng','—'],
]

export default async function TrackingPage({searchParams}:{searchParams:Promise<{due?:string}>}){
 const sp=await searchParams; const {supabase}=await requireUser(); const now=new Date().toISOString()
 let q=supabase.from('shipments').select('id,order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,last_track_at,next_track_at,tracking_fail_count,queue_status,locked_until,orders(shopee_order_id,destination_hub)').eq('is_active',true).order('next_track_at',{ascending:true,nullsFirst:false}).limit(100)
 if(sp.due==='1')q=q.eq('tracking_enabled',true).lte('next_track_at',now)
 const [{data,error},{data:providers},{data:logs}]=await Promise.all([q,supabase.from('tracking_provider_configs').select('carrier,enabled,adapter_type,http_method,timeout_ms').order('carrier'),supabase.from('tracking_sync_logs').select('id,shipment_id,source,started_at,completed_at,result,new_event_count,error_code,error_message').order('started_at',{ascending:false}).limit(15)])
 const rows=(data??[]) as any[]
 return <>
   <header className="page-head"><div><h1>Cảnh báo vận chuyển</h1><p>Theo dõi trạng thái, cảnh báo theo kho đích và hỗ trợ xác nhận nhận hàng</p></div><div className="head-actions"><span className="badge green">ĐANG HOẠT ĐỘNG</span></div></header>
   <section className="content-grid three"><div className="card metric"><span>Vận đơn hiển thị</span><b>{rows.length}</b></div><div className="card metric"><span>Đơn vị kết nối đang bật</span><b>{providers?.filter(p=>p.enabled).length??0}</b></div><div className="card metric"><span>Nhật ký đồng bộ gần nhất</span><b>{logs?.length??0}</b></div></section>
   {!providers?.length&&<div className="notice warning"><b>Chưa cấu hình đơn vị theo dõi vận chuyển.</b><span>Lịch tự động và bộ máy theo dõi đã sẵn sàng nhưng chưa gọi ra ngoài cho đến khi có cấu hình hợp lệ.</span></div>}
   <div className="card table-card"><div className="card-head"><h2>{sp.due==='1'?'Các vận đơn đến hạn':'Hàng đợi theo dõi vận chuyển'}</h2><span className="muted">Tối đa 100 dòng</span></div><table className="table"><thead><tr><th>Mã đơn</th><th>Mã vận đơn</th><th>Đơn vị vận chuyển</th><th>Trạng thái</th><th>Cập nhật cuối</th><th>Lần kế tiếp</th><th>Hàng đợi</th><th>Lỗi</th><th>Xử lý</th></tr></thead><tbody>{error?<tr><td colSpan={9} className="error-text">Không thể tải hàng đợi vận chuyển.</td></tr>:!rows.length?<tr><td colSpan={9} className="empty">Không có vận đơn phù hợp.</td></tr>:rows.map(s=><tr key={s.id}><td>{s.orders?.shopee_order_id??s.order_id.slice(0,8)}</td><td className="strong">{s.tracking_number}</td><td>{s.carrier??'—'}</td><td><span className={`status-pill status-${String(s.current_tracking_status).toLowerCase()}`}>{statusLabel(s.current_tracking_status)}</span></td><td>{formatDateTime(s.last_track_at)}</td><td>{formatDateTime(s.next_track_at)}</td><td>{statusLabel(s.queue_status)}</td><td>{s.tracking_fail_count}</td><td>{!['DELIVERED','CANCELLED','RETURNED'].includes(s.current_tracking_status)&&<ManualSyncButton shipmentId={s.id}/>}</td></tr>)}</tbody></table></div>
   <section className="content-grid two"><div className="card"><div className="card-head"><h2>Quy tắc theo dõi</h2><span className="badge">QUY TẮC CHÍNH THỨC</span></div>{rules.map(r=><div className="rule-row" key={r[0]}><span>{statusLabel(r[0])}</span><b>{r[1]}</b><small>{r[2]}</small></div>)}<div className="quiet-row">Giờ nghỉ tự động: <b>02:00 → 06:00</b></div></div><div className="card"><div className="card-head"><h2>Nhật ký đồng bộ gần nhất</h2></div>{!logs?.length?<div className="empty compact">Chưa có lần đồng bộ.</div>:logs.map(l=><div className="log-row" key={l.id}><div><b>{sourceLabel(l.source)}</b><span>{formatDateTime(l.started_at)}</span></div><div><span className={`badge ${l.result==='SUCCESS'?'green':l.result==='FAILED'?'red':''}`}>{statusLabel(l.result??'RUNNING')}</span><small>{l.new_event_count??0} sự kiện</small></div></div>)}</div></section>
 </>
}
