import Link from 'next/link'
import {PurchaseDateFilter} from '@/components/purchase-date-filter'
import { requireUser } from '@/lib/supabase/auth'
import { PurchaseActionQueue,type PurchaseActionItem,type PurchaseActionGroup,type PurchaseDataIssue } from '@/components/purchase-action-queue'
import { PurchaseAreaHubTable } from '@/components/purchase-area-hub-table'
import {
  toInsightOrder,groupInsightOrders,sumInsightCounts,issueLabel,issuePriority,
  isExpressAwaitingDeliveryConfirmation,insightUnknownLabels,type InsightOrder,
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
  // HUB đích chỉ áp dụng cho vận chuyển tiêu chuẩn. Không suy đoán HUB cho Hỏa tốc.
  const hubGroups=groupInsightOrders(filtered.filter(o=>!o.isExpress),
    o=>o.destination_hub?.trim()||insightUnknownLabels.hub)
  // Công việc Hỏa tốc hiện tại không bị bỏ sót vì khác khoảng ngày đặt đơn.
  const datedIds=new Set(filtered.map(o=>o.id))
  const workOrders=[...filtered,...pendingExpress.filter(o=>!datedIds.has(o.id))]
  const actions=workOrders.filter(o=>issuePriority(o)<99)
    .sort((a,b)=>issuePriority(a)-issuePriority(b)||String(a.order_date??'').localeCompare(String(b.order_date??'')))
  const activeIssues=actions.length
  const missingGeoOrders=filtered.filter(o=>o.stage!=='cancelled'&&(o.province===insightUnknownLabels.province||o.ward===insightUnknownLabels.ward))
  // Hỏa tốc không áp dụng HUB đích: không phát cảnh báo sai thiếu HUB.
  const missingHubOrders=filtered.filter(o=>o.shipping_service!=='EXPRESS'
    &&['shipping','destination','out','delivered'].includes(o.stage)&&!o.destination_hub?.trim())
  const expressWithoutHubOrders=filtered.filter(o=>o.shipping_service==='EXPRESS'
    &&o.stage==='delivered'&&!o.destination_hub?.trim())
  const missingGeo=missingGeoOrders.length
  const missingHubs=missingHubOrders.length
  const actionGroups=[
    {id:'received',title:'Chờ xác nhận nhận hàng',hint:'Đã giao, cần kiểm tra hàng và xác nhận',tone:'green',priority:0},
    {id:'failed',title:'Sự cố giao hàng',hint:'Giao lỗi hoặc lấy hàng thất bại',tone:'red',priority:1},
    {id:'missing',title:'Chưa có mã vận đơn',hint:'Cần bổ sung MVĐ',tone:'amber',priority:2},
    {id:'hub',title:'Đã đến HUB đích',hint:'Đối chiếu HUB và thông tin giao',tone:'blue',priority:3},
    {id:'out',title:'Đang giao hàng',hint:'Theo dõi tiến độ giao',tone:'blue',priority:4},
    {id:'express',title:'Hỏa tốc chờ xác nhận giao',hint:'Kiểm tra thủ công, không tự tracking',tone:'teal',priority:5},
  ].map(group=>({...group,orders:actions.filter(o=>issuePriority(o)===group.priority)}))
  function orderHref(o:InsightOrder){const p=new URLSearchParams({order:o.id,range:range.key})
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    return '/purchase/orders?'+p.toString()
  }
  const issueById=new Map<string,PurchaseDataIssue>()
  for(const o of missingGeoOrders){
    issueById.set(o.id,{id:o.id,code:o.shopee_order_id||o.id.slice(0,8),
      detailHref:orderHref(o),reason:'Thiếu thông tin Phường/Xã hoặc Tỉnh/TP'})
  }
  for(const o of missingHubOrders){
    issueById.set(o.id,{id:o.id,code:o.shopee_order_id||o.id.slice(0,8),
      detailHref:orderHref(o),reason:issueById.has(o.id)?'Thiếu địa chỉ và HUB đích':'Đơn tiêu chuẩn chưa có HUB đích'})
  }
  const dataIssues=[...issueById.values()]
  const expressWithoutHub:PurchaseDataIssue[]=expressWithoutHubOrders.map(o=>({
    id:o.id,code:o.shopee_order_id||o.id.slice(0,8),
    detailHref:orderHref(o),reason:'Đơn Hỏa tốc đã giao, không dùng phát hiện HUB'
  }))
  const queueGroups:PurchaseActionGroup[]=actionGroups.map(g=>({
    id:g.id,title:g.title,hint:g.hint,tone:g.tone,priority:g.priority,count:g.orders.length
  }))
  const queueOrders:PurchaseActionItem[]=actions.map(o=>({
    id:o.id,code:o.shopee_order_id||o.id.slice(0,8),detailHref:orderHref(o),
    detail:o.destination_hub?.trim()||o.ward+' · '+o.province,
    status:issueLabel(o),
    date:o.order_date?new Date(o.order_date).toLocaleDateString('vi-VN',{timeZone:'Asia/Bangkok'}):'—',
    priority:issuePriority(o),
  }))
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

    <PurchaseDateFilter activeRange={range.key} from={range.from} to={range.to}
      label={range.label} basePath="/purchase" showAll/>

    {(result.error||expressResult.error)&&<div className="error-box" role="alert">Không tải đủ đơn nhập: {result.error||expressResult.error}. Không sử dụng tổng số khi nguồn dữ liệu lỗi.</div>}
    {(result.truncated||expressResult.truncated)&&<div className="error-box" role="alert">Danh sách vượt giới hạn 10.000 đơn. Thu hẹp phạm vi hoặc bổ sung truy vấn tổng hợp trước khi sử dụng kết quả.</div>}
    <section className="pd-kpi-viewport" aria-label="Tổng quan đơn nhập">
      <div className="pd-metrics kpi-grid order-kpi-grid-v2 entity-status-strip">
        {metrics.map(metric=><div key={metric.key}
          className={'pd-kpi-card kpi-card entity-status-metric '+(metric.tone==='neutral'?'':metric.tone==='indigo'?'info':metric.tone)}>
          <span>{metric.label}</span>
          <b>{numbers[metric.key as keyof typeof numbers]}</b>
          <small>{metric.description}</small>
        </div>)}
      </div>
    </section>
    <div className="pd-workspace">
      <div className="pd-left-rail">
        <section className="pd-summary-table" aria-labelledby="pd-summary-heading">
          <header className="pd-side-head">
            <div><span className="module-eyebrow">BẢNG TỔNG HỢP</span>
              <h2 id="pd-summary-heading">Đơn hàng theo địa bàn và HUB đích</h2>
              <p>Chưa có MVĐ · Đang vận chuyển · Giao thành công · Đơn bị huỷ</p></div>
          </header>
          <PurchaseAreaHubTable areaGroups={areaGroups} hubGroups={hubGroups}/>
          <p className="pd-table-help">HUB lấy từ đơn vận chuyển tiêu chuẩn; Hỏa tốc không áp dụng HUB. Không tự điền dữ liệu thiếu.</p>
        </section>

      </div>
      <div className="pd-right-rail">
        <PurchaseActionQueue groups={queueGroups} orders={queueOrders} total={activeIssues}
          dataIssues={dataIssues} expressWithoutHub={expressWithoutHub}
          missingGeoCount={missingGeo} missingHubCount={missingHubs}/>
      </div>
    </div>
    <footer className="pd-footer">
      <span>Đơn thuộc khoảng ngày đặt, tính theo trạng thái mới nhất. Riêng Hỏa tốc là tồn đọng toàn thời gian.</span>
      <div><Link href="/purchase/orders">Quản lý đơn nhập →</Link><Link href="/purchase/tracking">Theo dõi &amp; nhận hàng →</Link></div>
    </footer>
  </div>
}

