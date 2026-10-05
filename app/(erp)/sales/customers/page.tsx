import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import { requireUser } from '@/lib/supabase/auth'
import { archiveSalesCustomerForm,createSalesCustomer,restoreSalesCustomerForm,updateSalesCustomerForm } from '@/lib/actions/sales'

type SP={
  q?:string
  state?:'all'|'debt'|'repeat'|'new'
  customer?:string
  tab?:'info'|'purchases'|'debt'|'history'
  mode?:'new'|'edit'
  archive?:'archived'
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
function phone(value?:string|null){
  const v=String(value??'').replace(/\D/g,'')
  if(v.length===10)return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')
  return value||'—'
}
function paymentLabel(v:string){
  if(v==='PAID')return 'Đã thanh toán'
  if(v==='PARTIAL')return 'Còn nợ'
  return 'Ghi nợ'
}
function pill(v:string){
  if(v==='PAID')return 'green'
  if(v==='PARTIAL')return 'orange'
  return 'red'
}

export default async function CustomersPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const state=sp.state??'all'
  const q=String(sp.q??'').trim().toLowerCase()
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canOperate=['admin','operator'].includes(role)
  const archiveView=sp.archive==='archived'
  let customerQuery=supabase.from('customers')
    .select('id,name,phone,address,note,created_at,updated_at,archived_at,archived_by')
    .order('created_at',{ascending:false})
  customerQuery=archiveView
    ? customerQuery.not('archived_at','is',null)
    : customerQuery.is('archived_at',null)

  const [customersRes,salesRes,debtRes,paymentsRes,warehousesRes,itemsRes]=await Promise.all([
    customerQuery,
    supabase.from('sales').select('id,customer_id,warehouse_id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,sale_status,note').not('customer_id','is',null).order('sale_at',{ascending:false}),
    supabase.from('customer_debt_balances').select('customer_id,balance'),
    supabase.from('customer_payments').select('id,customer_id,amount,paid_at,note,receipt_code,payment_method,cash_amount,transfer_amount').order('paid_at',{ascending:false}),
    supabase.from('warehouses').select('id,code,name,address'),
    supabase.from('sale_items').select('sale_id,quantity'),
  ])

  const customers=(customersRes.data??[]) as any[]
  const sales=(salesRes.data??[]) as any[]
  const debtMap=new Map((debtRes.data??[]).map((x:any)=>[String(x.customer_id),Number(x.balance??0)]))
  const payments=(paymentsRes.data??[]) as any[]
  const warehouseMap=new Map((warehousesRes.data??[]).map((x:any)=>[String(x.id),x]))
  const itemCount=new Map<string,number>()
  for(const row of (itemsRes.data??[]) as any[])itemCount.set(String(row.sale_id),(itemCount.get(String(row.sale_id))??0)+Number(row.quantity??0))

  const salesByCustomer=new Map<string,any[]>()
  for(const sale of sales){
    const key=String(sale.customer_id)
    const arr=salesByCustomer.get(key)??[]
    arr.push(sale)
    salesByCustomer.set(key,arr)
  }
  const paymentsByCustomer=new Map<string,any[]>()
  for(const payment of payments){
    const key=String(payment.customer_id)
    const arr=paymentsByCustomer.get(key)??[]
    arr.push(payment)
    paymentsByCustomer.set(key,arr)
  }

  const allRows=customers.map(customer=>{
    const rows=salesByCustomer.get(String(customer.id))??[]
    const total=rows.reduce((sum,x)=>sum+Number(x.total_amount??0),0)
    const debt=Number(debtMap.get(String(customer.id))??0)
    const sorted=[...rows].sort((a,b)=>new Date(b.sale_at).getTime()-new Date(a.sale_at).getTime())
    return {
      id:String(customer.id),name:String(customer.name??''),phone:String(customer.phone??''),
      address:String(customer.address??''),note:String(customer.note??''),archived_at:customer.archived_at??null,
      orders:rows.length,total,debt,
      last:sorted[0]?.sale_at??null,first:sorted[sorted.length-1]?.sale_at??customer.created_at,
      status:rows.length>=2?'repeat':'new',
    }
  })

  let rows=[...allRows]
  if(state==='debt')rows=rows.filter(x=>x.debt>0)
  if(state==='repeat')rows=rows.filter(x=>x.orders>=2)
  if(state==='new')rows=rows.filter(x=>x.orders<=1)
  if(q)rows=rows.filter(x=>[x.name,x.phone,x.address].join(' ').toLowerCase().includes(q))

  const selected=allRows.find(x=>x.id===sp.customer)??null
  const tab=sp.tab??'info'
  const purchases=selected
    ? (salesByCustomer.get(selected.id)??[]).map(row=>{
        const wh=warehouseMap.get(String(row.warehouse_id))
        return {
          id:String(row.id),code:String(row.invoice_code??'—'),time:row.sale_at,
          warehouse:String(wh?.code??'—'),items:itemCount.get(String(row.id))??0,
          total:Number(row.total_amount??0),paid:Number(row.paid_amount??0),
          debt:Number(row.debt_amount??Math.max(0,Number(row.total_amount??0)-Number(row.paid_amount??0))),
          status:String(row.payment_status??'UNPAID'),
        }
      })
    : []
  const selectedPayments=selected?(paymentsByCustomer.get(selected.id)??[]):[]

  const totalDebt=allRows.reduce((sum,x)=>sum+x.debt,0)
  const totalRevenue=allRows.reduce((sum,x)=>sum+x.total,0)

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    if(sp.q)p.set('q',sp.q)
    if(state!=='all')p.set('state',state)
    if(sp.customer)p.set('customer',sp.customer)
    if(sp.tab)p.set('tab',sp.tab)
    if(sp.mode)p.set('mode',sp.mode)
    if(sp.archive)p.set('archive',sp.archive)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v===''||v==='all')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/sales/customers'+(qs?'?'+qs:'')
  }

  return <div className={'sales-customers-demo sales-live-customers '+(selected?'with-panel':'')}>
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">BÁN HÀNG</span>
        <h1>Khách hàng</h1>
        <p>Hồ sơ khách, lịch sử mua, doanh số và công nợ</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/sales/debt">Công nợ</Link>
        {!archiveView&&<Link className="button primary" href={href({mode:'new',customer:null,tab:null})}>+ Thêm khách</Link>}
      </div>
    </header>

    <section className="entity-status-strip customer-demo-kpis">
      <Link className={'entity-status-metric '+(state==='all'?'active':'')} href={href({state:null,customer:null,tab:null})}>
        <span>Tổng khách hàng</span><b>{allRows.length}</b><small>{formatMoney(totalRevenue)} tổng mua</small>
      </Link>
      <Link className={'entity-status-metric success '+(state==='repeat'?'active':'')} href={href({state:'repeat',customer:null,tab:null})}>
        <span>Khách quay lại</span><b>{allRows.filter(x=>x.orders>=2).length}</b><small>Từ 2 hóa đơn trở lên</small>
      </Link>
      <Link className={'entity-status-metric info '+(state==='new'?'active':'')} href={href({state:'new',customer:null,tab:null})}>
        <span>Khách mới</span><b>{allRows.filter(x=>x.orders<=1).length}</b><small>Tối đa 1 hóa đơn</small>
      </Link>
      <Link className={'entity-status-metric warning '+(state==='debt'?'active':'')} href={href({state:'debt',customer:null,tab:null})}>
        <span>Khách còn nợ</span><b>{allRows.filter(x=>x.debt>0).length}</b><small>{formatMoney(totalDebt)}</small>
      </Link>
    </section>

    {sp.mode==='new'&&<section className="sales-live-create-card">
      <div className="card-head"><div><h2>Thêm khách hàng</h2><span className="muted">Tạo hồ sơ thật trong Supabase</span></div><Link className="panel-close" href={href({mode:null})}>×</Link></div>
      <form action={createSalesCustomer} className="sales-live-create-grid">
        <label>Họ tên *<input name="name" required placeholder="Nguyễn Văn A"/></label>
        <label>SĐT<input name="phone" placeholder="09..."/></label>
        <label>Địa chỉ<input name="address" placeholder="Quận/Huyện, Tỉnh/TP"/></label>
        <button className="button primary" type="submit">Tạo khách hàng</button>
      </form>
    </section>}

    <form className="entity-command-bar customer-demo-command" action="/sales/customers">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Tìm tên khách / SĐT / địa chỉ..."/>
      <select name="state" defaultValue={state}>
        <option value="all">Tất cả khách</option>
        <option value="repeat">Khách quay lại</option>
        <option value="new">Khách mới</option>
        <option value="debt">Còn công nợ</option>
      </select>
      {archiveView&&<input type="hidden" name="archive" value="archived"/>}
      <button className="button primary small">Lọc</button>
      {(q||state!=='all')&&<Link className="button small" href={archiveView?'/sales/customers?archive=archived':'/sales/customers'}>Đặt lại</Link>}
      <div className="archive-view-toggle">
        <Link className={!archiveView?'active':''} href={href({archive:null,customer:null,mode:null,tab:null})}>Đang dùng</Link>
        <Link className={archiveView?'active':''} href={href({archive:'archived',customer:null,mode:null,tab:null})}>Đã lưu trữ</Link>
      </div>
      <div className="entity-result-meta"><b>{rows.length}</b><span> khách hàng</span></div>
    </form>

    {customersRes.error&&<div className="error-box">Không thể tải khách hàng: {customersRes.error.message}</div>}

    <div className="customer-demo-workspace">
      <section className="customer-demo-list">
        <div className="customer-demo-table-wrap">
          <table className="table customer-demo-table">
            <thead><tr>
              <th>Khách hàng</th><th>SĐT</th><th>Lần mua gần nhất</th><th>Số HĐ</th>
              <th>Tổng mua</th><th>Còn nợ</th><th>Trạng thái</th>
            </tr></thead>
            <tbody>{rows.length?rows.map(row=><tr key={row.id} className={selected?.id===row.id?'selected':''}>
              <td><Link className="table-link" href={href({customer:row.id,tab:'info',mode:null})}>{row.name}</Link><small>{row.address||'—'}</small></td>
              <td>{phone(row.phone)}</td>
              <td>{fmtDate(row.last)}</td>
              <td>{row.orders}</td>
              <td className="money">{formatMoney(row.total)}</td>
              <td className={'money '+(row.debt>0?'warning-text':'')}>{formatMoney(row.debt)}</td>
              <td>{row.debt>0
                ? <span className="status-pill orange">Còn nợ</span>
                : <span className="status-pill green">Bình thường</span>}</td>
            </tr>):<tr><td colSpan={7}><div className="empty compact">Không có khách hàng phù hợp.</div></td></tr>}</tbody>
          </table>
        </div>
      </section>

      {selected&&<aside className="customer-demo-panel">
        <div className="sales-detail-panel-head">
          <div>
            <span className="module-eyebrow">KHÁCH HÀNG</span>
            <h2>{selected.name}</h2>
            <p>{phone(selected.phone)} · {selected.address||'—'}</p>
          </div>
          <Link className="panel-close" href={href({customer:null,tab:null})}>×</Link>
        </div>

        <div className="panel-tabs">
          <Link className={tab==='info'?'active':''} href={href({customer:selected.id,tab:'info'})}>Thông tin</Link>
          <Link className={tab==='purchases'?'active':''} href={href({customer:selected.id,tab:'purchases'})}>Lịch sử mua</Link>
          <Link className={tab==='debt'?'active':''} href={href({customer:selected.id,tab:'debt'})}>Công nợ</Link>
          <Link className={tab==='history'?'active':''} href={href({customer:selected.id,tab:'history'})}>Lịch sử</Link>
        </div>

        <div className="customer-demo-panel-scroll">
          {tab==='info'&&<>
            {sp.mode==='edit'
              ? <form action={updateSalesCustomerForm} className="panel-form customer-edit-form">
                  <input type="hidden" name="customer_id" value={selected.id}/>
                  <label>Họ tên *<input name="name" required defaultValue={selected.name}/></label>
                  <label>SĐT<input name="phone" defaultValue={selected.phone}/></label>
                  <label>Địa chỉ<input name="address" defaultValue={selected.address}/></label>
                  <label>Ghi chú<textarea name="note" rows={3} defaultValue={selected.note}/></label>
                  <div className="form-actions">
                    <Link className="button" href={href({customer:selected.id,tab:'info',mode:null})}>Hủy</Link>
                    <button className="button primary" type="submit">Lưu thay đổi</button>
                  </div>
                </form>
              : <>
                  <div className="sales-detail-grid">
                    <div><span>Họ tên</span><b>{selected.name}</b></div>
                    <div><span>SĐT</span><b>{phone(selected.phone)}</b></div>
                    <div className="full"><span>Địa chỉ</span><b>{selected.address||'—'}</b></div>
                    <div><span>Khách từ</span><b>{fmtDate(selected.first,false)}</b></div>
                    <div><span>Mua gần nhất</span><b>{fmtDate(selected.last)}</b></div>
                    {selected.archived_at&&<div><span>Lưu trữ lúc</span><b>{fmtDate(selected.archived_at)}</b></div>}
                  </div>
                  <div className="customer-demo-summary">
                    <div><span>Số hóa đơn</span><b>{selected.orders}</b></div>
                    <div><span>Tổng mua</span><b>{formatMoney(selected.total)}</b></div>
                    <div className={selected.debt>0?'warning':''}><span>Còn nợ</span><b>{formatMoney(selected.debt)}</b></div>
                  </div>
                  <div className="customer-demo-note"><span>Ghi chú</span><b>{selected.note||'Chưa có ghi chú.'}</b></div>
                  {canOperate&&<div className={'record-lifecycle-zone '+(selected.archived_at?'archived':'')}>
                    {!selected.archived_at
                      ? <>
                          <div className="panel-action-row"><Link className="button primary" href={href({customer:selected.id,tab:'info',mode:'edit'})}>Sửa khách hàng</Link></div>
                          <form action={archiveSalesCustomerForm} className="record-lifecycle-action">
                            <input type="hidden" name="customer_id" value={selected.id}/>
                            <div><b>Lưu trữ khách hàng</b><span>{selected.debt>0?'Cần thu hết công nợ trước khi lưu trữ.':'Giữ toàn bộ lịch sử mua và thanh toán.'}</span></div>
                            <button className="button archive-button" type="submit" disabled={selected.debt>0}>Lưu trữ</button>
                          </form>
                        </>
                      : <form action={restoreSalesCustomerForm} className="record-lifecycle-action">
                          <input type="hidden" name="customer_id" value={selected.id}/>
                          <div><b>Khách hàng đang lưu trữ</b><span>Khôi phục để sử dụng lại tại POS.</span></div>
                          <button className="button primary" type="submit">Khôi phục</button>
                        </form>}
                  </div>}
                </>}
          </>}

          {tab==='purchases'&&<div className="customer-demo-purchases">
            {!purchases.length
              ? <div className="empty compact">Khách hàng chưa có hóa đơn.</div>
              : purchases.map(row=><Link className="customer-purchase-row" key={row.id} href={'/sales/history?sale='+row.id}>
                  <div><b>{row.code}</b><span>{fmtDate(row.time)} · {row.warehouse} · {row.items} SP</span></div>
                  <div><strong>{formatMoney(row.total)}</strong><span className={'status-pill '+pill(row.status)}>{paymentLabel(row.status)}</span></div>
                </Link>)}
          </div>}

          {tab==='debt'&&<div className="customer-demo-debt">
            <div className="customer-debt-total"><span>Công nợ hiện tại</span><b>{formatMoney(selected.debt)}</b></div>
            {selected.debt<=0
              ? <div className="empty compact">Khách hàng không còn công nợ.</div>
              : <>
                  {purchases.filter(x=>x.debt>0).map(row=><div className="customer-debt-invoice" key={row.id}>
                    <div><b>{row.code}</b><span>{fmtDate(row.time)}</span></div>
                    <div><span>Đã thu {formatMoney(row.paid)}</span><b>{formatMoney(row.debt)} còn nợ</b></div>
                  </div>)}
                  <Link className="button primary customer-collect-button" href={'/sales/debt?customer='+selected.id+'&mode=collect'}>Thu nợ</Link>
                </>}
          </div>}

          {tab==='history'&&<div className="sales-audit-preview">
            <div><i></i><span>{fmtDate(selected.first)}</span><b>Tạo khách hàng</b><small>Nguồn: hệ thống</small></div>
            {purchases.slice().reverse().map(row=><div key={'sale-'+row.id}><i></i><span>{fmtDate(row.time)}</span><b>Phát sinh hóa đơn</b><small>{row.code} · {formatMoney(row.total)}</small></div>)}
            {selectedPayments.slice().reverse().map((row:any)=><div key={'pay-'+row.id}><i></i><span>{fmtDate(row.paid_at)}</span><b>Thu công nợ</b><small>{row.receipt_code??'PTN'} · {formatMoney(Number(row.amount??0))} · {row.payment_method}</small></div>)}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}
