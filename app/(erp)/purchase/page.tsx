import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { PurchaseInsightChart } from '@/components/purchase-insight-chart'
import {
  toInsightOrder,groupInsightOrders,sumInsightCounts,issueLabel,issuePriority,
  isAwaitingReceipt,isExpressAwaitingDeliveryConfirmation,insightUnknownLabels,type InsightOrder,
  type PurchaseInsightOrder,
} from '@/lib/purchase-dashboard-insights'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'year'|'all'
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
  const keys:RangeKey[]=['today','week','month','custom','7d','30d','year','all']
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
  {key:'month',label:'Tháng này'},
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
  const activeIssues=actions.length
  const missingGeo=filtered.filter(o=>o.stage!=='cancelled'&&(o.province===insightUnknownLabels.province||o.ward===insightUnknownLabels.ward)).length
  const missingHubs=filtered.filter(o=>['shipping','destination','out','delivered'].includes(o.stage)&&!o.destination_hub?.trim()).length
  const actionGroups=[
    {id:'received',title:'Chờ xác nhận nhận hàng',hint:'Đã giao, cần kiểm tra hàng và xác nhận',tone:'green',priority:0},
    {id:'failed',title:'Sự cố giao hàng',hint:'Giao lỗi hoặc lấy hàng thất bại',tone:'red',priority:1},
    {id:'missing',title:'Chưa có mã vận đơn',hint:'Cần bổ sung MVĐ',tone:'amber',priority:2},
    {id:'hub',title:'Đã đến HUB đích',hint:'Đối chiếu HUB và thông tin giao',tone:'blue',priority:3},
    {id:'out',title:'Đang giao hàng',hint:'Theo dõi tiến độ giao',tone:'blue',priority:4},
    {id:'express',title:'Hỏa tốc chờ xác nhận giao',hint:'Kiểm tra thủ công, không tự tracking',tone:'teal',priority:5},
  ].map(group=>({...group,orders:actions.filter(o=>issuePriority(o)===group.priority)}))
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
      <form className="pd-time-calendar" action="/purchase" method="GET" aria-label="Lọc khoảng ngày tùy chỉnh">
        <input type="hidden" name="range" value="custom"/>
        <label><span>Từ</span><input type="date" name="from" defaultValue={range.key==='all'?'':range.from} required aria-label="Từ ngày"/></label>
        <span className="pd-date-separator" aria-hidden="true">→</span>
        <label><span>Đến</span><input type="date" name="to" defaultValue={range.key==='all'?'':range.to} required aria-label="Đến ngày"/></label>
        <button type="submit" className="button primary">Áp dụng</button>
      </form>
    </nav>

    {(result.error||expressResult.error)&&<div className="error-box" role="alert">Không tải đủ đơn nhập: {result.error||expressResult.error}. Không sử dụng tổng số khi nguồn dữ liệu lỗi.</div>}
    {(result.truncated||expressResult.truncated)&&<div className="error-box" role="alert">Danh sách vượt giới hạn 10.000 đơn. Thu hẹp phạm vi hoặc bổ sung truy vấn tổng hợp trước khi sử dụng kết quả.</div>}
    <section className="pd-kpi-viewport" aria-label="Tổng quan đơn nhập">
      <div className="pd-metrics">
        {metrics.map(metric=><div key={metric.key}
          className={'pd-metric pd-tone-'+metric.tone}>
          <span className="pd-metric-label">{metric.label}</span>
          <strong>{numbers[metric.key as keyof typeof numbers]}</strong>
          <small>{metric.description}</small>
          <i className="pd-metric-accent" aria-hidden="true"/>
        </div>)}
      </div>
    </section>
    <div className="pd-workspace">
      <div className="pd-left-rail">
        <section className="pd-summary-table" aria-labelledby="pd-summary-heading">
          <header className="pd-side-head">
            <div><span className="module-eyebrow">BẢNG TỔNG HỢP</span>
              <h2 id="pd-summary-heading">Đơn hàng theo Phường/Xã – Tỉnh/TP</h2>
              <p>Chưa có MVĐ · Đang vận chuyển · Giao thành công</p></div>
          </header>
          <div className="pd-table-scroll">
            <table className="pd-table pd-status-table">
              <thead><tr><th scope="col">Phường/Xã · Tỉnh/TP</th><th scope="col">Chờ MVĐ</th><th scope="col">Vận chuyển</th><th scope="col">Giao TC</th></tr></thead>
              <tbody>
                {!areaGroups.length&&<tr><td colSpan={4} className="pd-empty">Chưa có đơn trong khoảng lọc.</td></tr>}
                {areaGroups.map(group=><tr key={'area-'+group.name}>
                  <th scope="row" title={group.name}>{group.name}</th>
                  <td className="pd-cell-warning">{group.missing}</td><td className="pd-cell-blue">{group.shipping}</td>
                  <td className="pd-cell-green">{group.delivered}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="pd-table-help">Địa bàn lấy từ địa chỉ người nhận; không suy đoán dữ liệu thiếu hoặc HUB.</p>
        </section>

      </div>
      <div className="pd-right-rail">
        <section className="pd-action-panel" aria-labelledby="pd-action-heading">
          <header className="pd-side-head">
            <div><span className="module-eyebrow">ƯU TIÊN VẬN HÀNH</span><h2 id="pd-action-heading">Công việc cần xử lý ngay</h2>
              <p>Phân nhóm theo nghiệp vụ, không cần mở bộ lọc</p></div>
            <span className="pd-action-total">{activeIssues} <small>đơn</small></span>
          </header>
          <div className="action-queue-list pd-action-queue-body">
            {actionGroups.slice(0,3).map(group=><div key={group.id}
              className={'action-queue-summary pd-action-'+group.tone}>
              <div><b>{group.orders.length}</b><span>{group.title}</span></div>
              <small>{group.hint}</small>
            </div>)}
            <div className="pd-queue-secondary" aria-label="Nhóm vận hành tiếp theo">
              {actionGroups.slice(3).map(group=><div key={group.id} className={'pd-queue-mini pd-action-'+group.tone}>
                <span>{group.title}</span><b>{group.orders.length}</b>
              </div>)}
            </div>
            <div className="pd-action-order-heading">
              <strong>Đơn ưu tiên xử lý</strong>
              <small>{actions.length} đơn trong danh sách</small>
            </div>
            <div className="action-queue-orders">
              {actions.slice(0,6).map(o=><Link href={orderHref(o)} key={o.id} prefetch={false}>
                <div><b>{o.shopee_order_id||o.id.slice(0,8)}</b>
                  <span>{o.destination_hub?.trim()||o.ward+' · '+o.province}</span>
                </div>
                <div><span className={'pd-action-status'+(issuePriority(o)<=1?' is-urgent':'')}>{issueLabel(o)}</span>
                  <small>{o.order_date?new Date(o.order_date).toLocaleDateString('vi-VN',{timeZone:'Asia/Bangkok'}):'—'}</small>
                </div>
              </Link>)}
              {!actions.length&&<p className="pd-action-empty">Không có đơn cần xử lý trong phạm vi hiện tại.</p>}
              {actions.length>6&&<p className="pd-group-more">Còn {actions.length-6} đơn, xem trong Đơn nhập.</p>}
            </div>
            {(missingGeo>0||missingHubs>0)&&<p className="pd-data-warning">
              <b>Thiếu dữ liệu địa bàn:</b> {missingGeo} đơn thiếu Phường/Xã hoặc tỉnh; {missingHubs} đơn đang/đã giao thiếu HUB đích.
            </p>}
          </div>
        </section>
      </div>
    </div>
      <section className="pd-chart-section" aria-labelledby="pd-chart-heading">
        <header className="pd-chart-section-head">
          <div><span className="module-eyebrow">BIỂU ĐỒ TRỰC QUAN</span><h2 id="pd-chart-heading">Phân bổ vận chuyển và giao hàng</h2>
            <p>Đối chiếu theo khu vực và HUB đích</p></div>
          <div className="pd-visual-legend"><span className="pd-legend-missing">Chờ MVĐ</span><span className="pd-legend-shipping">Vận chuyển</span><span className="pd-legend-delivered">Giao thành công</span></div>
        </header>
        <div className="pd-chart-grid">
          <PurchaseInsightChart title="Chưa có mã vận đơn · Theo khu vực"
            description="Phường/Xã — Tỉnh/Thành, loại đơn hủy/Hỏa tốc"
            groups={areaGroups} metric="missing" geography="area"/>
          <PurchaseInsightChart title="Đang vận chuyển · Theo khu vực"
            description="Đã lấy hàng, đang vận chuyển/trung chuyển"
            groups={areaGroups} metric="shipping" geography="area"/>
          <PurchaseInsightChart title="Đang vận chuyển · Theo HUB đích"
            description="HUB đích trên đơn, không dùng HUB trung chuyển"
            groups={hubGroups} metric="shipping" variant="column" geography="hub"/>
          <PurchaseInsightChart title="Giao thành công · Theo khu vực"
            description="Đã giao, gồm các đơn chờ xác nhận nhận"
            groups={areaGroups} metric="delivered" geography="area"/>
          <PurchaseInsightChart title="Giao thành công · Theo HUB đích"
            description="Đơn đã giao theo HUB đích"
            groups={hubGroups} metric="delivered" variant="column" geography="hub"/>
        </div>
    </section>
    <footer className="pd-footer">
      <span>Đơn thuộc khoảng ngày đặt, tính theo trạng thái mới nhất. Riêng Hỏa tốc là tồn đọng toàn thời gian.</span>
      <div><Link href="/purchase/orders">Quản lý đơn nhập →</Link><Link href="/purchase/tracking">Theo dõi &amp; nhận hàng →</Link></div>
    </footer>
  </div>
}

