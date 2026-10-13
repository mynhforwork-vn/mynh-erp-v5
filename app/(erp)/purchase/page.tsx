import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney } from '@/lib/format'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import {
  toInsightOrder,groupInsightOrders,sumInsightCounts,issueLabel,issuePriority,
  isAwaitingReceipt,insightUnknownLabels,type InsightOrder,type InsightStage,
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
const stageKeys:InsightStage[]=['missing','shipping','destination','out','delivered','cancelled','failed','pickup_failed','ready','express_pending','other']
const metrics:{key:string,label:string,description:string,tone:string}[]=[
  {key:'total',label:'Tổng đơn nhập',description:'Đặt trong khoảng lọc',tone:'neutral'},
  {key:'express',label:'Đơn Hỏa tốc',description:'Theo ngày đặt đơn',tone:'express'},
  {key:'missing',label:'Chờ mã vận đơn',description:'Chưa có MVĐ hiện tại',tone:'warning'},
  {key:'shipping',label:'Đang vận chuyển',description:'Đã lấy / đang trung chuyển',tone:'info'},
  {key:'destination',label:'Đến HUB đích',description:'Trạng thái mới nhất',tone:'indigo'},
  {key:'out',label:'Đang giao hàng',description:'Trạng thái mới nhất',tone:'info'},
  {key:'delivered',label:'Giao thành công',description:'Gồm đơn chờ xác nhận nhận',tone:'success'},
  {key:'cancelled',label:'Đơn bị hủy',description:'Đơn hoặc vận đơn đã hủy',tone:'danger'},
  {key:'failed',label:'Giao thất bại',description:'Cần kiểm tra và xử lý',tone:'danger'},
]

/** Phân trang để tránh trần 1.000 dòng của PostgREST làm sai tổng số. */
async function loadOrders(supabase:any,start:string,end:string){
  const limit=500
  const all:PurchaseInsightOrder[]=[]
  for(let i=0;i<20;i++){
    const {data,error}=await supabase.from('orders')
      .select('id,shopee_order_id,order_date,recipient_address,area,destination_hub,cod,shipping_service,express_delivery_status,order_status,receive_status,shipments(id,tracking_number,carrier,current_tracking_status,is_active,created_at)')
      .is('archived_at',null)
      .gte('order_date',start).lte('order_date',end)
      .order('order_date',{ascending:false})
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
  const result=await loadOrders(supabase,range.start,range.end)
  const datedOrders=result.rows.map(toInsightOrder)
  const sortVi=(a:string,b:string)=>a.localeCompare(b,'vi')
  const provinces=[...new Set(datedOrders.map(x=>x.province))].sort(sortVi)
  const hubs=[...new Set(datedOrders.map(x=>x.destination_hub?.trim()||insightUnknownLabels.hub))].sort(sortVi)
  const selectedProvince=provinces.includes(params.province??'')?params.province??'':''
  const scopedWards=[...new Set(datedOrders.filter(o=>!selectedProvince||o.province===selectedProvince).map(o=>o.ward))].sort(sortVi)
  const selectedWard=scopedWards.includes(params.ward??'')?params.ward??'':''
  const selectedHub=hubs.includes(params.hub??'')?params.hub??'':''
  const selectedStage=stageKeys.includes(params.stage as InsightStage)?params.stage??'':params.stage==='express'?'express':''
  const filtered=datedOrders.filter(o=>
    (!selectedProvince||o.province===selectedProvince)
    &&(!selectedWard||o.ward===selectedWard)
    &&(!selectedHub||(o.destination_hub?.trim()||insightUnknownLabels.hub)===selectedHub)
    &&(!selectedStage||(selectedStage==='express'?o.isExpress:o.stage===selectedStage))
  )
  const numbers=sumInsightCounts(filtered)
  const countryGroups=groupInsightOrders(filtered,o=>o.province)
  const wards=groupInsightOrders(filtered,o=>o.province+'|'+o.ward)
  const hubGroups=groupInsightOrders(filtered,o=>o.destination_hub?.trim()||insightUnknownLabels.hub)
  const actions=filtered.filter(o=>issuePriority(o)<99)
    .sort((a,b)=>issuePriority(a)-issuePriority(b)||String(a.order_date??'').localeCompare(String(b.order_date??'')))
  const waitingOrders=filtered.filter(isAwaitingReceipt)
  const waitingCod=waitingOrders.reduce((sum,o)=>sum+Number(o.cod??0),0)
  const activeIssues=actions.length
  const missingGeo=filtered.filter(o=>o.stage!=='cancelled'&&(o.province===insightUnknownLabels.province||o.ward===insightUnknownLabels.ward)).length
  const missingHubs=filtered.filter(o=>['shipping','destination','out','delivered'].includes(o.stage)&&!o.destination_hub?.trim()).length

  function dashboardHref(updates:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    for(const [k,v] of Object.entries({province:selectedProvince,ward:selectedWard,hub:selectedHub,stage:selectedStage,...updates})){
      if(v)p.set(k,v)
    }
    return '/purchase?'+p.toString()
  }
  function orderHref(o:InsightOrder){const p=new URLSearchParams({order:o.id,range:range.key})
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    return '/purchase/orders?'+p.toString()
  }
  const activeFilters=[selectedProvince,selectedWard,selectedHub,selectedStage].filter(Boolean).length
  const dateHidden=<>
    <input name="range" type="hidden" value={range.key}/>
    {range.key==='custom'&&<><input type="hidden" name="from" value={range.from}/><input type="hidden" name="to" value={range.to}/></>}
  </>

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

    <div className="pd-filter-wrap">
      <PurchaseDateFilter activeRange={range.key} from={range.from} to={range.to}
        label={range.label} showAll
        preserveParams={{province:selectedProvince,ward:selectedWard,hub:selectedHub,stage:selectedStage}}/>
      <form className="pd-location-filters" action="/purchase">
        {dateHidden}
        <label><span>Tỉnh / Thành phố</span><select name="province" defaultValue={selectedProvince} key={'province-'+selectedProvince}>
          <option value="">Tất cả tỉnh/thành</option>
          {provinces.map(s=><option key={s} value={s}>{s}</option>)}
        </select></label>
        <label><span>Phường / Xã</span><select name="ward" defaultValue={selectedWard} key={'ward-'+selectedProvince+'-'+selectedWard}>
          <option value="">Tất cả phường/xã</option>
          {scopedWards.map(s=><option key={s} value={s}>{s}</option>)}
        </select></label>
        <label><span>HUB đích</span><select name="hub" defaultValue={selectedHub}>
          <option value="">Tất cả HUB</option>
          {hubs.map(s=><option key={s} value={s}>{s}</option>)}
        </select></label>
        <label><span>Tiến trình</span><select name="stage" defaultValue={selectedStage}>
          <option value="">Tất cả trạng thái</option>
          {metrics.filter(m=>m.key!=='total').map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
          <option value="pickup_failed">Lấy hàng thất bại</option>
          <option value="ready">Chờ lấy hàng</option>
          <option value="express_pending">Hỏa tốc đang xử lý</option>
          <option value="other">Trạng thái khác</option>
        </select></label>
        <button className="button primary" type="submit">Áp dụng</button>
        {activeFilters>0&&<Link href={dashboardHref({province:null,ward:null,hub:null,stage:null})} className="pd-reset">Xóa lọc ({activeFilters})</Link>}
      </form>
      <p className="pd-filter-note">Khoảng ngày áp dụng cho <strong>thời điểm đặt đơn</strong>. Trạng thái giao hàng, MVĐ và công việc phản ánh <strong>dữ liệu mới nhất</strong> của những đơn trong khoảng chọn.</p>
    </div>

    {result.error&&<div className="error-box" role="alert">Không tải đủ đơn nhập: {result.error}. Không sử dụng tổng số khi nguồn dữ liệu lỗi.</div>}
    {result.truncated&&<div className="error-box" role="alert">Danh sách vượt giới hạn 10.000 đơn. Đổi phạm vi ngày để có số liệu chính xác.</div>}
    <section className="pd-metrics" aria-label="Số liệu nhập hàng trong phạm vi lọc">
      {metrics.map(metric=>{
        const value=numbers[metric.key as keyof typeof numbers]
        const isActive=selectedStage===metric.key
        return <Link href={dashboardHref({stage:isActive?null:metric.key==='total'?null:metric.key})}
          key={metric.key}
          className={'pd-metric pd-tone-'+metric.tone+(isActive?' is-active':'')}>
          <span>{metric.label}</span>
          <strong>{value}</strong>
          <small>{metric.description}</small>
        </Link>
      })}
    </section>

    <div className="pd-context-line">
      <span><b>{numbers.total}</b> đơn trong phạm vi · <b>{numbers.express}</b> Hỏa tốc</span>
      <span><b>{numbers.ready}</b> chờ lấy hàng · <b>{numbers.pickup_failed}</b> lấy hàng lỗi · <b>{numbers.express_pending}</b> Hỏa tốc đang xử lý</span>
      <span>{range.label}</span>
    </div>

    <section className="pd-area-head" id="pd-region">
      <div><span className="module-eyebrow">PHÂN BỔ ĐỊA BÀN</span><h2>Phường/Xã · Tỉnh/Thành phố</h2><p>Đơn thiếu MVĐ, đang trung chuyển và đã giao thành công theo địa chỉ người nhận</p></div>
      <div className="pd-head-stat"><b>{countryGroups.length}</b><span>tỉnh/thành trong bộ lọc</span></div>
    </section>
    <section className="pd-two-columns">
      <div className="pd-surface">
        <div className="pd-surface-title"><h3>Chi tiết theo Phường/Xã</h3><span>{wards.length} nhóm khu vực</span></div>
        <div className="pd-table-scroll"><table className="pd-table">
          <thead><tr><th scope="col">Tỉnh/Thành · Phường/Xã</th><th scope="col">Đơn</th><th scope="col">Chờ MVĐ</th><th scope="col">Vận chuyển</th><th scope="col">Giao thành công</th></tr></thead>
          <tbody>
            {!countryGroups.length&&<tr><td colSpan={5} className="pd-empty">Không có đơn thuộc phạm vi lọc.</td></tr>}
            {countryGroups.map(province=>{
              const children=wards.filter(w=>w.name.startsWith(province.name+'|'))
              return <FragmentProvince key={province.name} province={province} wards={children} href={dashboardHref({province:province.name,ward:null})}/>
            })}
          </tbody>
        </table></div>
        <p className="pd-table-help">Phường/Xã được đọc từ địa chỉ; thông tin thiếu được hiển thị riêng, không suy đoán theo HUB.</p>
      </div>
      <div className="pd-surface" id="pd-hub">
        <div className="pd-surface-title"><h3>Phân bổ theo HUB đích</h3><span>{hubGroups.length} HUB / nhóm</span></div>
        <div className="pd-table-scroll"><table className="pd-table">
          <thead><tr><th>HUB đích</th><th>Đơn</th><th>Vận chuyển</th><th>Đến HUB</th><th>Đang giao</th><th>Giao TC</th></tr></thead>
          <tbody>{!hubGroups.length?<tr><td colSpan={6} className="pd-empty">Chưa có dữ liệu HUB.</td></tr>
          :hubGroups.map(h=><tr key={h.name}>
            <td className="pd-table-strong"><Link href={dashboardHref({hub:h.name})}>{h.name}</Link></td>
            <td>{h.total}</td><td>{h.shipping}</td><td>{h.destination}</td><td>{h.out}</td><td className="pd-num-success">{h.delivered}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="pd-table-help">HUB đích lấy từ đơn hàng, không sử dụng HUB trung chuyển quốc tế làm HUB đích.</p>
      </div>
    </section>

    <section className="pd-action-head" id="pd-action">
      <div><span className="module-eyebrow">CẦN XỬ LÝ NGAY</span><h2>Hàng đợi công việc</h2><p>Sắp theo mức độ ưu tiên · Bấm mã đơn để mở chi tiết</p></div>
      <div className="pd-head-stat"><b>{activeIssues}</b><span>đơn cần theo dõi/xử lý</span></div>
    </section>
    <section className="pd-action-layout">
      <div className="pd-work-summary">
        <Link href={dashboardHref({stage:'delivered'})} className="pd-work-item">
          <span className="pd-work-dot green"/><span><b>Chờ xác nhận nhận hàng</b><small>{formatMoney(waitingCod)} COD chưa xác nhận</small></span><strong>{numbers.waiting}</strong>
        </Link>
        <Link href={dashboardHref({stage:'failed'})} className="pd-work-item">
          <span className="pd-work-dot red"/><span><b>Giao thất bại</b><small>Kiểm tra hành trình, liên hệ shipper</small></span><strong>{numbers.failed+numbers.pickup_failed}</strong>
        </Link>
        <Link href={dashboardHref({stage:'missing'})} className="pd-work-item">
          <span className="pd-work-dot amber"/><span><b>Chưa có mã vận đơn</b><small>Loại Hỏa tốc và đơn bị hủy</small></span><strong>{numbers.missing}</strong>
        </Link>
        <Link href={dashboardHref({stage:'destination'})} className="pd-work-item">
          <span className="pd-work-dot blue"/><span><b>Đã đến HUB đích</b><small>Đối chiếu vị trí giao nhận</small></span><strong>{numbers.destination}</strong>
        </Link>
        <Link href={dashboardHref({stage:'out'})} className="pd-work-item">
          <span className="pd-work-dot blue"/><span><b>Đang giao hàng</b><small>Theo dõi cho tới lúc giao xong</small></span><strong>{numbers.out}</strong>
        </Link>
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
        {actions.length>12&&<p className="pd-table-help">Hiển thị 12/{actions.length} đơn ưu tiên; dùng bộ lọc trạng thái và vùng để thu hẹp.</p>}
      </div>
    </section>

    <footer className="pd-footer">
      <span>Trạng thái hiện tại không phải số đơn phát sinh trạng thái trong khoảng ngày.</span>
      <div><Link href="/purchase/orders">Quản lý đơn nhập →</Link><Link href="/purchase/tracking">Theo dõi &amp; nhận hàng →</Link></div>
    </footer>
  </div>
}

function FragmentProvince({province,wards,href}:{province:{name:string,total:number,missing:number,shipping:number,delivered:number},wards:{name:string,total:number,missing:number,shipping:number,delivered:number}[],href:string}){
  return <>
    <tr className="pd-province-row">
      <td><Link href={href}>{province.name}</Link></td>
      <td><strong>{province.total}</strong></td><td><strong>{province.missing}</strong></td>
      <td><strong>{province.shipping}</strong></td><td><strong>{province.delivered}</strong></td>
    </tr>
    {wards.map(w=><tr key={w.name} className="pd-ward-row">
      <td>{w.name.slice(w.name.indexOf('|')+1)}</td>
      <td>{w.total}</td><td>{w.missing}</td><td>{w.shipping}</td><td className="pd-num-success">{w.delivered}</td>
    </tr>)}
  </>
}
