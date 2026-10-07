import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney } from '@/lib/format'
import { financePeriodLabel,financePeriodStart,normalizeFinancePeriod,withinFinancePeriod } from '@/lib/finance-period'
import { ContextOrderPanel } from '@/components/context-order-panel'
import { FinanceCustomerSettlementTable } from '@/components/finance-customer-settlement-table'

type SP={
  mode?:'shipper'|'customer'
  view?:'batch'|'hub'
  hub?:string
  q?:string
  state?:'all'|'paid'|'waiting'
  period?:string
  order?:string
  orderTab?:'info'|'tracking'|'history'
}
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0

export default async function FinanceSettlementPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const mode=sp.mode==='customer'?'customer':'shipper'
  const view=sp.view==='hub'?'hub':'batch'
  const state=sp.state??'all'
  const q=String(sp.q??'').trim().toLowerCase()
  const selectedHub=String(sp.hub??'').trim()
  const period=normalizeFinancePeriod(sp.period)
  const start=financePeriodStart(period)
  const {supabase}=await requireUser()

  const [shipperResult,waitingResult,customerResult,salesResult,paymentResult,allocationResult]=await Promise.all([
    supabase.from('shipper_payments')
      .select('id,destination_hub,shipper_id,shipper_name,total_cod,actual_transferred,tip,transferred_at,note,destination_shippers(name,phone),warehouses(code,name),shipper_payment_details(order_id,cod_snapshot,orders(shopee_order_id,destination_hub,recipient_name,recipient_phone,receive_status,shipments(tracking_number,current_tracking_status)))')
      .order('transferred_at',{ascending:false}).limit(500),
    supabase.from('orders')
      .select('id,shopee_order_id,destination_hub,cod,recipient_name,recipient_phone,order_date,receive_status,shipping_service,shipments(tracking_number,current_tracking_status)')
      .eq('receive_status','WAITING_RECEIVE')
      .neq('shipping_service','EXPRESS')
      .is('archived_at',null)
      .order('order_date',{ascending:false}).limit(1000),
    supabase.from('customers').select('id,name,phone,address,note,created_at').order('name').limit(1000),
    supabase.from('sales')
      .select('id,invoice_code,customer_id,total_amount,paid_amount,debt_amount,payment_status,sale_status,sale_at')
      .order('sale_at',{ascending:false}).limit(2000),
    supabase.from('customer_payments')
      .select('id,customer_id,amount,paid_at,note,receipt_code,payment_method')
      .order('paid_at',{ascending:false}).limit(1000),
    supabase.from('customer_payment_allocations')
      .select('id,customer_payment_id,sale_id,amount,created_at').limit(3000),
  ])

  const errors=[shipperResult.error,waitingResult.error,customerResult.error,salesResult.error,paymentResult.error,allocationResult.error].filter(Boolean).map((x:any)=>x.message)
  let shipper=((shipperResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.transferred_at,start))
  let waiting=((waitingResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.order_date,start))
  const customers=(customerResult.data??[]) as any[]
  const sales=((salesResult.data??[]) as any[]).filter(x=>x.sale_status!=='CANCELLED')
  const payments=((paymentResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.paid_at,start))
  const allocations=(allocationResult.data??[]) as any[]

  if(q){
    shipper=shipper.filter(x=>[
      x.destination_hub,x.shipper_name,(x.destination_shippers as any)?.name,
      ...(x.shipper_payment_details??[]).map((d:any)=>d.orders?.shopee_order_id),
    ].filter(Boolean).join(' ').toLowerCase().includes(q))
    waiting=waiting.filter(x=>[x.destination_hub,x.shopee_order_id,x.recipient_name,x.recipient_phone].filter(Boolean).join(' ').toLowerCase().includes(q))
  }

  const customerScopeRows=customers.map(customer=>{
    const customerSales=sales.filter(s=>s.customer_id===customer.id)
    const customerPayments=payments.filter(p=>p.customer_id===customer.id)
    const debt=customerSales.reduce((sum,x)=>sum+Math.max(0,num(x.debt_amount)),0)
    const totalSales=customerSales.reduce((sum,x)=>sum+num(x.total_amount),0)
    const paid=customerPayments.reduce((sum,x)=>sum+num(x.amount),0)
    const lastPayment=customerPayments[0]?.paid_at??null
    return {...customer,debt,totalSales,paid,lastPayment,openInvoices:customerSales.filter(x=>num(x.debt_amount)>0).length}
  }).filter(row=>!q||[row.name,row.phone,row.address].filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a,b)=>b.debt-a.debt||a.name.localeCompare(b.name,'vi'))
  const customerRows=customerScopeRows
    .filter(row=>state==='waiting'?row.debt>0:state==='paid'?row.debt<=0:true)


  const hubMap=new Map<string,{hub:string,payments:any[],waiting:any[]}>()
  for(const row of shipper){
    const hub=String(row.destination_hub??row.shipper_payment_details?.[0]?.orders?.destination_hub??'Chưa xác định HUB')
    const group=hubMap.get(hub)??{hub,payments:[],waiting:[]}
    group.payments.push(row)
    hubMap.set(hub,group)
  }
  for(const row of waiting){
    const hub=String(row.destination_hub??'Chưa xác định HUB')
    const group=hubMap.get(hub)??{hub,payments:[],waiting:[]}
    group.waiting.push(row)
    hubMap.set(hub,group)
  }
  let hubs=[...hubMap.values()]
  if(state==='waiting')hubs=hubs.filter(x=>x.waiting.length>0)
  if(state==='paid')hubs=hubs.filter(x=>x.waiting.length===0&&x.payments.length>0)
  hubs.sort((a,b)=>b.waiting.length-a.waiting.length||b.payments.length-a.payments.length||a.hub.localeCompare(b.hub,'vi'))

  const selected=selectedHub?hubMap.get(selectedHub)??null:null
  const totalCod=shipper.reduce((sum,x)=>sum+num(x.total_cod),0)
  const totalTransferred=shipper.reduce((sum,x)=>sum+num(x.actual_transferred),0)
  const totalTip=shipper.reduce((sum,x)=>sum+num(x.tip),0)
  const shipperOrderCount=shipper.reduce((sum,x)=>sum+(x.shipper_payment_details?.length??0),0)
  const waitingCod=waiting.reduce((sum,x)=>sum+num(x.cod),0)

  const totalDebt=customerScopeRows.reduce((sum,x)=>sum+x.debt,0)
  const customersInDebt=customerScopeRows.filter(x=>x.debt>0).length
  const customerScopeIds=new Set(customerScopeRows.map(x=>String(x.id)))
  const scopedPayments=payments.filter(x=>customerScopeIds.has(String(x.customer_id)))
  const scopedPaymentIds=new Set(scopedPayments.map(x=>String(x.id)))
  const collected=scopedPayments.reduce((sum,x)=>sum+num(x.amount),0)
  const allocated=allocations.filter(a=>scopedPaymentIds.has(String(a.customer_payment_id))).reduce((sum,x)=>sum+num(x.amount),0)

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    p.set('mode',mode)
    if(mode==='shipper')p.set('view',view)
    if(period!=='all')p.set('period',period)
    if(sp.q)p.set('q',sp.q)
    if(state!=='all')p.set('state',state)
    if(selectedHub)p.set('hub',selectedHub)
    if(sp.order)p.set('order',sp.order)
    if(sp.orderTab)p.set('orderTab',sp.orderTab)
    for(const [key,value] of Object.entries(extra)){
      if(value===null||value===undefined||value===''||value==='all')p.delete(key)
      else p.set(key,value)
    }
    const qs=p.toString()
    return '/finance/shipper-payments'+(qs?'?'+qs:'')
  }

  function trackingHref(hub:string){
    const p=new URLSearchParams({range:'all',hub,status:'DELIVERED',receive:'WAITING_RECEIVE'})
    return '/purchase/tracking?'+p.toString()
  }

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

  return <div className={'finance-screen finance-settlement-live '+((selected||contextOrder)?'has-slidebar':'')}>
    <div className="finance-settlement-main">
      <header className="page-head finance-page-head">
        <div><span className="module-eyebrow">TÀI CHÍNH</span><h1>Đối soát & Thanh toán</h1><p>Shipper theo đợt thanh toán; HUB dùng để truy vết nguồn giao và đơn chờ nhận.</p></div>
        <div className="head-actions">
          {mode==='shipper'
            ? <Link className="button primary" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
            : <Link className="button primary" href="/sales/debt">Mở công nợ</Link>}
        </div>
      </header>

      {errors.length>0&&<div className="error-box finance-alert">Có dữ liệu chưa tải được: {errors.join(' · ')}</div>}

      <div className="finance-mode-bar">
        <div className="segmented finance-mode-tabs">
          <Link className={mode==='shipper'?'active':''} href={href({mode:'shipper',hub:null})}>Đơn nhập / Shipper</Link>
          <Link className={mode==='customer'?'active':''} href={href({mode:'customer',hub:null,view:null})}>Khách hàng</Link>
        </div>
        <div className="finance-period-tabs compact">
          {([['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này']] as const).map(([key,label])=><Link key={key} href={href({period:key})} className={period===key?'active':''}>{label}</Link>)}
        </div>
      </div>

      <form className="finance-toolbar settlement-toolbar" action="/finance/shipper-payments">
        <input type="hidden" name="mode" value={mode}/>
        {mode==='shipper'&&<input type="hidden" name="view" value={view}/>}
        {period!=='all'&&<input type="hidden" name="period" value={period}/>}
        {selectedHub&&<input type="hidden" name="hub" value={selectedHub}/>}
        {sp.order&&<input type="hidden" name="order" value={sp.order}/>}
        {sp.orderTab&&<input type="hidden" name="orderTab" value={sp.orderTab}/>}
        <input className="search" name="q" defaultValue={sp.q??''} placeholder={mode==='shipper'?'Tìm Shipper / HUB / mã đơn...':'Tìm khách hàng / SĐT...'}/>
        <select name="state" defaultValue={state}>
          <option value="all">Trạng thái</option>
          <option value="waiting">{mode==='shipper'?'Có đơn chờ nhận':'Còn nợ'}</option>
          <option value="paid">{mode==='shipper'?'Đã đối soát':'Đã hết nợ'}</option>
        </select>
        <button className="button small">Lọc</button>
        {(sp.q||state!=='all')&&<Link className="button small" href={href({q:null,state:null})}>Xoá lọc</Link>}
      </form>

      {mode==='shipper'?<>
        <div className="finance-hub-explainer">
          <div><b>HUB đối soát = điểm truy vết, không phải sổ tiền riêng</b><span>HUB cho biết đơn được giao từ đâu và nhóm Shipper nào xử lý. Tiền được ghi nhận theo từng đợt thanh toán; sau khi nhận hàng, HUB chỉ còn là dữ liệu tham chiếu.</span></div>
          <div className="segmented finance-settlement-view">
            <Link className={view==='batch'?'active':''} href={href({view:'batch',hub:null})}>Theo đợt thanh toán</Link>
            <Link className={view==='hub'?'active':''} href={href({view:'hub',hub:null})}>Theo HUB</Link>
          </div>
        </div>

        <section className="finance-kpi-grid finance-settlement-kpis">
          <div className="finance-kpi"><span>Đợt đã thanh toán</span><b>{shipper.length}</b><small>{shipperOrderCount} đơn</small></div>
          <div className="finance-kpi"><span>Tổng COD đã đối soát</span><b>{formatMoney(totalCod)}</b><small>COD snapshot</small></div>
          <div className="finance-kpi"><span>Thực chuyển</span><b className="expense">{formatMoney(totalTransferred)}</b><small>Tiền đã chuyển Shipper</small></div>
          <div className="finance-kpi warning"><span>Chờ nhận / thanh toán</span><b>{waiting.length}</b><small>{formatMoney(waitingCod)}</small></div>
        </section>

        {view==='batch'
          ? <section className="shipper-payment-batches finance-settlement-list">
              {!shipper.length?<div className="card empty">Chưa có đợt thanh toán Shipper trong {financePeriodLabel(period).toLowerCase()}.</div>:shipper.map(p=>{
                const hub=String(p.destination_hub??p.shipper_payment_details?.[0]?.orders?.destination_hub??'Chưa xác định HUB')
                const shipperInfo=(p.destination_shippers as any)??null
                const shipperName=shipperInfo?.name??p.shipper_name??'Shipper chưa gán'
                return <article className="card shipper-payment-batch" key={p.id}>
                  <div className="shipper-payment-batch-head">
                    <div><span className="module-eyebrow">ĐỢT THANH TOÁN</span><h2>{shipperName}</h2><small>HUB nguồn giao: {hub} · {formatDateTime(p.transferred_at)}</small></div>
                    <div className="shipper-payment-batch-metrics"><div><span>Đơn</span><b>{p.shipper_payment_details?.length??0}</b></div><div><span>COD</span><b>{formatMoney(p.total_cod)}</b></div><div><span>Thực chuyển</span><b>{formatMoney(p.actual_transferred)}</b></div><div><span>Tip</span><b>{formatMoney(p.tip)}</b></div></div>
                    <Link className="button small" href={href({view:'hub',hub})}>Xem HUB →</Link>
                  </div>
                </article>
              })}
            </section>
          : <section className="finance-hub-grid">
              {!hubs.length?<div className="card empty">Không có HUB phù hợp.</div>:hubs.map(group=>{
                const cod=group.payments.reduce((sum,x)=>sum+num(x.total_cod),0)
                const transferred=group.payments.reduce((sum,x)=>sum+num(x.actual_transferred),0)
                const tip=group.payments.reduce((sum,x)=>sum+num(x.tip),0)
                const shippers=[...new Set(group.payments.map(x=>(x.destination_shippers as any)?.name??x.shipper_name).filter(Boolean))]
                return <Link className={'finance-hub-card '+(group.waiting.length?'pending':'')} key={group.hub} href={href({view:'hub',hub:group.hub})}>
                  <div className="finance-hub-card-head"><div><span>HUB nguồn giao</span><b>{group.hub}</b></div>{group.waiting.length?<strong>{group.waiting.length} đơn chờ</strong>:<strong className="done">Đã đối soát</strong>}</div>
                  <div className="finance-hub-card-meta"><span>Shipper <b>{shippers.join(', ')||'Chưa gán'}</b></span><span>Đợt <b>{group.payments.length}</b></span><span>Đơn <b>{group.payments.reduce((sum,x)=>sum+(x.shipper_payment_details?.length??0),0)+group.waiting.length}</b></span></div>
                  <div className="finance-hub-card-money"><div><span>COD đã đối soát</span><b>{formatMoney(cod)}</b></div><div><span>Đã chuyển</span><b>{formatMoney(transferred)}</b></div><div><span>Tip</span><b>{formatMoney(tip)}</b></div></div>
                  <small>Click để xem đợt, đơn và thao tác nhận hàng</small>
                </Link>
              })}
            </section>}
      </>:<>
        <section className="finance-kpi-grid finance-settlement-kpis">
          <div className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{formatMoney(totalDebt)}</b><small>{customersInDebt} khách còn nợ</small></div>
          <div className="finance-kpi"><span>Khách hàng</span><b>{customerScopeRows.length}</b><small>{customerScopeRows.reduce((sum,x)=>sum+x.openInvoices,0)} hóa đơn còn nợ</small></div>
          <div className="finance-kpi"><span>Phiếu thu công nợ</span><b>{payments.length}</b><small>{financePeriodLabel(period)}</small></div>
          <div className="finance-kpi"><span>Đã thu</span><b className="income">{formatMoney(collected)}</b><small>Đã phân bổ {formatMoney(allocated)}</small></div>
        </section>
        <section className="card finance-customer-settlement">
          <div className="card-head"><div><h2>Công nợ theo khách hàng</h2><span>Thu tiền thực hiện tại module Công nợ; Finance tự nhận Phiếu thu.</span></div></div>
          <div className="mobile-entity-list mobile-finance-customer-list">
            {!customerRows.length
              ? <div className="mobile-empty-state">Chưa có dữ liệu khách hàng phù hợp.</div>
              : customerRows.map(row=><article className="mobile-finance-customer-card" key={'mobile-'+row.id}>
                  <div className="mobile-finance-customer-head">
                    <div><b>{row.name}</b><span>{row.phone||'Không SĐT'}</span></div>
                    {row.debt>0?<span className="status-pill orange">Còn nợ</span>:<span className="status-pill green">Đã tất toán</span>}
                  </div>
                  <div className="mobile-finance-customer-metrics">
                    <div><span>HĐ còn nợ</span><b>{row.openInvoices}</b></div>
                    <div><span>Tổng mua</span><b>{formatMoney(row.totalSales)}</b></div>
                    <div><span>Phải thu</span><b className="warning-text">{formatMoney(row.debt)}</b></div>
                    <div><span>Đã thu kỳ này</span><b className="income">{formatMoney(row.paid)}</b></div>
                  </div>
                  <div className="mobile-finance-customer-last"><span>Thu gần nhất</span><b>{row.lastPayment?formatDateTime(row.lastPayment):'—'}</b></div>
                </article>)}
          </div>
          <FinanceCustomerSettlementTable rows={customerRows}/>
        </section>
      </>}
    </div>

    {contextOrder&&mode==='shipper'&&<ContextOrderPanel
      order={contextOrder}
      items={contextItems}
      vouchers={contextVouchers}
      trackingEvents={contextTrackingEvents}
      auditRows={contextAuditRows}
      activeTab={contextOrderTab}
      parentLabel="Đối soát Shipper"
      backHref={contextOrderTab!=='info'
        ? href({order:contextOrder.id,orderTab:'info'})
        : href({order:null,orderTab:null})}
      closeHref={href({hub:null,order:null,orderTab:null})}
      infoHref={href({order:contextOrder.id,orderTab:'info'})}
      trackingHref={href({order:contextOrder.id,orderTab:'tracking'})}
      historyHref={href({order:contextOrder.id,orderTab:'history'})}
      openModuleHref={'/purchase/orders?range=all&order='+contextOrder.id}
    />}

    {selected&&mode==='shipper'&&!contextOrder&&<aside className="detail-panel finance-panel finance-hub-live-panel mynh-slide-panel">
      <div className="panel-head"><div><span className="eyebrow">ĐỐI SOÁT HUB</span><h2>{selected.hub}</h2></div><Link className="close" href={href({hub:null})}>×</Link></div>
      <div className="panel-tabs"><span className="active">Tổng quan & thao tác</span></div>
      <div className="panel-scroll finance-hub-panel">
        <div className="finance-hub-purpose"><b>Vai trò của HUB</b><span>Truy vết HUB → Shipper → đơn → COD → tiền đã chuyển. Đơn chưa nhận được xử lý tại Cảnh báo vận chuyển; sau khi nhận, Finance chỉ lưu dấu vết HUB trong đợt thanh toán.</span></div>
        <div className="finance-hub-summary">
          <div><span>Đợt</span><b>{selected.payments.length}</b></div>
          <div><span>Đã đối soát</span><b>{selected.payments.reduce((sum,x)=>sum+(x.shipper_payment_details?.length??0),0)}</b></div>
          <div><span>Chờ nhận</span><b>{selected.waiting.length}</b></div>
          <div><span>COD đã chuyển</span><b>{formatMoney(selected.payments.reduce((sum,x)=>sum+num(x.total_cod),0))}</b></div>
          <div><span>Tip</span><b>{formatMoney(selected.payments.reduce((sum,x)=>sum+num(x.tip),0))}</b></div>
        </div>

        {selected.waiting.length>0&&<section className="finance-hub-live-waiting">
          <div className="finance-hub-section-head"><div><b>Đơn chờ nhận / thanh toán</b><span>{selected.waiting.length} đơn · {formatMoney(selected.waiting.reduce((sum,x)=>sum+num(x.cod),0))}</span></div><Link className="button primary small" href={trackingHref(selected.hub)}>Mở xử lý HUB →</Link></div>
          <div className="finance-hub-orders">{selected.waiting.map(order=>{
            const shipment=Array.isArray(order.shipments)?order.shipments[0]:order.shipments
            return <Link className="finance-hub-order-link" href={href({order:order.id,orderTab:'info'})} key={order.id}><span><b>{order.shopee_order_id??order.id.slice(0,8)}</b><small>{shipment?.tracking_number??'Chưa có MVD'} · {order.recipient_name??'—'}</small></span><span><b>{formatMoney(order.cod)}</b><small>{shipment?.current_tracking_status??'WAITING_RECEIVE'}</small></span></Link>
          })}</div>
        </section>}

        <div className="finance-hub-batches">{selected.payments.map(batch=>{
          const shipperName=(batch.destination_shippers as any)?.name??batch.shipper_name??'Shipper chưa gán'
          return <section className="finance-hub-batch" key={batch.id}>
            <div className="finance-hub-batch-head"><div><b>{shipperName}</b><span>{formatDateTime(batch.transferred_at)} · {batch.shipper_payment_details?.length??0} đơn</span></div><strong>Đã thanh toán</strong></div>
            <div className="finance-hub-batch-metrics"><span>COD <b>{formatMoney(batch.total_cod)}</b></span><span>Thực chuyển <b>{formatMoney(batch.actual_transferred)}</b></span><span>Tip <b>{formatMoney(batch.tip)}</b></span></div>
            <div className="finance-hub-orders">{(batch.shipper_payment_details??[]).map((detail:any)=>{
              const order=detail.orders??{}
              const shipment=Array.isArray(order.shipments)?order.shipments[0]:order.shipments
              return <Link className="finance-hub-order-link" href={href({order:String(detail.order_id),orderTab:'info'})} key={detail.order_id}><span><b>{order.shopee_order_id??detail.order_id.slice(0,8)}</b><small>{shipment?.tracking_number??'—'} · {order.recipient_name??'—'}</small></span><span><b>{formatMoney(detail.cod_snapshot)}</b><small>Đã nhận</small></span></Link>
            })}</div>
          </section>
        })}</div>
      </div>
    </aside>}
  </div>
}
