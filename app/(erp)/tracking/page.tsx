import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, sourceLabel, statusLabel } from '@/lib/format'
import { TrackingHubGroup } from '@/components/tracking-hub-group'

type SP={status?:string,receiveDate?:string,received?:string}

const rules=[
  ['READY_TO_SHIP','2 giờ','—'],
  ['PICKED_UP','2 giờ','—'],
  ['IN_TRANSIT','2 giờ','—'],
  ['ARRIVED_TRANSIT_HUB','2 giờ','—'],
  ['ARRIVED_DESTINATION_HUB','2 giờ','ĐƠN ĐẾN KHO'],
  ['OUT_FOR_DELIVERY','1 giờ','ĐƠN ĐANG GIAO'],
  ['DELIVERY_FAILED','2 giờ','GIAO KHÔNG THÀNH CÔNG'],
  ['RETURNING','2 giờ','HOÀN HÀNG'],
  ['DELIVERED','Dừng','GIAO THÀNH CÔNG'],
  ['CANCELLED','Dừng','—'],
  ['RETURNED','Dừng','—'],
]

function localDate(value?:string|null){
  if(!value)return ''
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return ''
  const p=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d)
  const x=Object.fromEntries(p.map(v=>[v.type,v.value])) as Record<string,string>
  return `${x.year}-${x.month}-${x.day}`
}

function productSummary(items:any[]){
  if(!items?.length)return '—'
  return items.map((x:any)=>{
    const name=[x.product_name,x.variant].filter(Boolean).join(' · ')
    return x.quantity&&x.quantity>1?`${name} ×${x.quantity}`:name
  }).filter(Boolean).join(', ')
}

