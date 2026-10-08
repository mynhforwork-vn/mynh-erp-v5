import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney } from '@/lib/format'
import { vnDateKey,displayVnDateKey } from '@/lib/finance-period'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import { resolveErpRange, type ErpRangeInput } from '@/lib/erp-date-range'

type SP=ErpRangeInput & {period?:string}
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0

export default async function FinanceOverviewPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const range=resolveErpRange({...sp,range:sp.range??sp.period})
  const withinRange=(value:string|Date|null|undefined)=>{
    if(range.key==='all')return true
    if(!value)return false
    const valueMs=new Date(value).getTime()
    return valueMs>=new Date(range.start).getTime()&&valueMs<=new Date(range.end).getTime()
  }
  const {supabase}=await requireUser()

  const [txResult,docResult,salesResult,shipperResult,categoryResult]=await Promise.all([
    supabase.from('finance_transactions')
      .select('id,tx_type,category,category_id,amount,reference_type,reference_id,transaction_at,note,payment_method,status,finance_document_id')
      .order('transaction_at',{ascending:false}).limit(1500),
    supabase.from('finance_documents')
      .select('id,document_code,document_type,document_status,occurred_at,total_amount,counterparty_name,source_type')
      .order('occurred_at',{ascending:false}).limit(500),
    supabase.from('sales')
      .select('id,invoice_code,total_amount,paid_amount,debt_amount,payment_status,sale_status,sale_at')
      .order('sale_at',{ascending:false}).limit(1000),
    supabase.from('shipper_payments')
      .select('id,total_cod,actual_transferred,tip,transferred_at,destination_hub,shipper_name')
      .order('transferred_at',{ascending:false}).limit(500),
    supabase.from('finance_categories').select('id,code,name,tx_type,parent_id'),
  ])

  const errors=[txResult.error,docResult.error,salesResult.error,shipperResult.error,categoryResult.error].filter(Boolean).map((x:any)=>x.message)
  const categories=(categoryResult.data??[]) as any[]
  const categoryMap=new Map(categories.map(c=>[c.id,c]))
  const tx=((txResult.data??[]) as any[]).filter(x=>x.status!=='VOID'&&withinRange(x.transaction_at))
  const docs=((docResult.data??[]) as any[]).filter(x=>withinRange(x.occurred_at))
  const sales=((salesResult.data??[]) as any[]).filter(x=>x.sale_status!=='CANCELLED'&&withinRange(x.sale_at))
  const shipper=((shipperResult.data??[]) as any[]).filter(x=>withinRange(x.transferred_at))

  const representedShipperIds=new Set(tx.filter(x=>x.reference_type==='SHIPPER_PAYMENT'&&x.reference_id).map(x=>x.reference_id))
  const missingShipperExpense=shipper.filter(x=>!representedShipperIds.has(x.id)).reduce((s,x)=>s+num(x.actual_transferred),0)

  const income=tx.filter(x=>x.tx_type==='INCOME').reduce((s,x)=>s+num(x.amount),0)
  const ledgerExpense=tx.filter(x=>x.tx_type==='EXPENSE').reduce((s,x)=>s+num(x.amount),0)
  const expense=ledgerExpense+missingShipperExpense
  const debt=sales.reduce((s,x)=>s+Math.max(0,num(x.debt_amount)),0)
  const shipperCod=shipper.reduce((s,x)=>s+num(x.total_cod),0)
  const shipperTip=shipper.reduce((s,x)=>s+num(x.tip),0)
  const draftCount=docs.filter(x=>x.document_status==='DRAFT').length

  const daily=new Map<string,{income:number,expense:number}>()
  for(const row of tx){
    const key=vnDateKey(row.transaction_at)
    const cur=daily.get(key)??{income:0,expense:0}
    if(row.tx_type==='INCOME')cur.income+=num(row.amount)
    else cur.expense+=num(row.amount)
    daily.set(key,cur)
  }
  for(const row of shipper.filter(x=>!representedShipperIds.has(x.id))){
    const key=vnDateKey(row.transferred_at)
    const cur=daily.get(key)??{income:0,expense:0}
    cur.expense+=num(row.actual_transferred)
    daily.set(key,cur)
  }
  const dailyRows=[...daily.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,8)

  const expenseByCategory=new Map<string,number>()
  for(const row of tx.filter(x=>x.tx_type==='EXPENSE')){
    const cat=row.category_id?categoryMap.get(row.category_id):null
    const label=cat?.name??(row.category==='SHIPPER_COD'?'Thanh toán đơn nhập':row.category==='SHIPPER_TIP'?'Tip Shipper':row.category||'Chi khác')
    expenseByCategory.set(label,(expenseByCategory.get(label)??0)+num(row.amount))
  }
  if(missingShipperExpense>0)expenseByCategory.set('Đối soát Shipper chưa vào sổ',(expenseByCategory.get('Đối soát Shipper chưa vào sổ')??0)+missingShipperExpense)
  const expenseRows=[...expenseByCategory.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7)
  const maxExpense=Math.max(1,...expenseRows.map(x=>x[1]))

  const recent=[
    ...tx.slice(0,8).map(row=>({
      id:'tx-'+row.id,time:row.transaction_at,type:row.tx_type,
      label:row.note||categoryMap.get(row.category_id)?.name||row.category,
      amount:num(row.amount),source:row.reference_type||'FINANCE'
    })),
    ...shipper.filter(x=>!representedShipperIds.has(x.id)).slice(0,8).map(row=>({
      id:'sp-'+row.id,time:row.transferred_at,type:'EXPENSE',
      label:'Đối soát '+(row.destination_hub||row.shipper_name||'Shipper'),
      amount:num(row.actual_transferred),source:'SHIPPER_SETTLEMENT'
    })),
  ].sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime()).slice(0,8)

  return <div className="finance-screen">
    <header className="page-head finance-page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Tổng quan tài chính</h1>
        <p>Dòng tiền, công nợ và các khoản đối soát trên một màn hình.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/finance/cashflow">Mở Thu / Chi</Link>
        <Link className="button primary" href="/finance/reports">Xem báo cáo</Link>
      </div>
    </header>

    {errors.length>0&&<div className="error-box finance-alert">Có dữ liệu chưa tải được: {errors.join(' · ')}</div>}

    <PurchaseDateFilter activeRange={range.key} from={range.from} to={range.to} label={range.label} basePath="/finance" showAll/>

    <section className="finance-kpi-grid finance-overview-kpis">
      <div className="finance-kpi"><span>Tổng thu</span><b className="income">{formatMoney(income)}</b><small>Sổ tài chính đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Tổng chi</span><b className="expense">{formatMoney(expense)}</b><small>Gồm đối soát Shipper</small></div>
      <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{formatMoney(income-expense)}</b><small>Thu − Chi</small></div>
      <div className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{formatMoney(debt)}</b><small>Công nợ từ đơn bán</small></div>
      <div className="finance-kpi"><span>COD đã đối soát</span><b>{formatMoney(shipperCod)}</b><small>{shipper.length} đợt thanh toán</small></div>
      <div className="finance-kpi warning"><span>Tip Shipper</span><b>{formatMoney(shipperTip)}</b><small>{draftCount} phiếu tài chính nháp</small></div>
    </section>

    <section className="finance-overview-grid">
      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Dòng tiền gần nhất</h2><span>{range.label}</span></div><Link href="/finance/cashflow">Mở sổ Thu / Chi</Link></div>
        {!dailyRows.length?<div className="empty compact">Chưa có dòng tiền trong kỳ.</div>:<div className="finance-daily-list">
          {dailyRows.map(([key,row])=><div key={key}>
            <b>{displayVnDateKey(key)}</b>
            <span className="income">+ {formatMoney(row.income)}</span>
            <span className="expense">− {formatMoney(row.expense)}</span>
            <strong>{formatMoney(row.income-row.expense)}</strong>
          </div>)}
        </div>}
      </div>

      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Cơ cấu chi</h2><span>Top hạng mục</span></div></div>
        {!expenseRows.length?<div className="empty compact">Chưa có khoản chi.</div>:<div className="finance-category-bars">
          {expenseRows.map(([label,value])=><div key={label}>
            <div><span>{label}</span><b>{formatMoney(value)}</b></div>
            <i><em style={{width:Math.max(3,Math.round(value/maxExpense*100))+'%'}}/></i>
          </div>)}
        </div>}
      </div>
    </section>

    <section className="card finance-recent-card">
      <div className="card-head"><div><h2>Giao dịch gần nhất</h2><span>{recent.length} giao dịch</span></div><Link href="/finance/shipper-payments">Đối soát & Thanh toán</Link></div>
      <div className="compact-table-wrap">
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Nội dung</th><th>Nguồn</th><th>Thu</th><th>Chi</th></tr></thead>
          <tbody>{!recent.length?<tr><td colSpan={5} className="empty">Chưa có giao dịch.</td></tr>:recent.map(row=><tr key={row.id}>
            <td>{formatDateTime(row.time)}</td><td className="strong">{row.label}</td><td>{row.source}</td>
            <td className="money finance-money income">{row.type==='INCOME'?formatMoney(row.amount):'—'}</td>
            <td className="money finance-money expense">{row.type==='EXPENSE'?formatMoney(row.amount):'—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>
}
