import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, statusLabel } from '@/lib/format'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={range?:RangeKey,from?:string,to?:string}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {
    year:shifted.getUTCFullYear(),
    month:shifted.getUTCMonth()+1,
    day:shifted.getUTCDate(),
  }
}

function ymd(y:number,m:number,d:number){
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function localStartIso(dateText:string){return new Date(`${dateText}T00:00:00+07:00`).toISOString()}
function localEndIso(dateText:string){return new Date(`${dateText}T23:59:59.999+07:00`).toISOString()}

function shiftLocalDays(y:number,m:number,d:number,days:number){
  const base=Date.UTC(y,m-1,d)
  const x=new Date(base+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}

function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {
    from:shiftLocalDays(y,m,d,-daysFromMonday),
    to:shiftLocalDays(y,m,d,6-daysFromMonday),
  }
}

function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const now=new Date()
  const p=vnDateParts(now)
  const today=ymd(p.year,p.month,p.day)
  let from=today
  let to=today
  let label='Hôm nay'

  if(key==='week'){
    const week=currentWeekRange(p.year,p.month,p.day)
    from=week.from
    to=week.to
    label='Tuần này'
  }
  if(key==='7d'){from=shiftLocalDays(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDays(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){
    const qStart=Math.floor((p.month-1)/3)*3+1
    from=ymd(p.year,qStart,1);label='Quý này'
  }
  if(key==='year'){from=ymd(p.year,1,1);label='Năm nay'}
  if(key==='all'){from='1970-01-01';to='9999-12-31';label='Toàn thời gian'}
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {key,from,to,label,start:localStartIso(from),end:localEndIso(to)}
}

function activeShipment(order:any){
  return (order.shipments??[]).find((s:any)=>s.is_active)??order.shipments?.[0]??null
}

function aggregate(rows:any[],key:'area'|'destination_hub'){
  const map=new Map<string,{name:string,orders:number,cod:number,delivered:number,waiting:number,received:number}>()
  for(const o of rows){
    const name=String(o[key]??'Chưa xác định')
    const cur=map.get(name)??{name,orders:0,cod:0,delivered:0,waiting:0,received:0}
    cur.orders++
    cur.cod+=Number(o.cod??0)
    const s=activeShipment(o)
    if(s?.current_tracking_status==='DELIVERED')cur.delivered++
    if(o.receive_status==='WAITING_RECEIVE')cur.waiting++
    if(o.receive_status==='RECEIVED')cur.received++
    map.set(name,cur)
  }
  return [...map.values()].sort((a,b)=>b.orders-a.orders||b.cod-a.cod)
}

function trackingCounts(rows:any[]){
  const map=new Map<string,number>()
  for(const o of rows){
    const s=activeShipment(o)
    const status=s?.current_tracking_status??'UNKNOWN'
    map.set(status,(map.get(status)??0)+1)
  }
  return [...map.entries()].map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count)
}

export default async function PurchaseDashboard({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const range=resolveRange(sp)
  const {supabase}=await requireUser()

  const [{data:ordersData,error},{count:accountCount},{data:alerts},{data:shipperPayments},{data:hubConfigs},{data:destinationShippers},{data:hubShipperAssignments}]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,order_date,area,destination_hub,cod,receive_status,warehouse_status,order_status,payment_status,shipping_service,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active)')
      .is('archived_at',null)
      .gte('order_date',range.start)
      .lte('order_date',range.end)
      .order('order_date',{ascending:false})
      .limit(2000),
    supabase.from('erp_users').select('*',{count:'exact',head:true}).is('archived_at',null),
    supabase.from('alert_events')
      .select('id,order_id,alert_type,destination_hub,created_at,sent_at,orders!inner(archived_at)')
      .is('orders.archived_at',null)
      .gte('created_at',range.start)
      .lte('created_at',range.end)
      .order('created_at',{ascending:false})
      .limit(20),
    supabase.from('shipper_payments')
      .select('id,destination_hub,shipper_name,total_cod,actual_transferred,tip,transferred_at')
      .gte('transferred_at',range.start)
      .lte('transferred_at',range.end)
      .order('transferred_at',{ascending:false})
      .limit(1000),
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
  ])

  const rows=(ordersData??[]) as any[]
  const standardRows=rows.filter(o=>o.shipping_service!=='EXPRESS')
  const totalOrders=rows.length
  const delivered=standardRows.filter(o=>activeShipment(o)?.current_tracking_status==='DELIVERED').length
  const waitingRows=standardRows.filter(o=>o.receive_status==='WAITING_RECEIVE')
  const waiting=waitingRows.length
  const waitingCod=waitingRows.reduce((sum,o)=>sum+Number(o.cod??0),0)
  const waitingHubs=new Set(waitingRows.map(o=>o.destination_hub).filter(Boolean)).size
  const received=standardRows.filter(o=>o.receive_status==='RECEIVED').length
  const shipping=standardRows.filter(o=>{
    const s=activeShipment(o)?.current_tracking_status
    return ['READY_TO_SHIP','PICKED_UP','IN_TRANSIT'].includes(String(s))
  }).length
  const arrivedHub=standardRows.filter(o=>activeShipment(o)?.current_tracking_status==='ARRIVED_DESTINATION_HUB').length
  const failed=standardRows.filter(o=>activeShipment(o)?.current_tracking_status==='DELIVERY_FAILED').length
  const missingTracking=standardRows.filter(o=>!activeShipment(o)?.tracking_number).length
  const cancelled=rows.filter(o=>{
    const trackingStatus=activeShipment(o)?.current_tracking_status
    const orderStatus=String(o.order_status??'').toUpperCase()
    return trackingStatus==='CANCELLED'||orderStatus==='CANCELLED'||orderStatus==='CANCELED'
  }).length
  const expressCount=rows.filter(o=>o.shipping_service==='EXPRESS').length

  const byArea=aggregate(standardRows,'area')
  const byHub=aggregate(standardRows,'destination_hub')
  const statusRows=trackingCounts(standardRows)
  const maxStatus=Math.max(...statusRows.map(x=>x.count),1)

  const paymentRows=(shipperPayments??[]) as any[]
  const dashboardShipperMap=new Map((destinationShippers??[]).map((s:any)=>[String(s.id),s]))
  const dashboardAssignmentsByHub=new Map<string,any[]>()
  for(const a of (hubShipperAssignments??[]) as any[]){
    const shipper=dashboardShipperMap.get(String(a.shipper_id))
    if(!shipper)continue
    const list=dashboardAssignmentsByHub.get(String(a.hub_config_id))??[]
    list.push(shipper)
    dashboardAssignmentsByHub.set(String(a.hub_config_id),list)
  }
  const hubShipperMap=new Map(
    (hubConfigs??[]).map((h:any)=>[
      String(h.hub_code),
      dashboardAssignmentsByHub.get(String(h.id))??[],
    ])
  )
  const transferredTotal=paymentRows.reduce((sum,p)=>sum+Number(p.actual_transferred??0),0)
  const tipTotal=paymentRows.reduce((sum,p)=>sum+Number(p.tip??0),0)

  const urgent=standardRows
    .filter(o=>{
      const status=activeShipment(o)?.current_tracking_status
      return o.receive_status==='WAITING_RECEIVE'||['DELIVERY_FAILED','ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY'].includes(status)
    })
    .sort((a,b)=>{
      const ap=a.receive_status==='WAITING_RECEIVE'?0:activeShipment(a)?.current_tracking_status==='DELIVERY_FAILED'?1:2
      const bp=b.receive_status==='WAITING_RECEIVE'?0:activeShipment(b)?.current_tracking_status==='DELIVERY_FAILED'?1:2
      return ap-bp||new Date(b.order_date).getTime()-new Date(a.order_date).getTime()
    })
    .slice(0,10)

  function purchaseHref(path:string,extra:Record<string,string|undefined|null>={}){
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

  function orderHref(extra:Record<string,string|undefined|null>={}){
    return purchaseHref('/purchase/orders',extra)
  }

  return <>
    <header className="page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Tổng quan mua hàng</h1>
        <p>Điều hành đơn nhập, vận chuyển, nhận hàng và đối soát theo HUB trên một màn hình</p>
      </div>
      <div className="head-actions">
        <Link className="button" href={purchaseHref('/purchase/tracking')}>Cảnh báo vận chuyển</Link>
        <Link className="button primary" href={orderHref({mode:'create'})}>+ Tạo đơn nhập</Link>
      </div>
    </header>

    <PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      showAll
    />

    {error&&<div className="error-box">Không thể tải dữ liệu mua hàng: {error.message}</div>}

    <section className="purchase-command-kpis purchase-command-kpis-v2">
      <Link href={orderHref()} className="command-kpi">
        <span>Tổng đơn</span><b>{totalOrders}</b><small>{accountCount??0} tài khoản mua hàng</small>
      </Link>
      <Link href={orderHref({tracking:'missing'})} className="command-kpi warning">
        <span>Chưa có mã vận đơn</span><b>{missingTracking}</b><small>Không tính đơn Hỏa tốc</small>
      </Link>
      <Link href={orderHref({tracking:'shipping'})} className="command-kpi info">
        <span>Đang vận chuyển</span><b>{shipping}</b><small>Đã lấy hàng / đang trung chuyển</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'ARRIVED_DESTINATION_HUB'})} className="command-kpi info">
        <span>Đến kho đích</span><b>{arrivedHub}</b><small>Đã đến HUB đích</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'DELIVERED'})} className="command-kpi success">
        <span>Giao thành công</span><b>{delivered}</b><small>Bao gồm đơn đang chờ xác nhận nhận</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'DELIVERED',receive:'WAITING_RECEIVE'})} className="command-kpi warning">
        <span>Chờ xác nhận nhận hàng</span><b>{waiting}</b><small>{formatMoney(waitingCod)} · {waitingHubs} HUB</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'CANCELLED'})} className="command-kpi danger">
        <span>Bị huỷ</span><b>{cancelled}</b><small>Đơn / vận đơn đã huỷ</small>
      </Link>
    </section>

    <section className="purchase-receive-command">
      <div className="receive-command-main">
        <div>
          <span className="module-eyebrow">ƯU TIÊN XỬ LÝ</span>
          <h2>Đã giao thành công · Chờ xác nhận nhận</h2>
          <p>Tick nhiều đơn cùng HUB, xác nhận hàng thực nhận và ghi một lần tổng tiền thực chuyển theo HUB.</p>
        </div>
        <div className="receive-command-number">
          <b>{waiting}</b><span>đơn</span>
        </div>
      </div>
      <div className="receive-command-metrics">
        <div><span>COD chờ nhận</span><b>{formatMoney(waitingCod)}</b></div>
        <div><span>Kho đích cần xử lý</span><b>{waitingHubs}</b></div>
        <div><span>Đã đối soát HUB</span><b>{formatMoney(transferredTotal)}</b><small>{paymentRows.length} đợt</small></div>
        <div><span>Tip phát sinh</span><b>{formatMoney(tipTotal)}</b></div>
      </div>
      <Link className="button primary" href={purchaseHref('/purchase/tracking',{status:'DELIVERED',receive:'WAITING_RECEIVE'})}>Mở danh sách chờ nhận →</Link>
    </section>

    <section className="purchase-ops-grid">
      <div className="card purchase-hub-board">
        <div className="card-head">
          <div><h2>Theo kho đích</h2><span className="muted">Ưu tiên kho đang có đơn giao thành công chờ nhận</span></div>
          <Link className="button small" href={purchaseHref('/purchase/tracking')}>Mở console</Link>
        </div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table">
            <thead><tr><th>Kho đích</th><th>Shipper</th><th>Đơn</th><th>COD</th><th>Giao TC</th><th>Chờ nhận</th><th>Đã nhận</th><th></th></tr></thead>
            <tbody>{!byHub.length
              ? <tr><td colSpan={8} className="empty">Chưa có dữ liệu kho đích.</td></tr>
              : byHub.slice(0,12).map(x=>{
                  const hubShippers=(hubShipperMap.get(x.name)??[]) as any[]
                  return <tr key={x.name} className={x.waiting?'needs-action':''}>
                  <td className="strong">{x.name}</td>
                  <td><div className="hub-shipper-cell">
                    {!hubShippers.length
                      ? <span>—</span>
                      : hubShippers.map((s:any)=><span className="hub-shipper-line" key={s.id}><b>{s.name}</b>{s.phone&&<small>{s.phone}</small>}</span>)}
                  </div></td>
                  <td>{x.orders}</td>
                  <td className="money">{formatMoney(x.cod)}</td>
                  <td>{x.delivered}</td>
                  <td><b className={x.waiting?'warning-text':''}>{x.waiting}</b></td>
                  <td>{x.received}</td>
                  <td><Link className="table-link" href={purchaseHref('/purchase/tracking',{hub:x.name==='Chưa xác định'?null:x.name,status:x.waiting?'DELIVERED':null,receive:x.waiting?'WAITING_RECEIVE':null})}>Xử lý</Link></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card purchase-action-queue">
        <div className="card-head">
          <div><h2>Cần xử lý ngay</h2><span className="muted">Theo mức độ ưu tiên vận hành</span></div>
          <span className="badge">{urgent.length}</span>
        </div>
        <div className="action-queue-list">
          <Link href={purchaseHref('/purchase/tracking',{status:'DELIVERED',receive:'WAITING_RECEIVE'})} className="action-queue-summary warning">
            <div><b>{waiting}</b><span>Chờ xác nhận nhận</span></div>
            <small>{formatMoney(waitingCod)} COD</small>
          </Link>
          <Link href={purchaseHref('/purchase/tracking',{status:'DELIVERY_FAILED'})} className="action-queue-summary danger">
            <div><b>{failed}</b><span>Giao không thành công</span></div>
            <small>Cần kiểm tra lại hành trình</small>
          </Link>
          <Link href={orderHref({tracking:'missing'})} className="action-queue-summary">
            <div><b>{missingTracking}</b><span>Chưa có MVĐ</span></div>
            <small>Chỉ đơn vận chuyển tiêu chuẩn</small>
          </Link>

          <div className="action-queue-orders">
            {urgent.slice(0,5).map(o=>{
              const s=activeShipment(o)
              return <Link href={orderHref({order:o.id})} key={o.id}>
                <div><b>{o.shopee_order_id??o.id.slice(0,8)}</b><span>{o.destination_hub??'Chưa xác định kho'}</span></div>
                <div><span className={'status-pill status-'+String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(s?.current_tracking_status)}</span><small>{formatDateTime(o.order_date)}</small></div>
              </Link>
            })}
          </div>
        </div>
      </div>
    </section>

    <section className="purchase-analytics-grid">
      <div className="card">
        <div className="card-head"><div><h2>Theo khu vực</h2><span className="muted">Đơn tiêu chuẩn có phân khu vực tự động</span></div></div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table">
            <thead><tr><th>Khu vực</th><th>Đơn</th><th>COD</th><th>Giao TC</th><th>Chờ nhận</th></tr></thead>
            <tbody>{!byArea.length
              ? <tr><td colSpan={5} className="empty">Chưa có dữ liệu khu vực.</td></tr>
              : byArea.map(x=><tr key={x.name}><td className="strong">{x.name}</td><td>{x.orders}</td><td className="money">{formatMoney(x.cod)}</td><td>{x.delivered}</td><td>{x.waiting}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card purchase-status-card">
        <div className="card-head"><div><h2>Dòng trạng thái vận chuyển</h2><span className="muted">Chỉ các đơn có Tracking</span></div><span className="badge">{alerts?.length??0} cảnh báo</span></div>
        <div className="status-breakdown">
          {!statusRows.length
            ? <div className="empty compact">Chưa có trạng thái vận chuyển.</div>
            : statusRows.map(x=><div className="status-breakdown-row" key={x.status}>
                <div className="status-breakdown-label"><span>{statusLabel(x.status)}</span><b>{x.count}</b></div>
                <div className="status-bar"><i style={{width:`${Math.max(6,x.count/maxStatus*100)}%`}}/></div>
              </div>)}
        </div>
      </div>
    </section>

    <div className="purchase-flow-strip">
      <Link href={purchaseHref('/purchase/accounts')}><span>1</span><div><b>Tài khoản mua hàng</b><small>Quản lý phiên & voucher</small></div></Link>
      <i>→</i>
      <Link href={orderHref()}><span>2</span><div><b>Đơn nhập hàng</b><small>Tạo / sửa / MVĐ</small></div></Link>
      <i>→</i>
      <Link href={purchaseHref('/purchase/tracking')}><span>3</span><div><b>Cảnh báo vận chuyển</b><small>Tracking · nhận hàng · đối soát HUB</small></div></Link>
      <i>→</i>
      <Link href="/warehouse/receive"><span>4</span><div><b>Nhập kho</b><small>Đơn đã nhận</small></div></Link>
    </div>
  </>
}
