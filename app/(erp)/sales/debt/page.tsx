import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import { requireUser } from '@/lib/supabase/auth'
import { buildTransferDescription,buildVietQRUrl } from '@/lib/vietqr'

type SP={
  q?:string
  state?:'all'|'open'|'partial'|'old'
  customer?:string
  tab?:'summary'|'invoices'|'receipts'
  mode?:'collect'
  pay?:'cash'|'transfer'
}

const DEMO_DEBTS=[
  {
    customer_id:'cus-001',name:'Nguyễn Văn An',phone:'0986123456',address:'Hoàng Mai, Hà Nội',
    debt:185000,invoices:1,oldest:'01/10/2026',age:0,lastPayment:'01/10/2026 10:20',
    receiptCode:'PTN-261001-000021',
    rows:[{code:'POS-261001-000005',date:'01/10/2026 10:20',warehouse:'HN',total:685000,paid:500000,debt:185000}],
    receipts:[{code:'PTN-260925-000014',date:'25/09/2026 19:16',method:'Chuyển khoản',amount:493000}],
  },
  {
    customer_id:'cus-003',name:'Lê Văn Cường',phone:'0966456789',address:'Lạng Giang, Bắc Giang',
    debt:263000,invoices:1,oldest:'30/09/2026',age:1,lastPayment:'30/09/2026 15:21',
    receiptCode:'PTN-261001-000022',
    rows:[{code:'POS-260930-000116',date:'30/09/2026 15:20',warehouse:'HN',total:1163000,paid:900000,debt:263000}],
    receipts:[{code:'PTN-260930-000020',date:'30/09/2026 15:21',method:'Tiền mặt',amount:900000}],
  },
  {
    customer_id:'cus-004',name:'Phạm Thu Trang',phone:'0388223344',address:'Thanh Xuân, Hà Nội',
    debt:622000,invoices:1,oldest:'29/09/2026',age:2,lastPayment:'—',
    receiptCode:'PTN-261001-000023',
    rows:[{code:'POS-260929-000108',date:'29/09/2026 12:12',warehouse:'HN',total:622000,paid:0,debt:622000}],
    receipts:[],
  },
  {
    customer_id:'cus-008',name:'Bùi Lan Anh',phone:'0855332211',address:'Cầu Giấy, Hà Nội',
    debt:410000,invoices:2,oldest:'15/09/2026',age:16,lastPayment:'22/09/2026 11:41',
    receiptCode:'PTN-261001-000024',
    rows:[
      {code:'POS-260922-000079',date:'22/09/2026 11:40',warehouse:'HN',total:278000,paid:68000,debt:210000},
      {code:'POS-260915-000051',date:'15/09/2026 16:10',warehouse:'HN',total:415000,paid:215000,debt:200000},
    ],
    receipts:[
      {code:'PTN-260922-000011',date:'22/09/2026 11:41',method:'Chuyển khoản',amount:68000},
      {code:'PTN-260915-000006',date:'15/09/2026 16:12',method:'Tiền mặt',amount:215000},
    ],
  },
]

