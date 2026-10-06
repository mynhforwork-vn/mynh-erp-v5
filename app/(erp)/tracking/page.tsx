import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, sourceLabel, statusLabel } from '@/lib/format'
import { TrackingHubGroup } from '@/components/tracking-hub-group'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import { ContextOrderPanel } from '@/components/context-order-panel'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={
  status?:string
  receive?:string
  receiveDate?:string
  received?:string
  payment?:string
  hub?:string
  range?:RangeKey
  from?:string
  to?:string
  order?:string
  orderTab?:'info'|'tracking'|'history'
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
    {data:destinationShippers},
    {data:hubShipperAssignments},
    {data:warehouseSettings},
  ]=await Promise.all([
    supabase.from('shipments').select(
      'id,order_id,tracking_number,carrier,is_active,tracking_enabled,current_tracking_status,last_track_at,next_track_at,last_status_change_at,tracking_fail_count,queue_status,orders(id,shopee_order_id,destination_hub,cod,recipient_name,recipient_phone,recipient_address,receive_status,warehouse_status,order_date,shipping_service,order_status,archived_at,order_items(product_name,variant,quantity))'
    ).eq('is_active',true).order('last_status_change_at',{ascending:false,nullsFirst:false}).limit(2000),
    supabase.from('warehouses').select('id,code,name,address,is_active').eq('is_active',true).order('code'),
    supabase.from('tracking_provider_configs').select('carrier,enabled').order('carrier'),
    supabase.from('tracking_sync_logs').select('id,shipment_id,source,started_at,result,new_event_count,error_code,error_message').order('started_at',{ascending:false}).limit(8),
    supabase.from('shipper_payments')
      .select('id,destination_hub,shipper_name,total_cod,actual_transferred,tip,transferred_at,warehouses(code,name),shipper_payment_details(order_id)')
      .gte('transferred_at',range.startIso)
      .lte('transferred_at',range.endIso)
      .order('transferred_at',{ascending:false})
      .limit(8),
    supabase.from('destination_hub_configs')
      .select('id,hub_code,is_active')
      .eq('is_active',true)
      .limit(500),
    supabase.from('destination_shippers')
      .select('id,name,phone,is_active')
      .eq('is_active',true)
      .order('name',{ascending:true})
      .limit(500),
    supabase.from('destination_hub_shipper_assignments')
      .select('hub_config_id,shipper_id,priority,is_active')
      .eq('is_active',true)
      .order('priority',{ascending:true})
      .limit(2000),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id')
      .eq('id','main')
      .maybeSingle(),
  ])

  const allRows=(shipmentData??[]).filter((s:any)=>!s.orders?.archived_at).map((s:any)=>{
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
      order_status:o.order_status,
      shipping_service:o.shipping_service,
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

  const operationalRows=allRows.filter((r:any)=>{
    const orderStatus=String(r.order_status??'').toUpperCase()
    if(r.shipping_service==='EXPRESS')return false
    if(r.receive_status==='RECEIVED')return false
    if(r.tracking_status==='CANCELLED')return false
    if(orderStatus==='CANCELLED'||orderStatus==='CANCELED')return false
    return true
  })

  const rangeRows=operationalRows.filter((r:any)=>{
    const t=new Date(r.order_date).getTime()
    return Number.isFinite(t)&&t>=range.start&&t<=range.end
  })

  const hubOptions=[...new Set(rangeRows.map((r:any)=>String(r.destination_hub??'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'))
  const hubRows=sp.hub?rangeRows.filter((r:any)=>r.destination_hub===sp.hub):rangeRows

  const atHub=hubRows.filter((r:any)=>r.tracking_status==='ARRIVED_DESTINATION_HUB').length
  const outForDelivery=hubRows.filter((r:any)=>r.tracking_status==='OUT_FOR_DELIVERY').length
  const delivered=hubRows.filter((r:any)=>r.tracking_status==='DELIVERED').length
  const failed=hubRows.filter((r:any)=>r.tracking_status==='DELIVERY_FAILED').length
  const waitingRows=hubRows.filter((r:any)=>r.receive_status==='WAITING_RECEIVE')
  const waiting=waitingRows.length
  const waitingCod=waitingRows.reduce((sum:number,r:any)=>sum+Number(r.cod??0),0)
  const waitingHubCount=new Set(waitingRows.map((r:any)=>r.destination_hub).filter(Boolean)).size

  let rows=[...hubRows]
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
    if(sp.hub)p.set('hub',sp.hub)
    if(sp.order)p.set('order',sp.order)
    if(sp.orderTab)p.set('orderTab',sp.orderTab)
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
  if(sp.hub)contextParams.set('hub',sp.hub)
  if(sp.status)contextParams.set('status',sp.status)
  if(sp.receive)contextParams.set('receive',sp.receive)
  if(sp.receiveDate)contextParams.set('receiveDate',sp.receiveDate)
  const contextQuery=contextParams.toString()

  const shipperMap=new Map((destinationShippers??[]).map((s:any)=>[String(s.id),s]))
  const assignmentByHub=new Map<string,any[]>()
  for(const a of (hubShipperAssignments??[]) as any[]){
    const list=assignmentByHub.get(String(a.hub_config_id))??[]
    const shipper=shipperMap.get(String(a.shipper_id))
    if(shipper)list.push(shipper)
    assignmentByHub.set(String(a.hub_config_id),list)
  }
  const hubShipperMap=new Map(
    (hubConfigs??[]).map((h:any)=>[
      String(h.hub_code),
      assignmentByHub.get(String(h.id))??[],
    ])
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

  let contextOrder:any=null
  let contextItems:any[]=[]
  let contextVouchers:any[]=[]
  let contextTrackingEvents:any[]=[]
  let contextAuditRows:any[]=[]
  if(sp.order){
    const [orderResult,itemResult,voucherResult]=await Promise.all([
      supabase.from('orders')
        .select('id,shopee_order_id,erp_user_id,order_date,area,shipping_service,express_shipper_name,express_shipper_phone,express_shipper_note,express_delivery_status,order_status,payment_status,recipient_name,recipient_phone,recipient_address,destination_hub,cod,receive_status,warehouse_status,created_at,updated_at,archived_at,archived_by,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active,tracking_enabled,last_track_at,next_track_at,created_at,replaced_at)')
        .eq('id',sp.order)
        .maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id',sp.order).order('created_at'),
      supabase.from('order_vouchers').select('*').eq('order_id',sp.order).order('created_at'),
    ])
    contextOrder=orderResult.data
    contextItems=(itemResult.data??[]) as any[]
    contextVouchers=(voucherResult.data??[]) as any[]
    const shipmentIds=(contextOrder?.shipments??[]).map((x:any)=>x.id)
    const [eventResult,auditResult]=await Promise.all([
      shipmentIds.length
        ? supabase.from('tracking_events').select('*').in('shipment_id',shipmentIds).order('event_time',{ascending:false}).limit(100)
        : Promise.resolve({data:[],error:null} as any),
      supabase.from('audit_logs').select('*').eq('entity_id',sp.order).order('created_at',{ascending:false}).limit(100),
    ])
    contextTrackingEvents=(eventResult.data??[]) as any[]
    contextAuditRows=(auditResult.data??[]) as any[]
  }
  const contextOrderTab=sp.orderTab==='tracking'||sp.orderTab==='history'?sp.orderTab:'info'

  return <div className={'tracking-screen tracking-screen-v2 '+(contextOrder?'with-context-order-panel':'')}>
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Cảnh báo vận chuyển</h1>
        <p>Theo dõi theo HUB · nhận hàng · đối soát vận chuyển</p>
      </div>
      <div className="head-actions">
        <Link className="button" href={moduleHref('/purchase/orders')}>Đơn nhập hàng</Link>
        <span className={'tracking-provider-health '+(providers?.some(p=>p.enabled)?'online':'offline')}>
          <i/>{providers?.some(p=>p.enabled)?'Tracking đang chạy':'Chưa có provider'}
        </span>
      </div>
    </header>

    <div className="tracking-date-row-v2">
      <PurchaseDateFilter
        activeRange={range.key}
        from={range.from}
        to={range.to}
        label={range.label}
        basePath="/purchase/tracking"
        showAll
        preserveParams={{
          status:sp.status,
          receive:sp.receive,
          receiveDate:sp.receiveDate,
          hub:sp.hub,
          order:sp.order,
          orderTab:sp.orderTab,
        }}
      />
    </div>

    {(sp.received||sp.payment||error)&&<div className="tracking-flash-row">
      {sp.received&&<div className="notice success"><b>Đã xác nhận nhận hàng.</b><span>Đơn sẵn sàng cho luồng kho.</span></div>}
      {sp.payment&&<div className="notice success"><b>Đã ghi nhận đối soát HUB.</b><span>Tip đã được tính tự động.</span></div>}
      {error&&<div className="error-box">Không thể tải dữ liệu vận chuyển: {error.message}</div>}
    </div>}

    <section className="tracking-command-center-v2">
      <div className="tracking-status-strip-v2">
        <Link
          href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE',receiveDate:null})}
          className={'tracking-status-metric warning '+(sp.receive==='WAITING_RECEIVE'?'active':'')}
        >
          <span>Chờ nhận</span>
          <b>{waiting}</b>
          <small>{formatMoney(waitingCod)} · {waitingHubCount} HUB</small>
        </Link>
        <Link
          href={trackingHref({status:'ARRIVED_DESTINATION_HUB',receive:null,receiveDate:null})}
          className={'tracking-status-metric amber '+(sp.status==='ARRIVED_DESTINATION_HUB'?'active':'')}
        >
          <span>Đến HUB</span><b>{atHub}</b><small>Cần theo dõi</small>
        </Link>
        <Link
          href={trackingHref({status:'OUT_FOR_DELIVERY',receive:null,receiveDate:null})}
          className={'tracking-status-metric info '+(sp.status==='OUT_FOR_DELIVERY'?'active':'')}
        >
          <span>Đang giao</span><b>{outForDelivery}</b><small>Shipper đang xử lý</small>
        </Link>
        <Link
          href={trackingHref({status:'DELIVERED',receive:null,receiveDate:null})}
          className={'tracking-status-metric success '+(sp.status==='DELIVERED'&&!sp.receive?'active':'')}
        >
          <span>Giao TC</span><b>{delivered}</b><small>{waiting} chưa nhận</small>
        </Link>
        <Link
          href={trackingHref({status:'DELIVERY_FAILED',receive:null,receiveDate:null})}
          className={'tracking-status-metric danger '+(sp.status==='DELIVERY_FAILED'?'active':'')}
        >
          <span>Giao lỗi</span><b>{failed}</b><small>Cần xử lý</small>
        </Link>
      </div>

      <div className="tracking-control-row-v2">
        <div className="tracking-console-title">
          <b>Console theo HUB</b>
          <span>{rows.length} vận đơn · {grouped.length} HUB · {range.label}</span>
        </div>

        <div className="tracking-filter-segments tracking-filter-segments-v2">
          <Link className={!sp.status&&!sp.receive?'active':''} href={trackingHref({status:null,receive:null,receiveDate:null})}>Tất cả</Link>
          <Link className={sp.receive==='WAITING_RECEIVE'?'active':''} href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE',receiveDate:null})}>Chờ nhận</Link>
          <Link className={sp.status==='ARRIVED_DESTINATION_HUB'?'active':''} href={trackingHref({status:'ARRIVED_DESTINATION_HUB',receive:null,receiveDate:null})}>Đến HUB</Link>
          <Link className={sp.status==='OUT_FOR_DELIVERY'?'active':''} href={trackingHref({status:'OUT_FOR_DELIVERY',receive:null,receiveDate:null})}>Đang giao</Link>
          <Link className={sp.status==='DELIVERY_FAILED'?'active':''} href={trackingHref({status:'DELIVERY_FAILED',receive:null,receiveDate:null})}>Giao lỗi</Link>
        </div>

        <form action="/purchase/tracking" className="tracking-date-filter tracking-date-filter-v2">
          <input type="hidden" name="range" value={range.key}/>
          {range.key==='custom'&&<><input type="hidden" name="from" value={range.from}/><input type="hidden" name="to" value={range.to}/></>}
          {sp.status&&<input type="hidden" name="status" value={sp.status}/>}
          {sp.receive&&<input type="hidden" name="receive" value={sp.receive}/>}
          {sp.order&&<input type="hidden" name="order" value={sp.order}/>}
          {sp.orderTab&&<input type="hidden" name="orderTab" value={sp.orderTab}/>}
          <select name="hub" defaultValue={sp.hub??''} aria-label="HUB đích">
            <option value="">Tất cả HUB</option>
            {hubOptions.map(h=><option value={h} key={h}>{h}</option>)}
          </select>
          <input type="date" name="receiveDate" defaultValue={sp.receiveDate??''} aria-label="Ngày trạng thái"/>
          <button className="button small">Lọc</button>
          {(sp.status||sp.receive||sp.receiveDate||sp.hub)&&
            <Link className="button small ghost-filter" href={trackingHref({status:null,receive:null,receiveDate:null,hub:null,received:null,payment:null})}>Xóa</Link>}
        </form>
      </div>
    </section>

    <div className="tracking-hub-stack tracking-hub-stack-v2">
      {!grouped.length
        ? <div className="card empty">Không có vận đơn phù hợp với bộ lọc.</div>
        : grouped.map(([hub,groupRows])=>{
            const groupUrgent=groupRows.some((x:any)=>
              x.receive_status==='WAITING_RECEIVE'||
              ['DELIVERY_FAILED','ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY'].includes(String(x.tracking_status))
            )
            return <TrackingHubGroup
              key={hub}
              hub={hub}
              rows={groupRows as any[]}
              warehouses={(warehouses??[]) as any[]}
              assignedShippers={(hubShipperMap.get(hub)??[]) as any[]}
              defaultReceivingWarehouseId={(warehouseSettings as any)?.default_receiving_warehouse_id??null}
              contextQuery={contextQuery}
              orderBasePath="/purchase/tracking"
              defaultOpen={Boolean(sp.status||sp.receive||sp.hub)||groupUrgent}
            />
          })}
    </div>

    {contextOrder&&<ContextOrderPanel
      order={contextOrder}
      items={contextItems}
      vouchers={contextVouchers}
      trackingEvents={contextTrackingEvents}
      auditRows={contextAuditRows}
      activeTab={contextOrderTab}
      parentLabel="Cảnh báo vận chuyển"
      backHref={contextOrderTab!=='info'
        ? trackingHref({order:contextOrder.id,orderTab:'info'})
        : trackingHref({order:null,orderTab:null})}
      closeHref={trackingHref({order:null,orderTab:null})}
      infoHref={trackingHref({order:contextOrder.id,orderTab:'info'})}
      trackingHref={trackingHref({order:contextOrder.id,orderTab:'tracking'})}
      historyHref={trackingHref({order:contextOrder.id,orderTab:'history'})}
      openModuleHref={'/purchase/orders?range=all&order='+contextOrder.id}
    />}

    <details className="tracking-secondary-drawer">
      <summary>
        <span>Hoạt động gần đây</span>
        <small>{paymentRows?.length??0} đợt đối soát · {logs?.length??0} lần đồng bộ</small>
      </summary>
      <section className="tracking-bottom-grid tracking-bottom-grid-v2">
        <div className="card">
          <div className="card-head">
            <div><h2>Đối soát HUB gần nhất</h2><span className="muted">Mỗi đợt gồm nhiều đơn cùng HUB</span></div>
            <Link className="button small" href="/finance/shipper-payments">Xem tất cả</Link>
          </div>
          {!paymentRows?.length
            ? <div className="empty compact">Chưa có đợt đối soát trong khoảng đang xem.</div>
            : paymentRows.map((p:any)=><div className="shipper-payment-history-row" key={p.id}>
                <div>
                  <b>{p.destination_hub??'HUB chưa xác định'}</b>
                  <span>{p.shipper_payment_details?.length??0} đơn · {(p.warehouses as any)?.code??'—'}{p.shipper_name?' · '+p.shipper_name:''}</span>
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
    </details>
  </div>
}
