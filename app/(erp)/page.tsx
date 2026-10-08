import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { alertTypeLabel, formatDateTime, formatMoney, statusLabel } from '@/lib/format'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={range?:RangeKey,from?:string,to?:string}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function shiftLocalDay(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {from:shiftLocalDay(y,m,d,-daysFromMonday),to:shiftLocalDay(y,m,d,6-daysFromMonday)}
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){const x=currentWeekRange(p.year,p.month,p.day);from=x.from;to=x.to;label='Tuần này'}
  if(key==='7d'){from=shiftLocalDay(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDay(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){from=ymd(p.year,Math.floor((p.month-1)/3)*3+1,1);label='Quý này'}
  if(key==='year'){from=ymd(p.year,1,1);label='Năm nay'}
  if(key==='all'){from='1970-01-01';to='9999-12-31';label='Toàn thời gian'}
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {
    key,from,to,label,
    start:new Date(`${from}T00:00:00+07:00`).toISOString(),
    end:new Date(`${to}T23:59:59.999+07:00`).toISOString(),
  }
}
async function count(q:PromiseLike<{count:number|null}>){try{return (await q).count??0}catch{return 0}}

export default async function Dashboard({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const range=resolveRange(sp)
  const {supabase}=await requireUser()
  const now=new Date().toISOString()

  const [active,due,alerts,failed,orders,waiting,recentOrders,recentAlerts,warehouses]=await Promise.all([
    count(
      supabase.from('shipments')
        .select('id,orders!inner(order_date,archived_at)',{count:'exact',head:true})
        .eq('tracking_enabled',true)
        .eq('is_active',true)
        .is('orders.archived_at',null)
        .gte('orders.order_date',range.start)
        .lte('orders.order_date',range.end)
    ),
    count(
      supabase.from('shipments')
        .select('id,orders!inner(order_date,archived_at)',{count:'exact',head:true})
        .eq('tracking_enabled',true)
        .eq('is_active',true)
        .lte('next_track_at',now)
        .is('orders.archived_at',null)
        .gte('orders.order_date',range.start)
        .lte('orders.order_date',range.end)
    ),
    count(
      supabase.from('alert_events')
        .select('id,orders!inner(archived_at)',{count:'exact',head:true})
        .is('sent_at',null)
        .is('orders.archived_at',null)
        .gte('created_at',range.start)
        .lte('created_at',range.end)
    ),
    count(
      supabase.from('tracking_sync_logs')
        .select('*',{count:'exact',head:true})
        .eq('result','FAILED')
        .gte('started_at',range.start)
        .lte('started_at',range.end)
    ),
    count(
      supabase.from('orders')
        .select('*',{count:'exact',head:true})
        .is('archived_at',null)
        .gte('order_date',range.start)
        .lte('order_date',range.end)
    ),
    count(
      supabase.from('orders')
        .select('*',{count:'exact',head:true})
        .is('archived_at',null)
        .eq('receive_status','WAITING_RECEIVE')
        .gte('order_date',range.start)
        .lte('order_date',range.end)
    ),
    supabase.from('orders')
      .select('id,shopee_order_id,cod,destination_hub,receive_status,created_at,order_date,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active)')
      .is('archived_at',null)
      .gte('order_date',range.start)
      .lte('order_date',range.end)
      .order('order_date',{ascending:false})
      .limit(8),
    supabase.from('alert_events')
      .select('id,alert_type,destination_hub,created_at,sent_at,orders!inner(archived_at)')
      .is('orders.archived_at',null)
      .gte('created_at',range.start)
      .lte('created_at',range.end)
      .order('created_at',{ascending:false})
      .limit(5),
    count(supabase.from('warehouses').select('*',{count:'exact',head:true}).eq('is_active',true)),
  ])

  const urgent=(recentOrders.data??[]).map((o:any)=>{
    const shipment=(o.shipments??[]).find((s:any)=>s.is_active)??o.shipments?.[0]
    return {...o,shipment}
  }).filter((o:any)=>['ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED'].includes(o.shipment?.current_tracking_status)).slice(0,6)

  function scopedHref(path:string,extra:Record<string,string|undefined|null>={}){
    const params=new URLSearchParams()
    params.set('range',range.key)
    if(range.key==='custom'){params.set('from',range.from);params.set('to',range.to)}
    for(const [key,value] of Object.entries(extra)){
      if(value===undefined||value===null||value==='')params.delete(key)
      else params.set(key,value)
    }
    return path+'?'+params.toString()
  }

  return <>
    <header className="page-head"><div><h1>Tổng quan vận hành</h1><p>Tình trạng hoạt động của MYNH ERP</p></div><div className="head-actions"><Link className="button" href={scopedHref('/purchase/tracking')}>Theo dõi vận chuyển</Link><Link className="button primary" href={scopedHref('/purchase/orders',{mode:'create'})}>+ Tạo đơn</Link></div></header>

    <div className="dashboard-range-contract">
      <PurchaseDateFilter activeRange={range.key} from={range.from} to={range.to} label={range.label} basePath="/" showAll/>
      <div className="command-health"><span>● Dữ liệu đã kết nối</span><span>Giờ nghỉ tự động 02:00–06:00</span><span>Lịch tự động mỗi phút</span></div>
    </div>

    <section className="kpi-grid">
      <Link href={scopedHref('/purchase/orders')} className="kpi-card"><span>Tổng đơn</span><b>{orders}</b><small>{range.label}</small></Link>
      <Link href={scopedHref('/purchase/tracking')} className="kpi-card"><span>Đang theo dõi</span><b>{active}</b><small>Vận đơn thuộc đơn trong phạm vi</small></Link>
      <Link href={scopedHref('/purchase/tracking',{due:'1'})} className="kpi-card warning"><span>Đến hạn cập nhật</span><b>{due}</b><small>Cần đồng bộ trạng thái vận chuyển</small></Link>
      <Link href={scopedHref('/purchase/orders',{receive:'WAITING_RECEIVE'})} className="kpi-card"><span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đã giao nhưng chưa xác nhận nhận hàng</small></Link>
      <Link href={scopedHref('/purchase/tracking')} className="kpi-card"><span>Cảnh báo chờ xử lý</span><b>{alerts}</b><small>Phát sinh trong {range.label.toLowerCase()}</small></Link>
      <Link href={scopedHref('/purchase/tracking')} className="kpi-card danger"><span>Lỗi đồng bộ</span><b>{failed}</b><small>Phát sinh trong {range.label.toLowerCase()}</small></Link>
    </section>

    <section className="dashboard-ops-grid">
      <div className="card dashboard-orders"><div className="card-head"><div><h2>Đơn cần xử lý ngay</h2><span className="muted">Chuyển trạng thái vận chuyển và nghiệp vụ nhận hàng</span></div><span className="badge">{urgent.length} đơn</span></div><div className="dashboard-table-wrap"><table className="table"><thead><tr><th>Mã đơn</th><th>Mã vận đơn</th><th>Trạng thái</th><th>Kho đích</th><th>Tiền thu hộ</th></tr></thead><tbody>{!urgent.length?<tr><td colSpan={5} className="empty">Không có đơn cần xử lý ngay.</td></tr>:urgent.map((o:any)=><tr key={o.id}><td><Link className="table-link" href={`/purchase/orders?order=${o.id}`}>{o.shopee_order_id??o.id.slice(0,8)}</Link></td><td>{o.shipment?.tracking_number??'—'}</td><td><span className={`status-pill status-${String(o.shipment?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(o.shipment?.current_tracking_status)}</span></td><td>{o.destination_hub??'—'}</td><td className="money">{formatMoney(o.cod)}</td></tr>)}</tbody></table></div><div className="dashboard-footer"><span>Phạm vi: {range.label}</span><Link href={scopedHref('/purchase/orders')}>Xem tất cả đơn</Link></div></div>

      <div className="dashboard-side-stack">
        <div className="card"><div className="card-head"><div><h2>Tình trạng tự động</h2><span className="muted">{range.label}</span></div></div><div className="ops-row"><span>Vận đơn đến hạn</span><b>{due}</b></div><div className="ops-row"><span>Lỗi đồng bộ</span><b>{failed}</b></div><div className="ops-row"><span>Kho đang hoạt động</span><b>{warehouses}</b></div><div className="ops-row"><span>Giờ nghỉ</span><b>02:00–06:00</b></div></div>
        <div className="card"><div className="card-head"><div><h2>Cảnh báo mới</h2><span className="muted">{range.label}</span></div></div>{!recentAlerts.data?.length?<div className="empty compact">Chưa có cảnh báo.</div>:recentAlerts.data.map((a:any)=><div className="alert-preview-row" key={a.id}><div><b>{alertTypeLabel(a.alert_type)}</b><span>{a.destination_hub??'Chưa rõ kho'}</span></div><small>{formatDateTime(a.created_at)}</small></div>)}</div>
      </div>
    </section>

    <section className="summary-strip"><div><span>Đơn chờ nhận</span><b>{waiting}</b></div><div><span>Cảnh báo chưa gửi</span><b>{alerts}</b></div><div><span>Đang theo dõi</span><b>{active}</b></div><div><span>Đến hạn cập nhật</span><b>{due}</b></div><div><span>Kho hoạt động</span><b>{warehouses}</b></div></section>
  </>
}
