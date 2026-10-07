import Link from 'next/link'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, statusLabel } from '@/lib/format'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={range?:RangeKey,from?:string,to?:string,area?:string}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function localStartIso(dateText:string){return new Date(`${dateText}T00:00:00+07:00`).toISOString()}
function localEndIso(dateText:string){return new Date(`${dateText}T23:59:59.999+07:00`).toISOString()}
function shiftLocalDays(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {from:shiftLocalDays(y,m,d,-daysFromMonday),to:shiftLocalDays(y,m,d,6-daysFromMonday)}
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today
  let to=today
  let label='Hôm nay'
  if(key==='week'){const x=currentWeekRange(p.year,p.month,p.day);from=x.from;to=x.to;label='Tuần này'}
  if(key==='7d'){from=shiftLocalDays(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDays(p.year,p.month,p.day,-29);label='30 ngày'}
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
  return {key,from,to,label,start:localStartIso(from),end:localEndIso(to)}
}
function activeShipment(order:any){
  return (order.shipments??[]).find((s:any)=>s.is_active)??order.shipments?.[0]??null
}
function localDay(iso:string){
  const d=new Date(new Date(iso).getTime()+7*HOUR)
  return ymd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())
}
function shortDay(key:string){
  const [y,m,d]=key.split('-')
  return `${d}/${m}${new Date().getFullYear()===Number(y)?'':('/'+y)}`
}
function num(v:any){return Number.isFinite(Number(v))?Number(v):0}

