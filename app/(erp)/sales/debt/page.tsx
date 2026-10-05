import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import { requireUser } from '@/lib/supabase/auth'
import { DebtCollectForm } from '@/components/debt-collect-form'

type SP={
  q?:string
  state?:'all'|'open'|'partial'|'old'
  customer?:string
  tab?:'summary'|'invoices'|'receipts'
  mode?:'collect'
}

const DAY=24*60*60*1000

function phone(value?:string|null){
  const v=String(value??'').replace(/\D/g,'')
  if(v.length===10)return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')
  return value||'—'
}
function fmtDate(value?:string|null,withTime=true){
  if(!value)return '—'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '—'
  return new Intl.DateTimeFormat('vi-VN',withTime
    ?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ho_Chi_Minh'}
    :{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}
  ).format(d)
}
function startOfTodayVN(){
  const now=new Date()
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  return new Date(parts+'T00:00:00+07:00').toISOString()
}
function startOfMonthVN(){
  const now=new Date()
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(now)
  return new Date(parts+'-01T00:00:00+07:00').toISOString()
}

export default async function DebtPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const state=sp.state??'all'
  const q=String(sp.q??'').trim().toLowerCase()
  const {supabase}=await requireUser()

  const [customersRes,debtRes,salesRes,paymentsRes,allocRes,warehouseRes,bankResult]=await Promise.all([
    supabase.from('customers').select('id,name,phone,address,note'),
    supabase.from('customer_debt_balances').select('customer_id,balance'),
    supabase.from('sales').select('id,customer_id,warehouse_id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,sale_status,sale_items(id,quantity,sale_price,product_variants(id,variant_name,products(sku,name)))').not('customer_id','is',null).order('sale_at',{ascending:true}),
    supabase.from('customer_payments').select('id,customer_id,amount,paid_at,note,receipt_code,payment_method,cash_amount,transfer_amount').order('paid_at',{ascending:false}),
    supabase.from('customer_payment_allocations').select('id,customer_payment_id,sale_id,amount,created_at'),
    supabase.from('warehouses').select('id,code,name,address'),
    supabase.from('bank_transfer_configs').select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active').eq('config_key','DEFAULT').maybeSingle(),
  ])

  const customers=(customersRes.data??[]) as any[]
  const sales=(salesRes.data??[]) as any[]
  const payments=(paymentsRes.data??[]) as any[]
  const allocations=(allocRes.data??[]) as any[]
  const whMap=new Map((warehouseRes.data??[]).map((x:any)=>[String(x.id),x]))
  const debtMap=new Map((debtRes.data??[]).map((x:any)=>[String(x.customer_id),Number(x.balance??0)]))
  const customerMap=new Map(customers.map((x:any)=>[String(x.id),x]))
  const saleMap=new Map(sales.map((x:any)=>[String(x.id),x]))
  const paymentByCustomer=new Map<string,any[]>()
  for(const payment of payments){
    const key=String(payment.customer_id)
    const arr=paymentByCustomer.get(key)??[]
    arr.push(payment)
    paymentByCustomer.set(key,arr)
  }
  const allocByPayment=new Map<string,any[]>()
  for(const allocation of allocations){
    const key=String(allocation.customer_payment_id)
    const arr=allocByPayment.get(key)??[]
    arr.push(allocation)
    allocByPayment.set(key,arr)
  }

  const allRows=customers
    .map(customer=>{
      const id=String(customer.id)
      const balance=Number(debtMap.get(id)??0)
      const invoices=sales.filter(s=>String(s.customer_id)===id&&Number(s.debt_amount??Math.max(0,Number(s.total_amount??0)-Number(s.paid_amount??0)))>0)
      const oldest=invoices[0]?.sale_at??null
      const age=oldest?Math.max(0,Math.floor((Date.now()-new Date(oldest).getTime())/DAY)):0
      const receipts=paymentByCustomer.get(id)??[]
      return {
        customer_id:id,name:String(customer.name??''),phone:String(customer.phone??''),address:String(customer.address??''),
        debt:balance,invoices:invoices.length,oldest,age,lastPayment:receipts[0]?.paid_at??null,
        rows:invoices.map(row=>{
          const wh=whMap.get(String(row.warehouse_id))
          return {
            id:String(row.id),code:String(row.invoice_code??'—'),date:row.sale_at,warehouse:String(wh?.code??'—'),
            total:Number(row.total_amount??0),paid:Number(row.paid_amount??0),
            debt:Number(row.debt_amount??Math.max(0,Number(row.total_amount??0)-Number(row.paid_amount??0))),
            items:(row.sale_items??[]).map((item:any)=>({
              id:String(item.id),
              sku:String(item.product_variants?.products?.sku??'—'),
              name:String(item.product_variants?.products?.name??'Sản phẩm'),
              variant:String(item.product_variants?.variant_name??'Mặc định'),
              quantity:Number(item.quantity??0),
              sale_price:Number(item.sale_price??0),
            })),
          }
        }),
        receipts,
      }
    })
    .filter(row=>row.debt>0)

  let rows=[...allRows]
  if(state==='open')rows=rows.filter(x=>x.debt>0)
  if(state==='partial')rows=rows.filter(x=>x.rows.some(r=>r.paid>0&&r.debt>0))
  if(state==='old')rows=rows.filter(x=>x.age>=7)
  if(q)rows=rows.filter(x=>[x.name,x.phone,x.address,...x.rows.map(r=>r.code)].join(' ').toLowerCase().includes(q))

  const selected=allRows.find(x=>x.customer_id===sp.customer)??null
  const tab=sp.tab??'summary'
  const collectMode=sp.mode==='collect'&&Boolean(selected)
  const totalDebt=allRows.reduce((sum,x)=>sum+x.debt,0)
  const openInvoices=allRows.reduce((sum,x)=>sum+x.invoices,0)
  const partialCustomers=allRows.filter(x=>x.rows.some(r=>r.paid>0&&r.debt>0)).length
  const oldCustomers=allRows.filter(x=>x.age>=7)
  const todayStart=startOfTodayVN()
  const monthStart=startOfMonthVN()
  const collectedToday=payments.filter(x=>String(x.paid_at)>=todayStart).reduce((sum,x)=>sum+Number(x.amount??0),0)
  const collectedMonth=payments.filter(x=>String(x.paid_at)>=monthStart).reduce((sum,x)=>sum+Number(x.amount??0),0)
  const bankConfig=(bankResult.data??null) as any

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    if(sp.q)p.set('q',sp.q)
    if(state!=='all')p.set('state',state)
    if(sp.customer)p.set('customer',sp.customer)
    if(sp.tab)p.set('tab',sp.tab)
    if(sp.mode)p.set('mode',sp.mode)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v===''||v==='all')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/sales/debt'+(qs?'?'+qs:'')
  }

  return <div className={'sales-debt-demo sales-live-debt '+(selected?'with-panel':'')}>
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">BÁN HÀNG</span>
        <h1>Công nợ khách hàng</h1>
        <p>Theo dõi hóa đơn còn nợ, thu nợ, phân bổ và phiếu thu</p>
      </div>
      <div className="head-actions"><Link className="button" href="/sales/customers">Khách hàng</Link></div>
    </header>

    <section className="entity-status-strip debt-demo-kpis">
      <Link className={'entity-status-metric warning '+(state==='all'?'active':'')} href={href({state:null,customer:null,tab:null,mode:null})}>
        <span>Tổng công nợ</span><b className="money">{formatMoney(totalDebt)}</b><small>{allRows.length} khách còn nợ</small>
      </Link>
      <Link className={'entity-status-metric '+(state==='open'?'active':'')} href={href({state:'open',customer:null,tab:null,mode:null})}>
        <span>Hóa đơn còn nợ</span><b>{openInvoices}</b><small>Chưa thu đủ</small>
      </Link>
      <Link className={'entity-status-metric info '+(state==='partial'?'active':'')} href={href({state:'partial',customer:null,tab:null,mode:null})}>
        <span>Nợ một phần</span><b>{partialCustomers}</b><small>Đã thu một phần</small>
      </Link>
      <Link className={'entity-status-metric danger '+(state==='old'?'active':'')} href={href({state:'old',customer:null,tab:null,mode:null})}>
        <span>Nợ từ 7 ngày</span><b>{oldCustomers.length}</b><small>{formatMoney(oldCustomers.reduce((sum,x)=>sum+x.debt,0))}</small>
      </Link>
      <div className="entity-status-metric success"><span>Đã thu hôm nay</span><b className="money">{formatMoney(collectedToday)}</b><small>Tháng này {formatMoney(collectedMonth)}</small></div>
    </section>

    <form className="entity-command-bar debt-demo-command" action="/sales/debt">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Tìm khách / SĐT / mã hóa đơn..."/>
      <select name="state" defaultValue={state}>
        <option value="all">Tất cả công nợ</option>
        <option value="open">Đang còn nợ</option>
        <option value="partial">Đã thu một phần</option>
        <option value="old">Nợ từ 7 ngày</option>
      </select>
      <button className="button primary small">Lọc</button>
      {(q||state!=='all')&&<Link className="button small" href="/sales/debt">Đặt lại</Link>}
      <div className="entity-result-meta"><b>{rows.length}</b><span> khách còn nợ</span></div>
    </form>

    {(customersRes.error||salesRes.error||debtRes.error)&&<div className="error-box">Không thể tải đầy đủ dữ liệu công nợ.</div>}

    <div className="debt-demo-workspace">
      <section className="debt-demo-list">
        <div className="debt-demo-table-wrap">
          <table className="table debt-demo-table">
            <thead><tr><th>Khách hàng</th><th>SĐT</th><th>Số HĐ nợ</th><th>Công nợ</th><th>Nợ cũ nhất</th><th>Thu gần nhất</th><th>Xử lý</th></tr></thead>
            <tbody>{rows.length?rows.map(row=><tr key={row.customer_id} className={selected?.customer_id===row.customer_id?'selected':''}>
              <td><Link className="table-link" href={href({customer:row.customer_id,tab:'summary',mode:null})}>{row.name}</Link><small>{row.address||'—'}</small></td>
              <td>{phone(row.phone)}</td>
              <td>{row.invoices}</td>
              <td className="money warning-text">{formatMoney(row.debt)}</td>
              <td>{fmtDate(row.oldest,false)}<small>{row.age===0?'Hôm nay':row.age+' ngày'}</small></td>
              <td>{fmtDate(row.lastPayment)}</td>
              <td><Link className="button small primary" href={href({customer:row.customer_id,tab:'summary',mode:'collect'})}>Thu nợ</Link></td>
            </tr>):<tr><td colSpan={7}><div className="empty compact">Không có công nợ phù hợp bộ lọc.</div></td></tr>}</tbody>
          </table>
        </div>
      </section>

      {selected&&<aside className="debt-demo-panel">
        <div className="sales-detail-panel-head">
          <div><span className="module-eyebrow">CÔNG NỢ KHÁCH HÀNG</span><h2>{selected.name}</h2><p>{phone(selected.phone)} · {selected.address||'—'}</p></div>
          <Link className="panel-close" href={href({customer:null,tab:null,mode:null})}>×</Link>
        </div>

        {collectMode&&<DebtCollectForm
          customer={{id:selected.customer_id,name:selected.name,phone:phone(selected.phone)}}
          balance={selected.debt}
          invoices={selected.rows.map(row=>({id:row.id,code:row.code,time:fmtDate(row.date),total:row.total,paid:row.paid,debt:row.debt,warehouse:row.warehouse,items:row.items}))}
          bankConfig={bankConfig}
        />}

        <div className="panel-tabs">
          <Link className={tab==='summary'?'active':''} href={href({customer:selected.customer_id,tab:'summary',mode:null})}>Tổng quan</Link>
          <Link className={tab==='invoices'?'active':''} href={href({customer:selected.customer_id,tab:'invoices',mode:null})}>Hóa đơn nợ</Link>
          <Link className={tab==='receipts'?'active':''} href={href({customer:selected.customer_id,tab:'receipts',mode:null})}>Lịch sử thu</Link>
        </div>

        <div className="debt-demo-panel-scroll">
          {tab==='summary'&&<>
            <div className="debt-customer-summary">
              <div className="warning"><span>Công nợ hiện tại</span><b>{formatMoney(selected.debt)}</b></div>
              <div><span>Hóa đơn còn nợ</span><b>{selected.invoices}</b></div>
              <div><span>Nợ cũ nhất</span><b>{fmtDate(selected.oldest,false)}</b></div>
              <div><span>Tuổi nợ</span><b>{selected.age===0?'Hôm nay':selected.age+' ngày'}</b></div>
            </div>
            {!collectMode&&<Link className="button primary debt-main-collect" href={href({customer:selected.customer_id,tab:'summary',mode:'collect'})}>Thu nợ · {formatMoney(selected.debt)}</Link>}
            <div className="debt-panel-section">
              <div className="debt-panel-section-head"><b>Hóa đơn đang nợ</b><span>{selected.invoices} hóa đơn</span></div>
              {selected.rows.map(row=><div className="debt-invoice-mini" key={row.id}>
                <div><b>{row.code}</b><span>{fmtDate(row.date)} · {row.warehouse}</span></div>
                <div><small>Đã thu {formatMoney(row.paid)}</small><b>{formatMoney(row.debt)}</b></div>
              </div>)}
            </div>
          </>}

          {tab==='invoices'&&<table className="table debt-invoice-table">
            <thead><tr><th>Mã HĐ</th><th>Ngày</th><th>Tổng</th><th>Đã thu</th><th>Còn nợ</th></tr></thead>
            <tbody>{selected.rows.map(row=><tr key={row.id}>
              <td><Link href={'/sales/history?sale='+row.id}><b>{row.code}</b></Link></td><td>{fmtDate(row.date)}</td>
              <td className="money">{formatMoney(row.total)}</td><td className="money">{formatMoney(row.paid)}</td><td className="money warning-text">{formatMoney(row.debt)}</td>
            </tr>)}</tbody>
          </table>}

          {tab==='receipts'&&<div className="debt-receipt-history">
            {!selected.receipts.length
              ? <div className="empty compact">Chưa có phiếu thu nợ.</div>
              : selected.receipts.map((row:any)=>{
                  const allocated=allocByPayment.get(String(row.id))??[]
                  return <details className="debt-receipt-card" key={row.id}>
                    <summary>
                      <div><b>{row.receipt_code??'PTN'}</b><span>{fmtDate(row.paid_at)} · {row.payment_method}</span><small>{allocated.length} hóa đơn được phân bổ · {row.note||'Không ghi chú'}</small></div>
                      <strong>{formatMoney(Number(row.amount??0))}</strong>
                    </summary>
                    <div className="debt-receipt-detail">
                      <div className="debt-receipt-money-grid">
                        <div><span>Tiền mặt</span><b>{formatMoney(Number(row.cash_amount??0))}</b></div>
                        <div><span>Chuyển khoản</span><b>{formatMoney(Number(row.transfer_amount??0))}</b></div>
                        <div><span>Tổng thu</span><b>{formatMoney(Number(row.amount??0))}</b></div>
                      </div>
                      <div className="debt-receipt-invoices">
                        {allocated.map((allocation:any)=>{
                          const sale=saleMap.get(String(allocation.sale_id)) as any
                          return <div className="debt-receipt-invoice" key={allocation.id}>
                            <div className="debt-receipt-invoice-head">
                              <div><b>{sale?.invoice_code??'Hóa đơn'}</b><span>{fmtDate(sale?.sale_at)} · Phân bổ {formatMoney(Number(allocation.amount??0))}</span></div>
                              <Link href={'/sales/history?sale='+String(allocation.sale_id)}>Mở HĐ</Link>
                            </div>
                            <div className="debt-receipt-products">
                              {(sale?.sale_items??[]).map((item:any)=><div key={item.id}>
                                <span><b>{item.product_variants?.products?.name??'Sản phẩm'}</b><small>{item.product_variants?.products?.sku??'—'} · {item.product_variants?.variant_name??'Mặc định'}</small></span>
                                <strong>{Number(item.quantity??0)} × {formatMoney(Number(item.sale_price??0))}</strong>
                              </div>)}
                            </div>
                          </div>
                        })}
                      </div>
                    </div>
                  </details>
                })}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}
