import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney } from '@/lib/format'
import { PurchaseInsightChart } from '@/components/purchase-insight-chart'
import {
  toInsightOrder,groupInsightOrders,sumInsightCounts,issueLabel,issuePriority,
  isAwaitingReceipt,isExpressAwaitingDeliveryConfirmation,insightUnknownLabels,type InsightOrder,
  type PurchaseInsightOrder,
} from '@/lib/purchase-dashboard-insights'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={range?:RangeKey,from?:string,to?:string,province?:string,ward?:string,hub?:string,stage?:string}
const HOUR=60*60*1000
const DAY=24*HOUR
function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function shiftDays(y:number,m:number,d:number,days:number){
  const t=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate())
}
function resolveRange(sp:SP){
  const keys:RangeKey[]=['today','week','month','custom','7d','30d','quarter','year','all']
  const key:RangeKey=keys.includes(sp.range as RangeKey)?sp.range as RangeKey:'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){
    const weekday=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()
    const before=(weekday+6)%7
    from=shiftDays(p.year,p.month,p.day,-before)
    to=shiftDays(p.year,p.month,p.day,6-before)
    label='Tuần này'
  }
  if(key==='7d'){from=shiftDays(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftDays(p.year,p.month,p.day,-29);label='30 ngày'}
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
  return {key,from,to,label,start:new Date(`${from}T00:00:00+07:00`).toISOString(),end:new Date(`${to}T23:59:59.999+07:00`).toISOString()}
}
const metrics:{key:string,label:string,description:string,tone:string}[]=[
  {key:'total',label:'Tổng đơn',description:'Theo ngày đặt',tone:'neutral'},
  {key:'express',label:'Hỏa tốc chờ giao',description:'Tồn hiện tại',tone:'express'},
  {key:'missing',label:'Chờ MVĐ',description:'Chưa có mã',tone:'warning'},
  {key:'shipping',label:'Vận chuyển',description:'Đang trung chuyển',tone:'info'},
  {key:'destination',label:'Đến HUB đích',description:'Trạng thái mới',tone:'indigo'},
  {key:'out',label:'Đang giao',description:'Trạng thái mới',tone:'info'},
  {key:'delivered',label:'Giao thành công',description:'Đã xác nhận giao',tone:'success'},
  {key:'cancelled',label:'Đã hủy',description:'Đơn đã hủy',tone:'danger'},
  {key:'failed',label:'Giao lỗi',description:'Cần xử lý',tone:'danger'},
]
const quickRanges:{key:RangeKey,label:string}[]=[
  {key:'all',label:'Tất cả'},{key:'today',label:'Hôm nay'},{key:'week',label:'Tuần này'},
  {key:'7d',label:'7 ngày'},{key:'30d',label:'30 ngày'},
  {key:'month',label:'Tháng này'},{key:'quarter',label:'Quý này'},
  {key:'year',label:'Năm nay'},
]

/** Phân trang để tránh trần 1.000 dòng của PostgREST làm sai tổng số. */
async function loadOrders(supabase:any,start:string,end:string,expressAcrossDates=false){
  const limit=500
  const all:PurchaseInsightOrder[]=[]
  for(let i=0;i<20;i++){
    let query=supabase.from('orders')
      .select('id,shopee_order_id,order_date,recipient_address,area,destination_hub,cod,shipping_service,express_delivery_status,order_status,receive_status,shipments(id,tracking_number,carrier,current_tracking_status,is_active,created_at)')
      .is('archived_at',null)
    // Hỏa tốc chờ xác nhận giao là snapshot toàn thời gian, không giới hạn ngày đặt.
    query=expressAcrossDates?query.eq('shipping_service','EXPRESS'):query.gte('order_date',start).lte('order_date',end)
    const {data,error}=await query.order('order_date',{ascending:false})
      .range(i*limit,(i+1)*limit-1)
    if(error)return {rows:all,error:error.message,truncated:false}
    const batch=(data??[]) as PurchaseInsightOrder[]
    all.push(...batch)
    if(batch.length<limit)return {rows:all,error:null,truncated:false}
  }
  return {rows:all,error:null,truncated:true}
}

