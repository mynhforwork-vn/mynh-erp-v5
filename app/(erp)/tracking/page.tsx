import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, sourceLabel, statusLabel } from '@/lib/format'
import { TrackingHubGroup } from '@/components/tracking-hub-group'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={
  status?:string
  receive?:string
  receiveDate?:string
  received?:string
  payment?:string
  range?:RangeKey
  from?:string
  to?:string
}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function shiftLocalDay(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {
    from:shiftLocalDay(y,m,d,-daysFromMonday),
    to:shiftLocalDay(y,m,d,6-daysFromMonday),
  }
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){
    const week=currentWeekRange(p.year,p.month,p.day)
    from=week.from
    to=week.to
    label='Tuần này'
  }
  if(key==='7d'){from=shiftLocalDay(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDay(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){
    const qStart=Math.floor((p.month-1)/3)*3+1
    from=ymd(p.year,qStart,1)
    label='Quý này'
  }
  if(key==='year'){
    from=ymd(p.year,1,1)
    label='Năm nay'
  }
  if(key==='all'){
    from='1970-01-01'
    to='9999-12-31'
    label='Toàn thời gian'
  }
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {
    key,from,to,label,
    start:new Date(`${from}T00:00:00+07:00`).getTime(),
    end:new Date(`${to}T23:59:59.999+07:00`).getTime(),
    startIso:new Date(`${from}T00:00:00+07:00`).toISOString(),
    endIso:new Date(`${to}T23:59:59.999+07:00`).toISOString(),
  }
}

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
  const range=resolveRange(sp)
  const {supabase}=await requireUser()

  const [
    {data:shipmentData,error},
    {data:warehouses},
    {data:providers},
    {data:logs},
    {data:paymentRows},
    {data:hubConfigs},
  ]=await Promise.all([
    supabase.from('shipments').select(
      'id,order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,last_track_at,next_track_at,last_status_change_at,tracking_fail_count,queue_status,orders(id,shopee_order_id,destination_hub,cod,recipient_name,recipient_phone,recipient_address,receive_status,warehouse_status,order_date,shipping_service,order_items(product_name,variant,quantity))'
    ).eq('is_active',true).order('last_status_change_at',{ascending:false,nullsFirst:false}).limit(2000),
    supabase.from('warehouses').select('id,code,name,is_active').eq('is_active',true).order('code'),
    supabase.from('tracking_provider_configs').select('carrier,enabled').order('carrier'),
    supabase.from('tracking_sync_logs').select('id,shipment_id,source,started_at,result,new_event_count,error_code,error_message').order('started_at',{ascending:false}).limit(8),
    supabase.from('shipper_payments')
      .select('id,shipper_name,total_cod,actual_transferred,tip,transferred_at,warehouses(code,name),shipper_payment_details(order_id)')
      .gte('transferred_at',range.startIso)
      .lte('transferred_at',range.endIso)
      .order('transferred_at',{ascending:false})
      .limit(8),
    supabase.from('destination_hub_configs')
      .select('hub_code,shipper_name,shipper_phone,is_active')
      .eq('is_active',true)
      .limit(500),
  ])

  const allRows=(shipmentData??[]).map((s:any)=>{
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

  const rangeRows=allRows.filter((r:any)=>{
    const t=new Date(r.order_date).getTime()
    return Number.isFinite(t)&&t>=range.start&&t<=range.end
  })

  const atHub=rangeRows.filter((r:any)=>r.tracking_status==='ARRIVED_DESTINATION_HUB').length
  const outForDelivery=rangeRows.filter((r:any)=>r.tracking_status==='OUT_FOR_DELIVERY').length
  const delivered=rangeRows.filter((r:any)=>r.tracking_status==='DELIVERED').length
  const failed=rangeRows.filter((r:any)=>r.tracking_status==='DELIVERY_FAILED').length
  const waitingRows=rangeRows.filter((r:any)=>r.receive_status==='WAITING_RECEIVE')
  const waiting=waitingRows.length
  const waitingCod=waitingRows.reduce((sum:number,r:any)=>sum+Number(r.cod??0),0)
  const waitingHubCount=new Set(waitingRows.map((r:any)=>r.destination_hub).filter(Boolean)).size

  let rows=[...rangeRows]
  if(sp.status)rows=rows.filter((r:any)=>r.tracking_status===sp.status)
  if(sp.receive)rows=rows.filter((r:any)=>r.receive_status===sp.receive)
  if(sp.receiveDate)rows=rows.filter((r:any)=>localDate(r.last_status_change_at)===sp.receiveDate)

  function trackingHref(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){
      p.set('from',range.from)
      p.set('to',range.to)
    }
    if(sp.status)p.set('status',sp.status)
    if(sp.receive)p.set('receive',sp.receive)
    if(sp.receiveDate)p.set('receiveDate',sp.receiveDate)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    return '/purchase/tracking?'+p.toString()
  }

  function moduleHref(path:string,extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){
      p.set('from',range.from)
      p.set('to',range.to)
    }
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    return path+'?'+p.toString()
  }

  const contextParams=new URLSearchParams()
  contextParams.set('range',range.key)
  if(range.key==='custom'){
    contextParams.set('from',range.from)
    contextParams.set('to',range.to)
  }
  const contextQuery=contextParams.toString()

  const hubConfigMap=new Map(
    (hubConfigs??[]).map((h:any)=>[String(h.hub_code),h])
  )

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
        <p>Console nhận hàng theo kho đích · Tracking · đối soát và chuyển tiền Shipper</p>
      </div>
      <div className="head-actions">
        <Link className="button" href={moduleHref('/purchase/orders')}>Đơn nhập hàng</Link>
        <span className="badge green">HỆ THỐNG ĐANG CHẠY</span>
      </div>
    </header>

    <PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      basePath="/purchase/tracking"
      showAll
    />

    {sp.received&&<div className="notice success"><b>Đã xác nhận nhận hàng.</b><span>Đơn đã chuyển sang trạng thái Đã nhận và sẵn sàng cho luồng kho.</span></div>}
    {sp.payment&&<div className="notice success"><b>Đã ghi nhận chuyển tiền Shipper.</b><span>Đợt thanh toán đã lưu kèm chi tiết từng đơn và Tip tự động.</span></div>}
    {error&&<div className="error-box">Không thể tải dữ liệu vận chuyển: {error.message}</div>}
    {!providers?.some(p=>p.enabled)&&<div className="notice warning"><b>Chưa có provider tracking đang bật.</b><span>Dữ liệu demo vẫn hiển thị; Manual Sync cần provider hợp lệ để gọi ra ngoài.</span></div>}

    <section className="tracking-command-kpis">
      <Link href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE',receiveDate:null})} className="tracking-command-card primary">
        <span>CHỜ NHẬN HÀNG</span><b>{waiting}</b><small>{formatMoney(waitingCod)} · {waitingHubCount} kho đích</small>
      </Link>
      <Link href={trackingHref({status:'ARRIVED_DESTINATION_HUB',receive:null,receiveDate:null})} className="tracking-command-card warning">
        <span>ĐƠN ĐẾN KHO</span><b>{atHub}</b><small>Đã đến kho đích</small>
      </Link>
      <Link href={trackingHref({status:'OUT_FOR_DELIVERY',receive:null,receiveDate:null})} className="tracking-command-card info">
        <span>ĐANG GIAO</span><b>{outForDelivery}</b><small>Shipper đang giao</small>
      </Link>
      <Link href={trackingHref({status:'DELIVERED',receive:null,receiveDate:null})} className="tracking-command-card success">
        <span>GIAO THÀNH CÔNG</span><b>{delivered}</b><small>{waiting} đơn chưa xác nhận nhận</small>
      </Link>
      <Link href={trackingHref({status:'DELIVERY_FAILED',receive:null,receiveDate:null})} className="tracking-command-card danger">
        <span>GIAO KHÔNG THÀNH CÔNG</span><b>{failed}</b><small>Cần xử lý lại</small>
      </Link>
    </section>

    <section className="tracking-receive-focus">
      <div>
        <span className="module-eyebrow">NHẬN HÀNG & THANH TOÁN SHIPPER</span>
        <h2>{waiting} đơn giao thành công đang chờ nhận</h2>
        <p>Chọn nhiều đơn trong cùng kho đích → Tổng COD tự cộng → nhập Tổng tiền thực chuyển → hệ thống tự tính Tip và lưu một đợt thanh toán có chi tiết từng đơn.</p>
      </div>
      <div className="tracking-receive-focus-metrics">
        <div><span>COD chờ nhận</span><b>{formatMoney(waitingCod)}</b></div>
        <div><span>Kho đích</span><b>{waitingHubCount}</b></div>
      </div>
      <Link className="button primary" href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE',receiveDate:null})}>Chỉ xem đơn chờ nhận</Link>
    </section>

    <div className="tracking-console-toolbar redesigned">
      <div className="tracking-console-title">
        <b>Console theo kho đích</b>
        <span>{rows.length} vận đơn · {grouped.length} kho đích · {range.label}</span>
      </div>
      <div className="tracking-filter-segments">
        <Link className={!sp.status&&!sp.receive?'active':''} href={trackingHref({status:null,receive:null,receiveDate:null})}>Tất cả</Link>
        <Link className={sp.receive==='WAITING_RECEIVE'?'active':''} href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE',receiveDate:null})}>Chờ nhận</Link>
        <Link className={sp.status==='ARRIVED_DESTINATION_HUB'?'active':''} href={trackingHref({status:'ARRIVED_DESTINATION_HUB',receive:null,receiveDate:null})}>Đến kho</Link>
        <Link className={sp.status==='OUT_FOR_DELIVERY'?'active':''} href={trackingHref({status:'OUT_FOR_DELIVERY',receive:null,receiveDate:null})}>Đang giao</Link>
        <Link className={sp.status==='DELIVERY_FAILED'?'active':''} href={trackingHref({status:'DELIVERY_FAILED',receive:null,receiveDate:null})}>Giao lỗi</Link>
      </div>
      <form action="/purchase/tracking" className="tracking-date-filter">
        <input type="hidden" name="range" value={range.key}/>
        {range.key==='custom'&&<><input type="hidden" name="from" value={range.from}/><input type="hidden" name="to" value={range.to}/></>}
        {sp.status&&<input type="hidden" name="status" value={sp.status}/>}
        {sp.receive&&<input type="hidden" name="receive" value={sp.receive}/>}
        <label><span>Ngày trạng thái</span><input type="date" name="receiveDate" defaultValue={sp.receiveDate??''}/></label>
        <button className="button small">Lọc</button>
        {(sp.status||sp.receive||sp.receiveDate)&&<Link className="button small" href={trackingHref({status:null,receive:null,receiveDate:null,received:null,payment:null})}>Xóa lọc</Link>}
      </form>
    </div>

    <div className="tracking-hub-stack">
      {!grouped.length
        ? <div className="card empty">Không có vận đơn phù hợp với bộ lọc.</div>
        : grouped.map(([hub,groupRows])=><TrackingHubGroup
            key={hub}
            hub={hub}
            rows={groupRows as any[]}
            warehouses={(warehouses??[]) as any[]}
            assignedShipper={hubConfigMap.get(hub) as any}
            contextQuery={contextQuery}
          />)}
    </div>

    <section className="tracking-bottom-grid">
      <div className="card">
        <div className="card-head">
          <div><h2>Đợt chuyển Shipper gần nhất</h2><span className="muted">Mỗi đợt có thể gồm nhiều đơn</span></div>
          <Link className="button small" href="/finance/shipper-payments">Xem thanh toán</Link>
        </div>
        {!paymentRows?.length
          ? <div className="empty compact">Chưa có đợt chuyển Shipper trong khoảng đang xem.</div>
          : paymentRows.map((p:any)=><div className="shipper-payment-history-row" key={p.id}>
              <div>
                <b>{p.shipper_name??'Shipper'}</b>
                <span>{p.shipper_payment_details?.length??0} đơn · {(p.warehouses as any)?.code??'—'}</span>
              </div>
              <div>
                <b>{formatMoney(p.actual_transferred)}</b>
                <span>COD {formatMoney(p.total_cod)} · Tip {formatMoney(p.tip)}</span>
              </div>
              <small>{formatDateTime(p.transferred_at)}</small>
            </div>)}
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Nhật ký Tracking</h2><span className="muted">8 lần đồng bộ gần nhất</span></div>
          <span className="badge">{providers?.filter(p=>p.enabled).length??0} provider bật</span>
        </div>
        {!logs?.length
          ? <div className="empty compact">Chưa có lần đồng bộ.</div>
          : logs.map(l=><div className="log-row" key={l.id}>
              <div><b>{sourceLabel(l.source)}</b><span>{formatDateTime(l.started_at)}</span></div>
              <div><span className={`badge ${l.result==='SUCCESS'?'green':l.result==='FAILED'?'red':''}`}>{statusLabel(l.result??'RUNNING')}</span><small>{l.new_event_count??0} sự kiện</small></div>
            </div>)}
      </div>
    </section>
  </>
}
