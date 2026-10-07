import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatMoney } from '@/lib/format'
import { displayVnDateKey,financePeriodLabel,financePeriodStart,normalizeFinancePeriod,withinFinancePeriod,vnDateKey } from '@/lib/finance-period'
import { FinanceReportDayTable } from '@/components/finance-report-day-table'

type SP={period?:string}
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0

export default async function FinanceReportsPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const period=normalizeFinancePeriod(sp.period)
  const start=financePeriodStart(period)
  const {supabase}=await requireUser()

  const [txResult,categoryResult,salesResult,itemsResult,shipperResult]=await Promise.all([
    supabase.from('finance_transactions')
      .select('id,tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,status')
      .order('transaction_at',{ascending:false}).limit(5000),
    supabase.from('finance_categories').select('id,code,name,tx_type,parent_id'),
    supabase.from('sales').select('id,invoice_code,total_amount,paid_amount,debt_amount,sale_status,sale_at').order('sale_at',{ascending:false}).limit(3000),
    supabase.from('sale_items').select('id,sale_id,quantity,unit_cost,sale_price').limit(10000),
    supabase.from('shipper_payments').select('id,total_cod,actual_transferred,tip,transferred_at').order('transferred_at',{ascending:false}).limit(2000),
  ])

  const errors=[txResult.error,categoryResult.error,salesResult.error,itemsResult.error,shipperResult.error].filter(Boolean).map((x:any)=>x.message)
  const categories=(categoryResult.data??[]) as any[]
  const categoryMap=new Map(categories.map(c=>[c.id,c]))
  const tx=((txResult.data??[]) as any[]).filter(x=>x.status!=='VOID'&&withinFinancePeriod(x.transaction_at,start))
  const sales=((salesResult.data??[]) as any[]).filter(x=>x.sale_status!=='CANCELLED'&&withinFinancePeriod(x.sale_at,start))
  const saleIds=new Set(sales.map(x=>x.id))
  const items=((itemsResult.data??[]) as any[]).filter(x=>saleIds.has(x.sale_id))
  const shipper=((shipperResult.data??[]) as any[]).filter(x=>withinFinancePeriod(x.transferred_at,start))

  const revenue=sales.reduce((s,x)=>s+num(x.total_amount),0)
  const cashCollected=sales.reduce((s,x)=>s+num(x.paid_amount),0)
  const receivable=sales.reduce((s,x)=>s+Math.max(0,num(x.debt_amount)),0)
  const cogs=items.reduce((s,x)=>s+num(x.quantity)*num(x.unit_cost),0)
  const grossProfit=revenue-cogs

  const representedShipperIds=new Set(tx.filter(x=>x.reference_type==='SHIPPER_PAYMENT'&&x.reference_id).map(x=>x.reference_id))
  const extraShipperExpense=shipper.filter(x=>!representedShipperIds.has(x.id)).reduce((s,x)=>s+num(x.actual_transferred),0)
  const income=tx.filter(x=>x.tx_type==='INCOME').reduce((s,x)=>s+num(x.amount),0)
  const ledgerExpense=tx.filter(x=>x.tx_type==='EXPENSE').reduce((s,x)=>s+num(x.amount),0)
  const totalExpense=ledgerExpense+extraShipperExpense

  const operatingExpense=tx.filter(x=>{
    if(x.tx_type!=='EXPENSE')return false
    const code=categoryMap.get(x.category_id)?.code??x.category
    return !['PURCHASE_PAYMENT','SHIPPER_COD'].includes(code)
  }).reduce((s,x)=>s+num(x.amount),0)
  const operatingResult=grossProfit-operatingExpense

  const categoryTotals=new Map<string,number>()
  for(const row of tx.filter(x=>x.tx_type==='EXPENSE')){
    const cat=row.category_id?categoryMap.get(row.category_id):null
    const name=cat?.name??(row.category==='SHIPPER_COD'?'Thanh toán đơn nhập':row.category==='SHIPPER_TIP'?'Tip Shipper':row.category||'Chi khác')
    categoryTotals.set(name,(categoryTotals.get(name)??0)+num(row.amount))
  }
  if(extraShipperExpense>0)categoryTotals.set('Đối soát Shipper chưa vào sổ',(categoryTotals.get('Đối soát Shipper chưa vào sổ')??0)+extraShipperExpense)
  const categoriesRows=[...categoryTotals.entries()].sort((a,b)=>b[1]-a[1])
  const categoryMax=Math.max(1,...categoriesRows.map(x=>x[1]))

  const days=new Map<string,{income:number,expense:number,revenue:number}>()
  function day(key:string){
    if(!days.has(key))days.set(key,{income:0,expense:0,revenue:0})
    return days.get(key)!
  }
  for(const row of tx){
    const d=day(vnDateKey(row.transaction_at))
    if(row.tx_type==='INCOME')d.income+=num(row.amount)
    else d.expense+=num(row.amount)
  }
  for(const row of shipper.filter(x=>!representedShipperIds.has(x.id)))day(vnDateKey(row.transferred_at)).expense+=num(row.actual_transferred)
  for(const row of sales)day(vnDateKey(row.sale_at)).revenue+=num(row.total_amount)
  const dayRows=[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,31)

  function href(next:string){return '/finance/reports'+(next==='all'?'':'?period='+next)}

  return <div className="finance-screen">
    <header className="page-head finance-page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Báo cáo tài chính</h1>
        <p>Báo cáo quản trị nội bộ: dòng tiền, thu/chi, công nợ và hiệu quả bán hàng.</p>
      </div>
      <div className="head-actions"><Link className="button" href="/finance">Tổng quan</Link><Link className="button" href="/finance/cashflow">Thu / Chi</Link></div>
    </header>

    {errors.length>0&&<div className="error-box finance-alert">Có dữ liệu chưa tải được: {errors.join(' · ')}</div>}

    <nav className="finance-period-tabs" aria-label="Khoảng thời gian báo cáo">
      {[
        ['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này']
      ].map(([key,label])=><Link key={key} href={href(key)} className={period===key?'active':''}>{label}</Link>)}
      <span>{financePeriodLabel(period)}</span>
    </nav>

    <section className="finance-report-section">
      <div className="finance-report-title"><div><span>01</span><h2>Dòng tiền</h2></div><small>Tiền thực tế đã ghi nhận</small></div>
      <div className="finance-kpi-grid finance-report-kpis">
        <div className="finance-kpi"><span>Tiền vào</span><b className="income">{formatMoney(income)}</b><small>Sổ tài chính</small></div>
        <div className="finance-kpi"><span>Tiền ra</span><b className="expense">{formatMoney(totalExpense)}</b><small>Gồm đối soát Shipper</small></div>
        <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{formatMoney(income-totalExpense)}</b><small>Tiền vào − Tiền ra</small></div>
      </div>
    </section>

    <section className="finance-report-section">
      <div className="finance-report-title"><div><span>02</span><h2>Hiệu quả bán hàng</h2></div><small>Không phải báo cáo kế toán pháp định</small></div>
      <div className="finance-kpi-grid finance-report-kpis five">
        <div className="finance-kpi"><span>Doanh thu</span><b>{formatMoney(revenue)}</b><small>{sales.length} đơn bán</small></div>
        <div className="finance-kpi"><span>Đã thu từ đơn bán</span><b className="income">{formatMoney(cashCollected)}</b><small>Paid amount</small></div>
        <div className="finance-kpi"><span>Giá vốn</span><b>{formatMoney(cogs)}</b><small>Theo unit cost lúc bán</small></div>
        <div className="finance-kpi"><span>Lợi nhuận gộp</span><b>{formatMoney(grossProfit)}</b><small>Doanh thu − Giá vốn</small></div>
        <div className="finance-kpi warning"><span>Phải thu</span><b>{formatMoney(receivable)}</b><small>Công nợ đơn bán</small></div>
      </div>
      <div className="finance-management-note">
        <span>Kết quả vận hành</span><b>{formatMoney(operatingResult)}</b>
        <small>= Lợi nhuận gộp − chi phí vận hành đã ghi trong Thu/Chi; không trừ lại khoản thanh toán đơn nhập để tránh tính trùng giá vốn.</small>
      </div>
    </section>

    <section className="finance-report-grid">
      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Chi theo hạng mục</h2><span>{categoriesRows.length} hạng mục phát sinh</span></div></div>
        {!categoriesRows.length?<div className="empty compact">Chưa có khoản chi.</div>:<div className="finance-category-bars report">
          {categoriesRows.slice(0,12).map(([name,value])=><div key={name}>
            <div><span>{name}</span><b>{formatMoney(value)}</b></div>
            <i><em style={{width:Math.max(3,Math.round(value/categoryMax*100))+'%'}}/></i>
          </div>)}
        </div>}
      </div>

      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Đối soát Shipper</h2><span>{shipper.length} đợt</span></div></div>
        <div className="finance-report-summary-list">
          <div><span>Tổng COD</span><b>{formatMoney(shipper.reduce((s,x)=>s+num(x.total_cod),0))}</b></div>
          <div><span>Thực chuyển</span><b>{formatMoney(shipper.reduce((s,x)=>s+num(x.actual_transferred),0))}</b></div>
          <div><span>Tip Shipper</span><b>{formatMoney(shipper.reduce((s,x)=>s+num(x.tip),0))}</b></div>
          <div><span>Chi phí vận hành</span><b>{formatMoney(operatingExpense)}</b></div>
        </div>
      </div>
    </section>

    <section className="card finance-report-table-card">
      <div className="card-head"><div><h2>Theo ngày</h2><span>Tối đa 31 ngày có phát sinh</span></div></div>
      <div className="mobile-entity-list mobile-finance-report-days">
        {!dayRows.length
          ? <div className="mobile-empty-state">Chưa có dữ liệu trong kỳ.</div>
          : dayRows.map(([key,row])=><article className="mobile-finance-day-card" key={'mobile-'+key}>
              <div className="mobile-finance-day-head">
                <b>{displayVnDateKey(key)}</b>
                <strong className={row.income-row.expense>=0?'income':'expense'}>{formatMoney(row.income-row.expense)}</strong>
              </div>
              <div className="mobile-finance-day-grid">
                <div><span>Doanh thu</span><b>{formatMoney(row.revenue)}</b></div>
                <div><span>Tiền vào</span><b className="income">{formatMoney(row.income)}</b></div>
                <div><span>Tiền ra</span><b className="expense">{formatMoney(row.expense)}</b></div>
                <div><span>Dòng tiền ròng</span><b>{formatMoney(row.income-row.expense)}</b></div>
              </div>
            </article>)}
      </div>
      <FinanceReportDayTable rows={dayRows.map(([key,row])=>({key,...row}))}/>
    </section>
  </div>
}