export default async function SystemDashboard({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const range=resolveRange(sp)
  const areaFilter=String(sp.area??'ALL')
  const {supabase}=await requireUser()
  const now=new Date().toISOString()

  const [
    ordersResult,
    salesResult,
    warehousesResult,
    inventoryResult,
    financeResult,
    shipperResult,
    deliveryEventsResult,
    pendingAlertsResult,
    failedSyncResult,
    providerResult,
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,order_date,area,destination_hub,cod,receive_status,warehouse_status,order_status,shipping_service,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,tracking_enabled,next_track_at,is_active)')
      .is('archived_at',null)
      .gte('order_date',range.start)
      .lte('order_date',range.end)
      .order('order_date',{ascending:false})
      .limit(4000),
    supabase.from('sales')
      .select('id,customer_id,sale_at,total_amount,paid_amount,debt_amount,payment_status,sale_status,customers(name)')
      .gte('sale_at',range.start)
      .lte('sale_at',range.end)
      .order('sale_at',{ascending:false})
      .limit(4000),
    supabase.from('warehouses').select('id,code,name,address').eq('is_active',true).order('code'),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,product_variant_id,sku,product_name,variant_name,quantity')
      .order('warehouse_code')
      .limit(5000),
    supabase.from('finance_transactions')
      .select('id,tx_type,amount,reference_type,reference_id,transaction_at,status,note')
      .gte('transaction_at',range.start)
      .lte('transaction_at',range.end)
      .order('transaction_at',{ascending:false})
      .limit(4000),
    supabase.from('shipper_payments')
      .select('id,destination_hub,shipper_name,total_cod,actual_transferred,tip,transferred_at')
      .gte('transferred_at',range.start)
      .lte('transferred_at',range.end)
      .order('transferred_at',{ascending:false})
      .limit(2000),
    supabase.from('tracking_events')
      .select('shipment_id,event_time,normalized_status,shipments(order_id)')
      .eq('normalized_status','DELIVERED')
      .gte('event_time',range.start)
      .lte('event_time',range.end)
      .order('event_time',{ascending:false})
      .limit(5000),
    supabase.from('alert_events')
      .select('id,orders!inner(archived_at)',{count:'exact',head:true})
      .is('sent_at',null)
      .is('orders.archived_at',null),
    supabase.from('tracking_sync_logs')
      .select('id',{count:'exact',head:true})
      .eq('result','FAILED')
      .gte('started_at',range.start)
      .lte('started_at',range.end),
    supabase.from('tracking_provider_configs')
      .select('id',{count:'exact',head:true})
      .eq('enabled',true),
  ])

  const errors=[
    ordersResult.error,salesResult.error,warehousesResult.error,inventoryResult.error,
    financeResult.error,shipperResult.error,deliveryEventsResult.error,
    pendingAlertsResult.error,failedSyncResult.error,providerResult.error,
  ].filter(Boolean).map((x:any)=>x.message)

  const allOrders=(ordersResult.data??[]) as any[]
  const areaOptions=[...new Set([...allOrders.map(o=>String(o.area??'').trim()).filter(Boolean),...(areaFilter==='ALL'?[]:[areaFilter])])].sort((a,b)=>a.localeCompare(b,'vi'))
  const orders=allOrders.filter(o=>areaFilter==='ALL'||String(o.area??'')===areaFilter)
  const standardOrders=orders.filter(o=>o.shipping_service!=='EXPRESS')
  const sales=((salesResult.data??[]) as any[]).filter(s=>s.sale_status!=='CANCELLED')
  const warehouses=(warehousesResult.data??[]) as any[]
  const inventory=(inventoryResult.data??[]) as any[]
  const finance=((financeResult.data??[]) as any[]).filter(x=>x.status!=='VOID')
  const shipperPayments=(shipperResult.data??[]) as any[]
  const deliveryEvents=(deliveryEventsResult.data??[]) as any[]

  const saleIds=sales.map(s=>s.id)
  let saleItems:any[]=[]
  if(saleIds.length){
    const {data}=await supabase.from('sale_items')
      .select('id,sale_id,warehouse_id,quantity,sale_price,warehouses(code,address)')
      .in('sale_id',saleIds)
      .limit(12000)
    saleItems=(data??[]) as any[]
  }

  const purchaseOrders=orders.length
  const purchaseCod=orders.reduce((sum,o)=>sum+num(o.cod),0)
  const waitingRows=standardOrders.filter(o=>o.receive_status==='WAITING_RECEIVE')
  const waitingReceive=waitingRows.length
  const waitingCod=waitingRows.reduce((sum,o)=>sum+num(o.cod),0)
  const activeTracking=standardOrders.filter(o=>Boolean(activeShipment(o)?.tracking_enabled)).length
  const dueTracking=standardOrders.filter(o=>{
    const s=activeShipment(o)
    return Boolean(s?.tracking_enabled&&s?.next_track_at&&String(s.next_track_at)<=now)
  }).length

  const missingTracking=standardOrders.filter(o=>!String(activeShipment(o)?.tracking_number??'').trim()).length
  const arrivedHub=standardOrders.filter(o=>activeShipment(o)?.current_tracking_status==='ARRIVED_DESTINATION_HUB').length
  const outForDelivery=standardOrders.filter(o=>activeShipment(o)?.current_tracking_status==='OUT_FOR_DELIVERY').length
  const deliveryFailed=standardOrders.filter(o=>activeShipment(o)?.current_tracking_status==='DELIVERY_FAILED').length
  const cancelled=orders.filter(o=>{
    const s=activeShipment(o)?.current_tracking_status
    const os=String(o.order_status??'').toUpperCase()
    return s==='CANCELLED'||os==='CANCELLED'||os==='CANCELED'
  }).length

  const inventoryQty=inventory.reduce((sum,x)=>sum+num(x.quantity),0)
  const lowStock=inventory.filter(x=>num(x.quantity)<=10)
  const zeroStock=inventory.filter(x=>num(x.quantity)<=0)

  const revenue=sales.reduce((sum,s)=>sum+num(s.total_amount),0)
  const collected=sales.reduce((sum,s)=>sum+num(s.paid_amount),0)
  const debt=sales.reduce((sum,s)=>sum+Math.max(0,num(s.debt_amount)),0)
  const debtInvoices=sales.filter(s=>num(s.debt_amount)>0).length

  const representedShipperIds=new Set(
    finance.filter(x=>x.reference_type==='SHIPPER_PAYMENT'&&x.reference_id).map(x=>String(x.reference_id))
  )
  const unpostedShipperExpense=shipperPayments
    .filter(x=>!representedShipperIds.has(String(x.id)))
    .reduce((sum,x)=>sum+num(x.actual_transferred),0)
  const income=finance.filter(x=>x.tx_type==='INCOME').reduce((sum,x)=>sum+num(x.amount),0)
  const ledgerExpense=finance.filter(x=>x.tx_type==='EXPENSE').reduce((sum,x)=>sum+num(x.amount),0)
  const expense=ledgerExpense+unpostedShipperExpense
  const netCash=income-expense
  const shipperTransferred=shipperPayments.reduce((sum,x)=>sum+num(x.actual_transferred),0)
  const shipperTip=shipperPayments.reduce((sum,x)=>sum+num(x.tip),0)

  const byHubMap=new Map<string,{hub:string,orders:number,cod:number,delivered:number,waiting:number,failed:number}>()
  for(const o of standardOrders){
    const hub=String(o.destination_hub??'Chưa xác định')
    const cur=byHubMap.get(hub)??{hub,orders:0,cod:0,delivered:0,waiting:0,failed:0}
    cur.orders++
    cur.cod+=num(o.cod)
    const status=activeShipment(o)?.current_tracking_status
    if(status==='DELIVERED')cur.delivered++
    if(status==='DELIVERY_FAILED')cur.failed++
    if(o.receive_status==='WAITING_RECEIVE')cur.waiting++
    byHubMap.set(hub,cur)
  }
  const byHub=[...byHubMap.values()].sort((a,b)=>b.orders-a.orders||b.cod-a.cod).slice(0,8)

  const itemsBySale=new Map<string,any[]>()
  for(const item of saleItems){
    const key=String(item.sale_id)
    const list=itemsBySale.get(key)??[]
    list.push(item)
    itemsBySale.set(key,list)
  }
  const byWarehouseMap=new Map<string,{code:string,address:string,invoices:number,units:number,revenue:number,debt:number}>()
  for(const sale of sales){
    const items=itemsBySale.get(String(sale.id))??[]
    const first=items[0]
    const code=String(first?.warehouses?.code??'—')
    const cur=byWarehouseMap.get(code)??{code,address:String(first?.warehouses?.address??''),invoices:0,units:0,revenue:0,debt:0}
    cur.invoices++
    cur.units+=items.reduce((sum,item)=>sum+num(item.quantity),0)
    cur.revenue+=num(sale.total_amount)
    cur.debt+=Math.max(0,num(sale.debt_amount))
    byWarehouseMap.set(code,cur)
  }
  const byWarehouse=warehouses.map(w=>{
    const cur=byWarehouseMap.get(String(w.code))??{code:String(w.code),address:String(w.address??''),invoices:0,units:0,revenue:0,debt:0}
    return {...cur,invoiceCount:cur.invoices}
  })

  const inventoryByWarehouse=warehouses.map(w=>{
    const rows=inventory.filter(x=>String(x.warehouse_id)===String(w.id)||String(x.warehouse_code)===String(w.code))
    return {
      code:String(w.code),
      address:String(w.address??w.name??''),
      sku:rows.length,
      quantity:rows.reduce((sum,x)=>sum+num(x.quantity),0),
      low:rows.filter(x=>num(x.quantity)<=10).length,
      zero:rows.filter(x=>num(x.quantity)<=0).length,
    }
  })

  const deliveredByDay=new Map<string,Set<string>>()
  for(const event of deliveryEvents){
    const day=localDay(String(event.event_time))
    const orderId=String((event.shipments as any)?.order_id??event.shipment_id)
    const set=deliveredByDay.get(day)??new Set<string>()
    set.add(orderId)
    deliveredByDay.set(day,set)
  }
  const daily=new Map<string,{day:string,orders:number,delivered:number,invoices:number,revenue:number}>()
  for(const o of orders){
    const day=localDay(String(o.order_date))
    const cur=daily.get(day)??{day,orders:0,delivered:0,invoices:0,revenue:0}
    cur.orders++
    daily.set(day,cur)
  }
  for(const s of sales){
    const day=localDay(String(s.sale_at))
    const cur=daily.get(day)??{day,orders:0,delivered:0,invoices:0,revenue:0}
    cur.invoices++
    cur.revenue+=num(s.total_amount)
    daily.set(day,cur)
  }
  for(const [day,set] of deliveredByDay){
    const cur=daily.get(day)??{day,orders:0,delivered:0,invoices:0,revenue:0}
    cur.delivered=set.size
    daily.set(day,cur)
  }
  const dailyRows=[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-10)
  const maxDay=Math.max(1,...dailyRows.map(x=>Math.max(x.orders,x.delivered,x.invoices)))

  const urgentOrders=standardOrders
    .filter(o=>{
      const s=activeShipment(o)?.current_tracking_status
      return o.receive_status==='WAITING_RECEIVE'||['DELIVERY_FAILED','OUT_FOR_DELIVERY','ARRIVED_DESTINATION_HUB'].includes(String(s))
    })
    .sort((a,b)=>{
      const rank=(o:any)=>{
        if(o.receive_status==='WAITING_RECEIVE')return 0
        const s=activeShipment(o)?.current_tracking_status
        if(s==='DELIVERY_FAILED')return 1
        if(s==='OUT_FOR_DELIVERY')return 2
        return 3
      }
      return rank(a)-rank(b)||new Date(String(b.order_date)).getTime()-new Date(String(a.order_date)).getTime()
    })
    .slice(0,7)

  const recentActivity=[
    ...orders.slice(0,6).map(o=>({
      id:'o-'+o.id,time:String(o.order_date),kind:'MUA',title:String(o.shopee_order_id??o.id).slice(0,24),
      detail:`${o.erp_users?.username??'—'} · ${formatMoney(o.cod)}`,href:`/purchase/orders?order=${o.id}`
    })),
    ...sales.slice(0,6).map(s=>({
      id:'s-'+s.id,time:String(s.sale_at),kind:'BÁN',title:'POS-'+String(s.id).slice(0,8).toUpperCase(),
      detail:`${s.customers?.name??'Khách lẻ'} · ${formatMoney(s.total_amount)}`,href:`/sales/history?sale=${s.id}`
    })),
  ].sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime()).slice(0,8)

  function rootHref(extra:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    if(areaFilter!=='ALL')p.set('area',areaFilter)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    return '/?'+p.toString()
  }
  function purchaseHref(path:string,extra:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    for(const [k,v] of Object.entries(extra)){
      if(v!==null&&v!==undefined&&v!=='')p.set(k,v)
    }
    return path+'?'+p.toString()
  }

  return <div className="system-dashboard-v1">
    <header className="page-head system-dashboard-head">
      <div>
        <span className="module-eyebrow">MYNH ERP · SYSTEM COMMAND CENTER</span>
        <h1>Tổng quan hệ thống</h1>
        <p>Mua hàng · Tracking · Kho · Bán hàng · Công nợ · Tài chính trên một màn hình điều hành</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/sales/pos">Mở POS</Link>
        <Link className="button primary" href="/purchase/orders?mode=create">+ Tạo đơn nhập</Link>
      </div>
    </header>

    <PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      basePath="/"
      showAll
      extended
      preserveParams={{area:areaFilter==='ALL'?null:areaFilter}}
    />

    <div className="system-scope-row">
      <div className="system-area-filter">
        <span>Khu vực mua hàng</span>
        <Link className={areaFilter==='ALL'?'active':''} href={rootHref({area:null})}>Tất cả</Link>
        {areaOptions.map(area=><Link key={area} className={areaFilter===area?'active':''} href={rootHref({area})}>{area}</Link>)}
      </div>
      <div className="system-health-inline">
        <span className="ok-dot">● {providerResult.count??0} Tracking provider</span>
        <span>{pendingAlertsResult.count??0} cảnh báo chờ gửi</span>
        <span>{failedSyncResult.count??0} lỗi sync trong kỳ</span>
      </div>
    </div>

    {errors.length>0&&<div className="error-box">Có dữ liệu chưa tải được: {errors.join(' · ')}</div>}

    <section className="system-kpi-strip">
      <Link href={purchaseHref('/purchase/orders')} className="system-kpi">
        <span>Đơn nhập</span><b>{purchaseOrders}</b><small>{formatMoney(purchaseCod)} COD</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'DELIVERED',receive:'WAITING_RECEIVE'})} className="system-kpi warning">
        <span>Chờ nhận hàng</span><b>{waitingReceive}</b><small>{formatMoney(waitingCod)}</small>
      </Link>
      <Link href={purchaseHref('/purchase/tracking')} className="system-kpi info">
        <span>Đang Tracking</span><b>{activeTracking}</b><small>{dueTracking} đến hạn cập nhật</small>
      </Link>
      <Link href="/warehouse/inventory" className="system-kpi">
        <span>Tồn kho</span><b>{inventoryQty}</b><small>{lowStock.length} SKU tồn ≤ 10</small>
      </Link>
      <Link href="/sales" className="system-kpi success">
        <span>Doanh thu bán</span><b className="money">{formatMoney(revenue)}</b><small>{sales.length} hóa đơn</small>
      </Link>
      <Link href="/sales/history" className="system-kpi">
        <span>Đã thu</span><b className="money">{formatMoney(collected)}</b><small>{revenue?Math.round(collected/revenue*100):0}% doanh thu</small>
      </Link>
      <Link href="/sales/debt" className="system-kpi warning">
        <span>Công nợ</span><b className="money">{formatMoney(debt)}</b><small>{debtInvoices} hóa đơn còn nợ</small>
      </Link>
      <Link href="/finance" className={'system-kpi '+(netCash<0?'danger':'success')}>
        <span>Dòng tiền ròng</span><b className="money">{formatMoney(netCash)}</b><small>Thu {formatMoney(income)} · Chi {formatMoney(expense)}</small>
      </Link>
    </section>

    <section className="system-attention-strip">
      <div className="system-attention-title">
        <span>ƯU TIÊN XỬ LÝ</span>
        <b>{range.label}</b>
      </div>
      <Link href={purchaseHref('/purchase/orders',{tracking:'missing'})}><span>Chưa có MVD</span><b>{missingTracking}</b></Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'ARRIVED_DESTINATION_HUB'})}><span>Đến HUB</span><b>{arrivedHub}</b></Link>
      <Link href={purchaseHref('/purchase/tracking',{status:'OUT_FOR_DELIVERY'})}><span>Đang giao</span><b>{outForDelivery}</b></Link>
      <Link className={deliveryFailed?'danger':''} href={purchaseHref('/purchase/tracking',{status:'DELIVERY_FAILED'})}><span>Giao lỗi</span><b>{deliveryFailed}</b></Link>
      <Link className={waitingReceive?'warning':''} href={purchaseHref('/purchase/tracking',{status:'DELIVERED',receive:'WAITING_RECEIVE'})}><span>Chờ nhận</span><b>{waitingReceive}</b></Link>
      <Link className={lowStock.length?'warning':''} href="/warehouse/inventory"><span>Tồn thấp</span><b>{lowStock.length}</b></Link>
      <Link className={debtInvoices?'warning':''} href="/sales/debt"><span>HĐ còn nợ</span><b>{debtInvoices}</b></Link>
      <Link className={(failedSyncResult.count??0)>0?'danger':''} href="/settings?section=tracking"><span>Lỗi sync</span><b>{failedSyncResult.count??0}</b></Link>
    </section>

    <section className="system-grid system-grid-primary">
      <div className="card system-hub-card">
        <div className="card-head">
          <div><h2>Mua hàng theo HUB đích</h2><span className="muted">Số đơn, COD, giao thành công và chờ xác nhận nhận</span></div>
          <Link href={purchaseHref('/purchase')}>Tổng quan mua hàng</Link>
        </div>
        <div className="compact-table-wrap">
          <table className="table system-summary-table">
            <thead><tr><th>HUB đích</th><th>Đơn</th><th>COD</th><th>Đã giao</th><th>Chờ nhận</th><th>Giao lỗi</th></tr></thead>
            <tbody>{!byHub.length
              ? <tr><td colSpan={6} className="empty">Chưa có đơn trong khoảng đang xem.</td></tr>
              : byHub.map(x=><tr key={x.hub}>
                  <td><b>{x.hub}</b></td><td>{x.orders}</td><td className="money">{formatMoney(x.cod)}</td>
                  <td>{x.delivered}</td><td className={x.waiting?'warning-text':''}>{x.waiting}</td>
                  <td className={x.failed?'danger-text':''}>{x.failed}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card system-urgent-card">
        <div className="card-head">
          <div><h2>Đơn cần xử lý ngay</h2><span className="muted">Ưu tiên nhận hàng và ngoại lệ vận chuyển</span></div>
          <Link href={purchaseHref('/purchase/tracking')}>Mở Tracking</Link>
        </div>
        <div className="system-urgent-list">
          {!urgentOrders.length
            ? <div className="empty compact">Không có đơn cần xử lý ngay.</div>
            : urgentOrders.map(o=>{
                const s=activeShipment(o)
                return <Link key={o.id} href={`/purchase/orders?order=${o.id}`} className="system-urgent-row">
                  <div>
                    <b>{o.shopee_order_id??String(o.id).slice(0,8)}</b>
                    <span>{s?.tracking_number??'Chưa có MVD'} · {o.destination_hub??'Chưa có HUB'}</span>
                  </div>
                  <div>
                    <span className={`status-pill status-${String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(s?.current_tracking_status)}</span>
                    {o.receive_status==='WAITING_RECEIVE'&&<small>Chờ nhận</small>}
                  </div>
                </Link>
              })}
        </div>
      </div>
    </section>

    <section className="system-grid system-grid-secondary">
      <div className="card">
        <div className="card-head"><div><h2>Bán hàng theo kho</h2><span className="muted">Doanh thu và công nợ theo nơi xuất bán</span></div><Link href="/sales">Tổng quan bán hàng</Link></div>
        <div className="compact-table-wrap">
          <table className="table system-summary-table">
            <thead><tr><th>Kho</th><th>Hóa đơn</th><th>SP bán</th><th>Doanh thu</th><th>Công nợ</th></tr></thead>
            <tbody>{byWarehouse.map(x=><tr key={x.code}>
              <td><b>{x.code}</b><small>{x.address}</small></td><td>{x.invoiceCount}</td><td>{x.units}</td>
              <td className="money">{formatMoney(x.revenue)}</td><td className={x.debt?'money warning-text':'money'}>{formatMoney(x.debt)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Sức khỏe tồn kho</h2><span className="muted">Tồn hiện tại, không phụ thuộc khoảng thời gian</span></div><Link href="/warehouse/inventory">Mở tồn kho</Link></div>
        <div className="system-inventory-board">
          {inventoryByWarehouse.map(x=><Link href="/warehouse/inventory" className="system-inventory-row" key={x.code}>
            <div><b>{x.code}</b><span>{x.address}</span></div>
            <div><strong>{x.quantity}</strong><span>tồn</span></div>
            <div className={x.low?'warning-text':''}><strong>{x.low}</strong><span>SKU thấp</span></div>
            <div className={x.zero?'danger-text':''}><strong>{x.zero}</strong><span>hết hàng</span></div>
          </Link>)}
          {!inventoryByWarehouse.length&&<div className="empty compact">Chưa cấu hình kho.</div>}
        </div>
      </div>

      <div className="card system-finance-card">
        <div className="card-head"><div><h2>Dòng tiền & đối soát</h2><span className="muted">Thu / Chi và tiền chuyển Shipper trong kỳ</span></div><Link href="/finance">Tài chính</Link></div>
        <div className="system-finance-metrics">
          <div><span>Tổng thu</span><b className="success-text">{formatMoney(income)}</b></div>
          <div><span>Tổng chi</span><b className="danger-text">{formatMoney(expense)}</b></div>
          <div><span>Dòng tiền ròng</span><b className={netCash<0?'danger-text':''}>{formatMoney(netCash)}</b></div>
          <div><span>Đã chuyển Shipper</span><b>{formatMoney(shipperTransferred)}</b></div>
          <div><span>Tip Shipper</span><b>{formatMoney(shipperTip)}</b></div>
        </div>
        <div className="system-finance-bar">
          <i><em style={{width:`${Math.min(100,income/Math.max(income,expense,1)*100)}%`}}/></i>
          <i className="expense"><em style={{width:`${Math.min(100,expense/Math.max(income,expense,1)*100)}%`}}/></i>
        </div>
      </div>
    </section>

    <section className="system-grid system-grid-bottom">
      <div className="card system-trend-card">
        <div className="card-head">
          <div><h2>Nhịp vận hành</h2><span className="muted">10 ngày có phát sinh gần nhất · Đơn nhập / giao thành công / hóa đơn bán</span></div>
        </div>
        {!dailyRows.length
          ? <div className="empty compact">Chưa có phát sinh trong kỳ.</div>
          : <div className="system-trend-list">
              {dailyRows.map(x=><div className="system-trend-row" key={x.day}>
                <span className="day">{shortDay(x.day)}</span>
                <div className="bars">
                  <i title="Đơn nhập"><em className="purchase" style={{width:`${Math.max(x.orders?5:0,x.orders/maxDay*100)}%`}}/></i>
                  <i title="Giao thành công"><em className="delivered" style={{width:`${Math.max(x.delivered?5:0,x.delivered/maxDay*100)}%`}}/></i>
                  <i title="Hóa đơn bán"><em className="sales" style={{width:`${Math.max(x.invoices?5:0,x.invoices/maxDay*100)}%`}}/></i>
                </div>
                <div className="values"><b>{x.orders}</b><b>{x.delivered}</b><b>{x.invoices}</b><span>{formatMoney(x.revenue)}</span></div>
              </div>)}
            </div>}
        <div className="system-trend-legend">
          <span><i className="purchase"/>Đơn nhập</span><span><i className="delivered"/>Giao thành công</span><span><i className="sales"/>Hóa đơn bán</span>
        </div>
      </div>

      <div className="card system-recent-card">
        <div className="card-head"><div><h2>Hoạt động gần nhất</h2><span className="muted">Mua và bán trong khoảng đang xem</span></div></div>
        <div className="system-recent-list">
          {!recentActivity.length
            ? <div className="empty compact">Chưa có hoạt động.</div>
            : recentActivity.map(x=><Link href={x.href} key={x.id} className="system-recent-row">
                <span className={'module '+(x.kind==='MUA'?'purchase':'sales')}>{x.kind}</span>
                <div><b>{x.title}</b><span>{x.detail}</span></div>
                <small>{formatDateTime(x.time)}</small>
              </Link>)}
        </div>
      </div>
    </section>

    <footer className="system-dashboard-footer">
      <div><span>Kho hoạt động</span><b>{warehouses.length}</b></div>
      <div><span>Provider Tracking</span><b>{providerResult.count??0}</b></div>
      <div><span>Cảnh báo chờ gửi</span><b>{pendingAlertsResult.count??0}</b></div>
      <div><span>Đơn bị huỷ</span><b>{cancelled}</b></div>
      <div><span>SKU hết hàng</span><b>{zeroStock.length}</b></div>
      <div><span>Đợt đối soát Shipper</span><b>{shipperPayments.length}</b></div>
    </footer>
  </div>
}