export default async function TrackingPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()

  const [{data:shipmentData,error},{data:warehouses},{data:providers},{data:logs}]=await Promise.all([
    supabase.from('shipments').select(
      'id,order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,last_track_at,next_track_at,last_status_change_at,tracking_fail_count,queue_status,orders(id,shopee_order_id,destination_hub,cod,recipient_name,recipient_phone,recipient_address,receive_status,warehouse_status,order_date,order_items(product_name,variant,quantity))'
    ).eq('is_active',true).order('last_status_change_at',{ascending:false,nullsFirst:false}).limit(500),
    supabase.from('warehouses').select('id,code,name,is_active').eq('is_active',true).order('code'),
    supabase.from('tracking_provider_configs').select('carrier,enabled').order('carrier'),
    supabase.from('tracking_sync_logs').select('id,shipment_id,source,started_at,result,new_event_count,error_code,error_message').order('started_at',{ascending:false}).limit(10),
  ])

  let rows=(shipmentData??[]).map((s:any)=>{
    const o=s.orders??{}
    return {
      id:o.id??s.order_id,
      shopee_order_id:o.shopee_order_id,
      destination_hub:o.destination_hub??'Chưa xác định kho đích',
      cod:o.cod,
      recipient_name:o.recipient_name,
      recipient_phone:o.recipient_phone,
      recipient_address:o.recipient_address,
      receive_status:o.receive_status,
      warehouse_status:o.warehouse_status,
      order_date:o.order_date,
      product_summary:productSummary(o.order_items??[]),
      shipment_id:s.id,
      tracking_number:s.tracking_number,
      carrier:s.carrier,
      tracking_status:s.current_tracking_status,
      tracking_enabled:s.tracking_enabled,
      last_track_at:s.last_track_at,
      next_track_at:s.next_track_at,
      last_status_change_at:s.last_status_change_at,
      tracking_fail_count:s.tracking_fail_count,
      queue_status:s.queue_status,
    }
  })

  if(sp.status)rows=rows.filter((r:any)=>r.tracking_status===sp.status)
  if(sp.receiveDate)rows=rows.filter((r:any)=>localDate(r.last_status_change_at)===sp.receiveDate)

  const atHub=rows.filter((r:any)=>r.tracking_status==='ARRIVED_DESTINATION_HUB').length
  const outForDelivery=rows.filter((r:any)=>r.tracking_status==='OUT_FOR_DELIVERY').length
  const delivered=rows.filter((r:any)=>r.tracking_status==='DELIVERED').length
  const failed=rows.filter((r:any)=>r.tracking_status==='DELIVERY_FAILED').length
  const waiting=rows.filter((r:any)=>r.receive_status==='WAITING_RECEIVE').length

  const groups=new Map<string,any[]>()
  for(const r of rows){
    const key=r.destination_hub||'Chưa xác định kho đích'
    const arr=groups.get(key)??[]
    arr.push(r)
    groups.set(key,arr)
  }
  const grouped=[...groups.entries()].sort((a,b)=>{
    const aw=a[1].filter(x=>x.receive_status==='WAITING_RECEIVE').length
    const bw=b[1].filter(x=>x.receive_status==='WAITING_RECEIVE').length
    return bw-aw||b[1].length-a[1].length
  })

  return <>
    <header className="page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Cảnh báo vận chuyển</h1>
        <p>Theo dõi đơn theo kho đích, cảnh báo trạng thái và xác nhận nhận hàng tại một nơi</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/orders">Đơn nhập hàng</Link>
        <span className="badge green">HỆ THỐNG ĐANG CHẠY</span>
      </div>
    </header>

    {sp.received&&<div className="notice success"><b>Đã xác nhận nhận hàng.</b><span>Đơn đã chuyển sang trạng thái Đã nhận và sẵn sàng cho luồng kho.</span></div>}
    {error&&<div className="error-box">Không thể tải dữ liệu vận chuyển: {error.message}</div>}
    {!providers?.some(p=>p.enabled)&&<div className="notice warning"><b>Chưa có provider tracking đang bật.</b><span>Dữ liệu demo vẫn hiển thị; Manual Sync cần provider hợp lệ để gọi ra ngoài.</span></div>}

    <section className="tracking-alert-grid">
      <Link href="/purchase/tracking?status=ARRIVED_DESTINATION_HUB" className={`tracking-alert-card warning ${sp.status==='ARRIVED_DESTINATION_HUB'?'active':''}`}>
        <span>ĐƠN ĐẾN KHO</span><b>{atHub}</b><small>Đã đến kho đích</small>
      </Link>
      <Link href="/purchase/tracking?status=OUT_FOR_DELIVERY" className={`tracking-alert-card info ${sp.status==='OUT_FOR_DELIVERY'?'active':''}`}>
        <span>ĐƠN ĐANG GIAO</span><b>{outForDelivery}</b><small>Shipper đang giao</small>
      </Link>
      <Link href="/purchase/tracking?status=DELIVERED" className={`tracking-alert-card success ${sp.status==='DELIVERED'?'active':''}`}>
        <span>GIAO THÀNH CÔNG</span><b>{delivered}</b><small>{waiting} đơn đang chờ xác nhận nhận</small>
      </Link>
      <Link href="/purchase/tracking?status=DELIVERY_FAILED" className={`tracking-alert-card danger ${sp.status==='DELIVERY_FAILED'?'active':''}`}>
        <span>GIAO KHÔNG THÀNH CÔNG</span><b>{failed}</b><small>Cần theo dõi xử lý lại</small>
      </Link>
    </section>

    <div className="tracking-console-toolbar">
      <div className="tracking-console-title">
        <b>Console theo kho đích</b>
        <span>{rows.length} vận đơn · {grouped.length} kho đích</span>
      </div>
      <form action="/purchase/tracking" className="tracking-date-filter">
        {sp.status&&<input type="hidden" name="status" value={sp.status}/>}
        <label><span>Ngày trạng thái</span><input type="date" name="receiveDate" defaultValue={sp.receiveDate??''}/></label>
        <button className="button small">Lọc ngày</button>
        {(sp.status||sp.receiveDate)&&<Link className="button small" href="/purchase/tracking">Xóa lọc</Link>}
      </form>
    </div>

    <div className="tracking-hub-stack">
      {!grouped.length
        ? <div className="card empty">Không có vận đơn phù hợp với bộ lọc.</div>
        : grouped.map(([hub,groupRows])=><TrackingHubGroup key={hub} hub={hub} rows={groupRows as any[]} warehouses={(warehouses??[]) as any[]}/>)}
    </div>

    <section className="content-grid two tracking-technical-grid">
      <div className="card">
        <div className="card-head"><h2>Quy tắc theo dõi</h2><span className="badge">TỰ ĐỘNG</span></div>
        {rules.map(r=><div className="rule-row" key={r[0]}><span>{statusLabel(r[0])}</span><b>{r[1]}</b><small>{r[2]}</small></div>)}
        <div className="quiet-row">Giờ nghỉ tự động: <b>02:00 → 06:00</b> · Manual Sync vẫn hoạt động.</div>
      </div>
      <div className="card">
        <div className="card-head"><div><h2>Nhật ký đồng bộ gần nhất</h2><span className="muted">10 lần gần nhất</span></div></div>
        {!logs?.length
          ? <div className="empty compact">Chưa có lần đồng bộ.</div>
          : logs.map(l=><div className="log-row" key={l.id}><div><b>{sourceLabel(l.source)}</b><span>{formatDateTime(l.started_at)}</span></div><div><span className={`badge ${l.result==='SUCCESS'?'green':l.result==='FAILED'?'red':''}`}>{statusLabel(l.result??'RUNNING')}</span><small>{l.new_event_count??0} sự kiện</small></div></div>)}
      </div>
    </section>
  </>
}
