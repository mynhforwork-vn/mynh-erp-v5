import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney } from '@/lib/format'
import { financePeriodLabel,financePeriodStart,normalizeFinancePeriod,withinFinancePeriod } from '@/lib/finance-period'

type SP={mode?:'shipper'|'customer',period?:string}
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0

export default async function FinanceSettlementPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const mode=sp.mode==='customer'?'customer':'shipper'
  const period=normalizeFinancePeriod(sp.period)
  const start=financePeriodStart(period)
  const {supabase}=await requireUser()

  const [shipperResult,customerResult,salesResult,paymentResult,allocationResult]=await Promise.all([
    supabase.from('shipper_payments')
      .select('id,destination_hub,shipper_id,shipper_name,total_cod,actual_transferred,tip,transferred_at,note,destination_shippers(name,phone),warehouses(code,name),shipper_payment_details(order_id,cod_snapshot,orders(shopee_order_id,destination_hub))')
      .order('transferred_at',{ascending:false}).limit(300),
    supabase.from('customers').select('id,name,phone,address,note,created_at').order('name').limit(1000),
    supabase.from('sales')
      .select('id,invoice_code,customer_id,total_amount,paid_amount,debt_amount,payment_status,sale_status,sale_at')
      .order('sale_at',{ascending:false}).limit(2000),
    supabase.from('customer_payments')
      .select('id,customer_id,amount,paid_at,note,receipt_code')
      .order('paid_at',{ascending:false}).limit(1000),
    supabase.from('customer_payment_allocations')
      .select('id,customer_payment_id,sale_id,amount,created_at').limit(3000),
  ])

  const errors=[shipperResult.error,customerResult.error,salesResult.error,paymentResult.error,allocationResult.error].filter(Boolean).map((x:any)=>x.message)
  const shipper=((shipperResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.transferred_at,start))
  const customers=(customerResult.data??[]) as any[]
  const sales=((salesResult.data??[]) as any[]).filter(x=>x.sale_status!=='CANCELLED')
  const payments=((paymentResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.paid_at,start))
  const allocations=(allocationResult.data??[]) as any[]

  const customerRows=customers.map(customer=>{
    const customerSales=sales.filter(s=>s.customer_id===customer.id)
    const customerPayments=payments.filter(p=>p.customer_id===customer.id)
    const debt=customerSales.reduce((s,x)=>s+Math.max(0,num(x.debt_amount)),0)
    const totalSales=customerSales.reduce((s,x)=>s+num(x.total_amount),0)
    const paid=customerPayments.reduce((s,x)=>s+num(x.amount),0)
    const lastPayment=customerPayments[0]?.paid_at??null
    return {...customer,debt,totalSales,paid,lastPayment,openInvoices:customerSales.filter(x=>num(x.debt_amount)>0).length}
  }).sort((a,b)=>b.debt-a.debt||a.name.localeCompare(b.name,'vi'))

  const totalCod=shipper.reduce((s,x)=>s+num(x.total_cod),0)
  const totalTransferred=shipper.reduce((s,x)=>s+num(x.actual_transferred),0)
  const totalTip=shipper.reduce((s,x)=>s+num(x.tip),0)
  const shipperOrderCount=shipper.reduce((s,x)=>s+(x.shipper_payment_details?.length??0),0)

  const totalDebt=customerRows.reduce((s,x)=>s+x.debt,0)
  const customersInDebt=customerRows.filter(x=>x.debt>0).length
  const collected=payments.reduce((s,x)=>s+num(x.amount),0)
  const allocated=allocations
    .filter(a=>payments.some(p=>p.id===a.customer_payment_id))
    .reduce((s,x)=>s+num(x.amount),0)

  function modeHref(next:'shipper'|'customer'){
    const p=new URLSearchParams()
    p.set('mode',next)
    if(period!=='all')p.set('period',period)
    return '/finance/shipper-payments?'+p.toString()
  }
  function periodHref(next:string){
    const p=new URLSearchParams()
    p.set('mode',mode)
    if(next!=='all')p.set('period',next)
    return '/finance/shipper-payments?'+p.toString()
  }

  return <div className="finance-screen">
    <header className="page-head finance-page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Đối soát & Thanh toán</h1>
        <p>Đối chiếu tiền với Shipper và khách hàng trước khi ghi nhận vào dòng tiền.</p>
      </div>
      <div className="head-actions">
        {mode==='shipper'
          ? <Link className="button primary" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
          : <Link className="button primary" href="/sales/debt">Mở công nợ</Link>}
      </div>
    </header>

    {errors.length>0&&<div className="error-box finance-alert">Có dữ liệu chưa tải được: {errors.join(' · ')}</div>}

    <div className="finance-mode-bar">
      <div className="segmented finance-mode-tabs">
        <Link className={mode==='shipper'?'active':''} href={modeHref('shipper')}>Đơn nhập / Shipper</Link>
        <Link className={mode==='customer'?'active':''} href={modeHref('customer')}>Khách hàng</Link>
      </div>
      <div className="finance-period-tabs compact">
        {[
          ['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này']
        ].map(([key,label])=><Link key={key} href={periodHref(key)} className={period===key?'active':''}>{label}</Link>)}
      </div>
    </div>

    {mode==='shipper'?<>
      <section className="finance-kpi-grid finance-settlement-kpis">
        <div className="finance-kpi"><span>Đợt đối soát</span><b>{shipper.length}</b><small>{shipperOrderCount} đơn</small></div>
        <div className="finance-kpi"><span>Tổng COD</span><b>{formatMoney(totalCod)}</b><small>COD snapshot</small></div>
        <div className="finance-kpi"><span>Thực chuyển</span><b className="expense">{formatMoney(totalTransferred)}</b><small>Tiền đã chuyển</small></div>
        <div className="finance-kpi warning"><span>Tip Shipper</span><b>{formatMoney(totalTip)}</b><small>Thực chuyển − COD</small></div>
      </section>

      <section className="shipper-payment-batches finance-settlement-list">
        {!shipper.length?<div className="card empty">Chưa có đợt đối soát Shipper trong {financePeriodLabel(period).toLowerCase()}.</div>:shipper.map(p=>{
          const hubs=[...new Set((p.shipper_payment_details??[]).map((d:any)=>d.orders?.destination_hub).filter(Boolean))]
          const hub=p.destination_hub??hubs[0]??'Chưa xác định HUB'
          const shipperInfo=(p.destination_shippers as any)??null
          const shipperName=shipperInfo?.name??p.shipper_name??null
          return <article className="card shipper-payment-batch" key={p.id}>
            <div className="shipper-payment-batch-head">
              <div>
                <span className="module-eyebrow">ĐỢT ĐỐI SOÁT</span>
                <h2>{hub}</h2>
                <small>{(p.warehouses as any)?.code??'—'} · {formatDateTime(p.transferred_at)}{shipperName?' · '+shipperName:''}{shipperInfo?.phone?' · '+shipperInfo.phone:''}</small>
              </div>
              <div className="shipper-payment-batch-metrics">
                <div><span>Đơn</span><b>{p.shipper_payment_details?.length??0}</b></div>
                <div><span>COD</span><b>{formatMoney(p.total_cod)}</b></div>
                <div><span>Thực chuyển</span><b>{formatMoney(p.actual_transferred)}</b></div>
                <div><span>Tip</span><b>{formatMoney(p.tip)}</b></div>
              </div>
            </div>
            <div className="compact-table-wrap">
              <table className="table compact-summary-table">
                <thead><tr><th>Mã đơn</th><th>Kho đích</th><th>COD snapshot</th></tr></thead>
                <tbody>{(p.shipper_payment_details??[]).map((d:any)=><tr key={d.order_id}>
                  <td className="strong">{d.orders?.shopee_order_id??d.order_id.slice(0,8)}</td>
                  <td>{d.orders?.destination_hub??'—'}</td>
                  <td className="money">{formatMoney(d.cod_snapshot)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {p.note&&<div className="shipper-payment-note"><span>Ghi chú</span><b>{p.note}</b></div>}
          </article>
        })}
      </section>
    </>:<>
      <section className="finance-kpi-grid finance-settlement-kpis">
        <div className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{formatMoney(totalDebt)}</b><small>{customersInDebt} khách còn nợ</small></div>
        <div className="finance-kpi"><span>Khách hàng</span><b>{customers.length}</b><small>{customerRows.reduce((s,x)=>s+x.openInvoices,0)} hóa đơn còn nợ</small></div>
        <div className="finance-kpi"><span>Phiếu thu công nợ</span><b>{payments.length}</b><small>{financePeriodLabel(period)}</small></div>
        <div className="finance-kpi"><span>Đã thu</span><b className="income">{formatMoney(collected)}</b><small>Đã phân bổ {formatMoney(allocated)}</small></div>
      </section>

      <section className="card finance-customer-settlement">
        <div className="card-head"><div><h2>Công nợ theo khách hàng</h2><span>Thu tiền thực hiện tại module Công nợ, Tài chính dùng để đối soát.</span></div></div>
        <div className="compact-table-wrap">
          <table className="table">
            <thead><tr><th>Khách hàng</th><th>SĐT</th><th>HĐ còn nợ</th><th>Tổng mua</th><th>Còn phải thu</th><th>Đã thu trong kỳ</th><th>Thu gần nhất</th></tr></thead>
            <tbody>{!customerRows.length?<tr><td colSpan={7} className="empty">Chưa có dữ liệu khách hàng thực tế.</td></tr>:customerRows.map(row=><tr key={row.id}>
              <td className="strong">{row.name}</td><td>{row.phone||'—'}</td><td>{row.openInvoices}</td>
              <td className="money">{formatMoney(row.totalSales)}</td>
              <td className="money warning-text">{formatMoney(row.debt)}</td>
              <td className="money finance-money income">{formatMoney(row.paid)}</td>
              <td>{row.lastPayment?formatDateTime(row.lastPayment):'—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card finance-receipts-card">
        <div className="card-head"><div><h2>Phiếu thu công nợ gần nhất</h2><span>{payments.length} phiếu trong kỳ</span></div></div>
        <div className="compact-table-wrap">
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Mã phiếu</th><th>Khách hàng</th><th>Số tiền</th><th>Ghi chú</th></tr></thead>
            <tbody>{!payments.length?<tr><td colSpan={5} className="empty">Chưa phát sinh thu công nợ.</td></tr>:payments.slice(0,50).map(p=>{
              const c=customers.find(x=>x.id===p.customer_id)
              return <tr key={p.id}><td>{formatDateTime(p.paid_at)}</td><td className="strong">{p.receipt_code||'PTN-'+p.id.slice(0,8).toUpperCase()}</td><td>{c?.name||'—'}</td><td className="money finance-money income">{formatMoney(p.amount)}</td><td>{p.note||'—'}</td></tr>
            })}</tbody>
          </table>
        </div>
      </section>
    </>}
  </div>
}
