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

  const [{data:ordersData,error},{count:accountCount},{data:alerts}]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,order_date,area,destination_hub,cod,receive_status,warehouse_status,order_status,payment_status,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active)')
      .gte('order_date',range.start)
      .lte('order_date',range.end)
      .order('order_date',{ascending:false})
      .limit(2000),
    supabase.from('erp_users').select('*',{count:'exact',head:true}),
    supabase.from('alert_events')
      .select('id,order_id,alert_type,destination_hub,created_at,sent_at')
      .gte('created_at',range.start)
      .lte('created_at',range.end)
      .order('created_at',{ascending:false})
      .limit(20),
  ])

  const rows=(ordersData??[]) as any[]
  const totalOrders=rows.length
  const totalCod=rows.reduce((sum,o)=>sum+Number(o.cod??0),0)
  const delivered=rows.filter(o=>activeShipment(o)?.current_tracking_status==='DELIVERED').length
  const waiting=rows.filter(o=>o.receive_status==='WAITING_RECEIVE').length
  const received=rows.filter(o=>o.receive_status==='RECEIVED').length
  const shipping=rows.filter(o=>{
    const s=activeShipment(o)?.current_tracking_status
    return s&&!['DELIVERED','CANCELLED','RETURNED'].includes(s)
  }).length
  const failed=rows.filter(o=>activeShipment(o)?.current_tracking_status==='DELIVERY_FAILED').length

  const byArea=aggregate(rows,'area')
  const byHub=aggregate(rows,'destination_hub')
  const statusRows=trackingCounts(rows)
  const maxStatus=Math.max(...statusRows.map(x=>x.count),1)

  const urgent=rows.filter(o=>{
    const status=activeShipment(o)?.current_tracking_status
    return ['ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED'].includes(status)||o.receive_status==='WAITING_RECEIVE'
  }).slice(0,10)


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
        <p>Theo dõi toàn bộ tài khoản mua, đơn nhập và vận chuyển theo thời gian thực</p>
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

    <section className="kpi-grid purchase-kpi-grid">
      <Link href={orderHref()} className="kpi-card">
        <span>Đơn nhập</span><b>{totalOrders}</b><small>{accountCount??0} tài khoản mua hàng</small>
      </Link>
      <Link href={orderHref()} className="kpi-card">
        <span>Tổng COD</span><b className="kpi-money">{formatMoney(totalCod)}</b><small>Giá trị trong khoảng đã chọn</small>
      </Link>
      <Link href={orderHref({tracking:'shipping'})} className="kpi-card">
        <span>Đang vận chuyển</span><b>{shipping}</b><small>Chưa ở trạng thái kết thúc</small>
      </Link>
      <Link href={orderHref({tracking:'DELIVERED'})} className="kpi-card">
        <span>Giao thành công</span><b>{delivered}</b><small>{totalOrders?Math.round(delivered/totalOrders*100):0}% số đơn trong kỳ</small>
      </Link>
      <Link href={orderHref({receive:'WAITING_RECEIVE'})} className="kpi-card warning">
        <span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Cần nhân viên xác nhận vật lý</small>
      </Link>
      <Link href={orderHref({receive:'RECEIVED'})} className="kpi-card">
        <span>Đã nhận</span><b>{received}</b><small>Sẵn sàng cho luồng kho</small>
      </Link>
    </section>

    <section className="purchase-dashboard-grid">
      <div className="card purchase-summary-card">
        <div className="card-head">
          <div><h2>Tổng hợp theo khu vực</h2><span className="muted">Số đơn và COD theo nơi nhận</span></div>
          <span className="badge">{byArea.length} khu vực</span>
        </div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table">
            <thead><tr><th>Khu vực</th><th>Đơn</th><th>COD</th><th>Giao TC</th><th>Chờ nhận</th><th>Đã nhận</th></tr></thead>
            <tbody>{!byArea.length
              ? <tr><td colSpan={6} className="empty">Chưa có dữ liệu trong khoảng này.</td></tr>
              : byArea.map(x=><tr key={x.name}><td className="strong">{x.name}</td><td>{x.orders}</td><td className="money">{formatMoney(x.cod)}</td><td>{x.delivered}</td><td>{x.waiting}</td><td>{x.received}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card purchase-status-card">
        <div className="card-head"><div><h2>Trạng thái vận chuyển</h2><span className="muted">Phân bố đơn theo trạng thái hiện tại</span></div></div>
        <div className="status-breakdown">
          {!statusRows.length
            ? <div className="empty compact">Chưa có trạng thái vận chuyển.</div>
            : statusRows.map(x=><div className="status-breakdown-row" key={x.status}>
                <div className="status-breakdown-label"><span>{statusLabel(x.status)}</span><b>{x.count}</b></div>
                <div className="status-bar"><i style={{width:`${Math.max(6,x.count/maxStatus*100)}%`}}/></div>
              </div>)}
        </div>
        <div className="purchase-alert-foot">
          <span>Giao thất bại</span><b className={failed?'danger-text':''}>{failed}</b>
          <span>Cảnh báo phát sinh</span><b>{alerts?.length??0}</b>
        </div>
      </div>
    </section>

    <section className="purchase-dashboard-grid second-row">
      <div className="card purchase-summary-card">
        <div className="card-head">
          <div><h2>Tổng hợp theo kho đích</h2><span className="muted">Phục vụ điều phối nhận hàng theo từng kho đích</span></div>
          <Link className="button small" href={purchaseHref('/purchase/tracking')}>Mở cảnh báo</Link>
        </div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table">
            <thead><tr><th>Kho đích</th><th>Đơn</th><th>COD</th><th>Giao TC</th><th>Chờ nhận</th><th>Đã nhận</th></tr></thead>
            <tbody>{!byHub.length
              ? <tr><td colSpan={6} className="empty">Chưa có dữ liệu kho đích.</td></tr>
              : byHub.map(x=><tr key={x.name}><td className="strong">{x.name}</td><td>{x.orders}</td><td className="money">{formatMoney(x.cod)}</td><td>{x.delivered}</td><td>{x.waiting}</td><td>{x.received}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card urgent-orders-card">
        <div className="card-head">
          <div><h2>Đơn cần xử lý</h2><span className="muted">Ưu tiên giao hàng, kho đích và xác nhận nhận</span></div>
          <span className="badge">{urgent.length}</span>
        </div>
        <div className="urgent-list">
          {!urgent.length
            ? <div className="empty compact">Không có đơn cần xử lý trong khoảng này.</div>
            : urgent.map(o=>{
                const s=activeShipment(o)
                return <Link className="urgent-order-row" href={orderHref({order:o.id})} key={o.id}>
                  <div><b>{o.shopee_order_id??o.id.slice(0,8)}</b><span>{o.erp_users?.username??'—'} · {o.destination_hub??'Chưa rõ kho'}</span></div>
                  <div><span className={`status-pill status-${String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(s?.current_tracking_status)}</span><small>{formatDateTime(o.order_date)}</small></div>
                </Link>
              })}
        </div>
      </div>
    </section>

    <div className="purchase-flow-strip">
      <Link href={purchaseHref('/purchase/accounts')}><span>1</span><div><b>Tài khoản mua hàng</b><small>Quản lý phiên & voucher</small></div></Link>
      <i>→</i>
      <Link href={orderHref()}><span>2</span><div><b>Đơn nhập hàng</b><small>Tạo / sửa / MVĐ</small></div></Link>
      <i>→</i>
      <Link href={purchaseHref('/purchase/tracking')}><span>3</span><div><b>Cảnh báo vận chuyển</b><small>Theo dõi & xác nhận nhận</small></div></Link>
      <i>→</i>
      <Link href="/warehouse/receive"><span>4</span><div><b>Nhập kho</b><small>Đơn đã nhận</small></div></Link>
    </div>
  </>
}