export default async function PurchaseDashboard({searchParams}:{searchParams:Promise<SP>}){
  const params=await searchParams
  const range=resolveRange(params)
  const {supabase}=await requireUser()
  const [result,expressResult]=await Promise.all([
    loadOrders(supabase,range.start,range.end),
    loadOrders(supabase,range.start,range.end,true),
  ])
  const datedOrders=result.rows.map(toInsightOrder)
  const pendingExpress=expressResult.rows.map(toInsightOrder).filter(isExpressAwaitingDeliveryConfirmation)
  const filtered=datedOrders
  const numbers=sumInsightCounts(filtered)
  // Chỉ KPI Hỏa tốc là tồn đọng mọi thời gian, không phụ thuộc ngày đặt đơn.
  numbers.express=pendingExpress.length
  const areaGroups=groupInsightOrders(filtered,o=>o.ward+' · '+o.province)
  const hubGroups=groupInsightOrders(filtered,o=>o.destination_hub?.trim()||insightUnknownLabels.hub)
  // Công việc Hỏa tốc hiện tại không bị bỏ sót vì khác khoảng ngày đặt đơn.
  const datedIds=new Set(filtered.map(o=>o.id))
  const workOrders=[...filtered,...pendingExpress.filter(o=>!datedIds.has(o.id))]
  const actions=workOrders.filter(o=>issuePriority(o)<99)
    .sort((a,b)=>issuePriority(a)-issuePriority(b)||String(a.order_date??'').localeCompare(String(b.order_date??'')))
  const waitingOrders=filtered.filter(isAwaitingReceipt)
  const waitingCod=waitingOrders.reduce((sum,o)=>sum+Number(o.cod??0),0)
  const activeIssues=actions.length
  const missingGeo=filtered.filter(o=>o.stage!=='cancelled'&&(o.province===insightUnknownLabels.province||o.ward===insightUnknownLabels.ward)).length
  const missingHubs=filtered.filter(o=>['shipping','destination','out','delivered'].includes(o.stage)&&!o.destination_hub?.trim()).length
  function timeHref(key:RangeKey){
    return '/purchase?'+new URLSearchParams({range:key}).toString()
  }
  function orderHref(o:InsightOrder){const p=new URLSearchParams({order:o.id,range:range.key})
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    return '/purchase/orders?'+p.toString()
  }
  return <div className="pd-insight">
    <header className="page-head pd-topbar">
      <div>
        <span className="module-eyebrow">VẬN HÀNH NHẬP HÀNG</span>
        <h1>Dashboard nhập hàng</h1>
        <p>Đơn theo ngày đặt · Tiến trình và công việc theo trạng thái hiện tại</p>
      </div>
      <div className="head-actions">
        <Link href="/purchase/tracking" className="button">Theo dõi vận chuyển</Link>
        <Link href="/purchase/orders?mode=create" className="button primary">+ Tạo đơn nhập</Link>
      </div>
    </header>

    <nav className="pd-time-filter" aria-label="Lọc theo ngày đặt đơn">
      <div className="pd-time-quick" role="group" aria-label="Chọn khoảng thời gian">
        {quickRanges.map(option=><Link key={option.key} href={timeHref(option.key)}
          prefetch={false} aria-current={range.key===option.key?'page':undefined}
          className={'pd-time-option'+(range.key===option.key?' is-selected':'')}>{option.label}</Link>)}
      </div>
      <details className="pd-time-custom" open={range.key==='custom'}>
        <summary aria-label="Chọn khoảng ngày tùy ý"> <span aria-hidden="true">▦</span> {range.key==='custom'?range.label:'Tùy chọn'} </summary>
        <form className="pd-time-calendar" action="/purchase" method="GET">
          <input type="hidden" name="range" value="custom"/>
          <label><span>Từ ngày</span><input type="date" name="from" defaultValue={range.key==='all'?'':range.from} required/></label>
          <label><span>Đến ngày</span><input type="date" name="to" defaultValue={range.key==='all'?'':range.to} required/></label>
          <button type="submit" className="button primary">Áp dụng</button>
        </form>
      </details>
      <span className="pd-time-explain">Ngày đặt đơn · Hỏa tốc là tồn đọng hiện tại</span>
    </nav>

    {(result.error||expressResult.error)&&<div className="error-box" role="alert">Không tải đủ đơn nhập: {result.error||expressResult.error}. Không sử dụng tổng số khi nguồn dữ liệu lỗi.</div>}
    {(result.truncated||expressResult.truncated)&&<div className="error-box" role="alert">Danh sách vượt giới hạn 10.000 đơn. Thu hẹp phạm vi hoặc bổ sung truy vấn tổng hợp trước khi sử dụng kết quả.</div>}
    <section className="pd-kpi-viewport" aria-label="Tổng quan đơn nhập">
      <div className="pd-metrics">
        {metrics.map(metric=><div key={metric.key}
          className={'pd-metric pd-tone-'+metric.tone}>
          <span>{metric.label}</span><strong>{numbers[metric.key as keyof typeof numbers]}</strong>
          <small>{metric.description}</small>
        </div>)}
      </div>
    </section>
    <section className="pd-visual-head" aria-label="Biểu đồ phân bổ đơn nhập">
      <div><span className="module-eyebrow">PHÂN BỔ VẬN HÀNH</span>
        <h2>Đơn hàng theo khu vực và HUB</h2>
        <p>So sánh ngay trạng thái mới nhất của đơn đặt trong {range.label.toLowerCase()} · không cần lọc thêm</p>
      </div>
      <div className="pd-visual-legend"><span className="pd-legend-missing">Chờ MVĐ</span><span className="pd-legend-shipping">Vận chuyển</span><span className="pd-legend-delivered">Giao thành công</span></div>
    </section>
    <section className="pd-chart-grid">
      <PurchaseInsightChart title="Chưa có mã vận đơn · Theo khu vực"
        description="Phường/Xã — Tỉnh/Thành phố, không gồm đơn hủy và Hỏa tốc"
        groups={areaGroups} metric="missing" geography="area"/>
      <PurchaseInsightChart title="Đang vận chuyển · Theo khu vực"
        description="Đã lấy hàng, đang di chuyển hoặc ở HUB trung chuyển"
        groups={areaGroups} metric="shipping" geography="area"/>
      <PurchaseInsightChart title="Đang vận chuyển · Theo HUB đích"
        description="So sánh các HUB đích được khai báo trên đơn"
        groups={hubGroups} metric="shipping" variant="column" geography="hub"/>
      <PurchaseInsightChart title="Giao thành công · Theo khu vực"
        description="Đã xác nhận giao, bao gồm đơn đang chờ xác nhận nhận"
        groups={areaGroups} metric="delivered" geography="area"/>
      <PurchaseInsightChart title="Giao thành công · Theo HUB đích"
        description="Số đơn được xác nhận giao theo HUB đích"
        groups={hubGroups} metric="delivered" variant="column" geography="hub"/>
    </section>

    <section className="pd-action-head" id="pd-action">
      <div><span className="module-eyebrow">CẦN XỬ LÝ NGAY</span><h2>Hàng đợi công việc</h2><p>Sắp theo mức độ ưu tiên · Bấm mã đơn để mở chi tiết</p></div>
      <div className="pd-head-stat"><b>{activeIssues}</b><span>đơn cần theo dõi/xử lý</span></div>
    </section>
    <section className="pd-action-layout">
      <div className="pd-work-summary">
        <div className="pd-work-item">
          <span className="pd-work-dot green"/><span><b>Chờ xác nhận nhận hàng</b><small>{formatMoney(waitingCod)} COD chưa xác nhận</small></span><strong>{numbers.waiting}</strong>
        </div>
        <div className="pd-work-item">
          <span className="pd-work-dot red"/><span><b>Giao thất bại</b><small>Kiểm tra hành trình, liên hệ shipper</small></span><strong>{numbers.failed+numbers.pickup_failed}</strong>
        </div>
        <div className="pd-work-item">
          <span className="pd-work-dot amber"/><span><b>Chưa có mã vận đơn</b><small>Loại Hỏa tốc và đơn bị hủy</small></span><strong>{numbers.missing}</strong>
        </div>
        <div className="pd-work-item">
          <span className="pd-work-dot blue"/><span><b>Đã đến HUB đích</b><small>Đối chiếu vị trí giao nhận</small></span><strong>{numbers.destination}</strong>
        </div>
        <div className="pd-work-item">
          <span className="pd-work-dot blue"/><span><b>Đang giao hàng</b><small>Theo dõi cho tới lúc giao xong</small></span><strong>{numbers.out}</strong>
        </div>
        {(missingGeo>0||missingHubs>0)&&<div className="pd-data-warning">
          <b>Cần chuẩn hóa dữ liệu địa bàn</b>
          <small>{missingGeo} đơn thiếu Phường/Xã hoặc Tỉnh/TP · {missingHubs} đơn đang/đã giao chưa có HUB đích</small>
        </div>}
      </div>
      <div className="pd-surface pd-urgent-orders">
        <div className="pd-surface-title"><h3>Đơn ưu tiên</h3><Link href="/purchase/orders">Mở Đơn nhập →</Link></div>
        <div className="pd-table-scroll"><table className="pd-table">
          <thead><tr><th>Mã đơn</th><th>Cần xử lý</th><th>Phường / Tỉnh</th><th>HUB đích</th><th>Đặt đơn</th></tr></thead>
          <tbody>{!actions.length?<tr><td colSpan={5} className="pd-empty">Không có công việc cần xử lý trong phạm vi lọc.</td></tr>
          :actions.slice(0,12).map(o=><tr key={o.id}>
            <td className="pd-table-strong"><Link href={orderHref(o)}>{o.shopee_order_id||o.id.slice(0,8)}</Link></td>
            <td><span className={'pd-task-tag '+(issuePriority(o)<=1?'high':'')}>{issueLabel(o)}</span></td>
            <td><span className="pd-ward-label">{o.ward}</span><small className="pd-cell-subtitle">{o.province}</small></td>
            <td>{o.destination_hub||'Chưa xác định'}</td>
            <td>{o.order_date?formatDateTime(o.order_date):'—'}</td>
          </tr>)}</tbody>
        </table></div>
        {actions.length>12&&<p className="pd-table-help">Hiển thị 12/{actions.length} đơn ưu tiên; mở Đơn nhập để xem danh sách đầy đủ.</p>}
      </div>
    </section>

    <footer className="pd-footer">
      <span>Đơn thuộc khoảng ngày đặt, tính theo trạng thái mới nhất. Riêng Hỏa tốc là tồn đọng toàn thời gian.</span>
      <div><Link href="/purchase/orders">Quản lý đơn nhập →</Link><Link href="/purchase/tracking">Theo dõi &amp; nhận hàng →</Link></div>
    </footer>
  </div>
}