function phone(v:string){return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')}

export default async function DebtDemoPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const state=sp.state??'all'
  const q=String(sp.q??'').trim().toLowerCase()
  const {supabase}=await requireUser()
  const bankResult=await supabase.from('bank_transfer_configs')
    .select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active')
    .eq('config_key','DEFAULT')
    .maybeSingle()
  const bankConfig=(bankResult.data??null) as any

  let rows=[...DEMO_DEBTS]
  if(state==='partial')rows=rows.filter(x=>x.rows.some(r=>r.paid>0))
  if(state==='old')rows=rows.filter(x=>x.age>=7)
  if(state==='open')rows=rows.filter(x=>x.debt>0)
  if(q)rows=rows.filter(x=>[x.name,x.phone,x.address,...x.rows.map(r=>r.code)].join(' ').toLowerCase().includes(q))

  const selected=DEMO_DEBTS.find(x=>x.customer_id===sp.customer)??null
  const tab=sp.tab??'summary'
  const pay=sp.pay??'cash'
  const collectMode=sp.mode==='collect'&&Boolean(selected)
  const totalDebt=DEMO_DEBTS.reduce((s,x)=>s+x.debt,0)
  const openInvoices=DEMO_DEBTS.reduce((s,x)=>s+x.invoices,0)
  const collectedToday=450000

  const transferDescription=selected?buildTransferDescription(null,selected.receiptCode):''
  const transferQR=selected&&pay==='transfer'&&bankConfig?.is_active
    ? buildVietQRUrl(bankConfig,selected.debt,transferDescription,'compact2')
    : ''

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    if(sp.q)p.set('q',sp.q)
    if(state!=='all')p.set('state',state)
    if(sp.customer)p.set('customer',sp.customer)
    if(sp.tab)p.set('tab',sp.tab)
    if(sp.mode)p.set('mode',sp.mode)
    if(sp.pay)p.set('pay',sp.pay)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v===''||v==='all')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/sales/debt'+(qs?'?'+qs:'')
  }

  return <div className={'sales-debt-demo '+(selected?'with-panel':'')}>
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">BÁN HÀNG · DEMO</span>
        <h1>Công nợ khách hàng</h1>
        <p>Theo dõi hóa đơn còn nợ, thu nợ và phiếu thu</p>
      </div>
      <div className="head-actions">
        <span className="sales-demo-badge">DỮ LIỆU DEMO</span>
        <Link className="button" href="/sales/customers">Khách hàng</Link>
      </div>
    </header>

    <section className="entity-status-strip debt-demo-kpis">
      <Link className={'entity-status-metric warning '+(state==='all'?'active':'')} href={href({state:null,customer:null,tab:null,mode:null,pay:null})}>
        <span>Tổng công nợ</span><b className="money">{formatMoney(totalDebt)}</b><small>{DEMO_DEBTS.length} khách còn nợ</small>
      </Link>
      <Link className={'entity-status-metric '+(state==='open'?'active':'')} href={href({state:'open',customer:null,tab:null,mode:null,pay:null})}>
        <span>Hóa đơn còn nợ</span><b>{openInvoices}</b><small>Chưa thu đủ</small>
      </Link>
      <Link className={'entity-status-metric info '+(state==='partial'?'active':'')} href={href({state:'partial',customer:null,tab:null,mode:null,pay:null})}>
        <span>Nợ một phần</span><b>{DEMO_DEBTS.filter(x=>x.rows.some(r=>r.paid>0)).length}</b><small>Đã thu một phần</small>
      </Link>
      <Link className={'entity-status-metric danger '+(state==='old'?'active':'')} href={href({state:'old',customer:null,tab:null,mode:null,pay:null})}>
        <span>Nợ từ 7 ngày</span><b>{DEMO_DEBTS.filter(x=>x.age>=7).length}</b><small>Cần ưu tiên xử lý</small>
      </Link>
      <div className="entity-status-metric success">
        <span>Đã thu hôm nay</span><b className="money">{formatMoney(collectedToday)}</b><small>Demo</small>
      </div>
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

    <div className="debt-demo-workspace">
      <section className="debt-demo-list">
        <div className="debt-demo-table-wrap">
          <table className="table debt-demo-table">
            <thead><tr>
              <th>Khách hàng</th><th>SĐT</th><th>Số HĐ nợ</th><th>Công nợ</th>
              <th>Nợ cũ nhất</th><th>Thu gần nhất</th><th>Xử lý</th>
            </tr></thead>
            <tbody>{rows.map(row=><tr key={row.customer_id} className={selected?.customer_id===row.customer_id?'selected':''}>
              <td><Link className="table-link" href={href({customer:row.customer_id,tab:'summary',mode:null,pay:null})}>{row.name}</Link><small>{row.address}</small></td>
              <td>{phone(row.phone)}</td>
              <td>{row.invoices}</td>
              <td className="money warning-text">{formatMoney(row.debt)}</td>
              <td>{row.oldest}<small>{row.age===0?'Hôm nay':row.age+' ngày'}</small></td>
              <td>{row.lastPayment}</td>
              <td><Link className="button small primary" href={href({customer:row.customer_id,tab:'summary',mode:'collect',pay:'cash'})}>Thu nợ</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {selected&&<aside className="debt-demo-panel">
        <div className="sales-detail-panel-head">
          <div>
            <span className="module-eyebrow">CÔNG NỢ KHÁCH HÀNG</span>
            <h2>{selected.name}</h2>
            <p>{phone(selected.phone)} · {selected.address}</p>
          </div>
          <Link className="panel-close" href={href({customer:null,tab:null,mode:null,pay:null})}>×</Link>
        </div>

        {collectMode&&<div className="debt-collect-demo">
          <div className="debt-collect-head">
            <div><span className="module-eyebrow">THU NỢ · DEMO</span><b>{selected.receiptCode}</b></div>
            <Link href={href({mode:null,pay:null})}>×</Link>
          </div>

          <div className="debt-collect-amount">
            <span>Số tiền thu</span>
            <b>{formatMoney(selected.debt)}</b>
            <small>Thu toàn bộ công nợ hiện tại</small>
          </div>

          <div className="debt-collect-methods">
            <Link className={pay==='cash'?'active':''} href={href({mode:'collect',pay:'cash'})}>Tiền mặt</Link>
            <Link className={pay==='transfer'?'active':''} href={href({mode:'collect',pay:'transfer'})}>Chuyển khoản</Link>
          </div>

          {pay==='cash'
            ? <div className="debt-collect-cash">
                <div><span>Khách thanh toán</span><b>{formatMoney(selected.debt)}</b></div>
                <div><span>Mã phiếu thu</span><b>{selected.receiptCode}</b></div>
              </div>
            : <div className="debt-collect-transfer">
                {transferQR
                  ? <img src={transferQR} alt="QR thu công nợ"/>
                  : <div className="debt-qr-empty">
                      <b>Chưa cấu hình QR</b>
                      <span>Cài đặt → Thanh toán & QR</span>
                    </div>}
                <div>
                  <div><span>Số tiền</span><b className="amount">{formatMoney(selected.debt)}</b></div>
                  <div><span>Ngân hàng</span><b>{bankConfig?.bank_name??'—'}</b></div>
                  <div><span>Số tài khoản</span><b>{bankConfig?.account_no??'—'}</b></div>
                  <div><span>Nội dung CK</span><b>{selected.receiptCode}</b></div>
                </div>
              </div>}

          <div className="debt-allocation">
            <span>Phân bổ vào hóa đơn</span>
            {selected.rows.map(row=><div key={row.code}>
              <div><b>{row.code}</b><small>{row.date}</small></div>
              <strong>{formatMoney(row.debt)}</strong>
            </div>)}
          </div>

          <div className="debt-collect-actions">
            <button className="button" type="button" disabled>In phiếu thu</button>
            <button className="button primary" type="button" disabled>DEMO · Xác nhận thu {formatMoney(selected.debt)}</button>
          </div>
        </div>}

        <div className="panel-tabs">
          <Link className={tab==='summary'?'active':''} href={href({customer:selected.customer_id,tab:'summary'})}>Tổng quan</Link>
          <Link className={tab==='invoices'?'active':''} href={href({customer:selected.customer_id,tab:'invoices'})}>Hóa đơn nợ</Link>
          <Link className={tab==='receipts'?'active':''} href={href({customer:selected.customer_id,tab:'receipts'})}>Lịch sử thu</Link>
        </div>

        <div className="debt-demo-panel-scroll">
          {tab==='summary'&&<>
            <div className="debt-customer-summary">
              <div className="warning"><span>Công nợ hiện tại</span><b>{formatMoney(selected.debt)}</b></div>
              <div><span>Hóa đơn còn nợ</span><b>{selected.invoices}</b></div>
              <div><span>Nợ cũ nhất</span><b>{selected.oldest}</b></div>
              <div><span>Tuổi nợ</span><b>{selected.age===0?'Hôm nay':selected.age+' ngày'}</b></div>
            </div>
            {!collectMode&&<Link className="button primary debt-main-collect" href={href({customer:selected.customer_id,tab:'summary',mode:'collect',pay:'cash'})}>Thu nợ · {formatMoney(selected.debt)}</Link>}
            <div className="debt-panel-section">
              <div className="debt-panel-section-head"><b>Hóa đơn đang nợ</b><span>{selected.invoices} hóa đơn</span></div>
              {selected.rows.map(row=><div className="debt-invoice-mini" key={row.code}>
                <div><b>{row.code}</b><span>{row.date} · {row.warehouse}</span></div>
                <div><small>Đã thu {formatMoney(row.paid)}</small><b>{formatMoney(row.debt)}</b></div>
              </div>)}
            </div>
          </>}

          {tab==='invoices'&&<table className="table debt-invoice-table">
            <thead><tr><th>Mã HĐ</th><th>Ngày</th><th>Tổng</th><th>Đã thu</th><th>Còn nợ</th></tr></thead>
            <tbody>{selected.rows.map(row=><tr key={row.code}>
              <td><b>{row.code}</b></td><td>{row.date}</td>
              <td className="money">{formatMoney(row.total)}</td>
              <td className="money">{formatMoney(row.paid)}</td>
              <td className="money warning-text">{formatMoney(row.debt)}</td>
            </tr>)}</tbody>
          </table>}

          {tab==='receipts'&&<div className="debt-receipt-history">
            {!selected.receipts.length
              ? <div className="empty compact">Chưa có phiếu thu nợ.</div>
              : selected.receipts.map(row=><div className="debt-receipt-row" key={row.code}>
                  <div><b>{row.code}</b><span>{row.date} · {row.method}</span></div>
                  <strong>{formatMoney(row.amount)}</strong>
                </div>)}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}
