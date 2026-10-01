import Link from 'next/link'
import { formatMoney } from '@/lib/format'

type SP={
  q?:string
  state?:'all'|'debt'|'repeat'|'new'
  customer?:string
  tab?:'info'|'purchases'|'debt'|'history'
}

const DEMO_CUSTOMERS=[
  {id:'cus-001',name:'Nguyễn Văn An',phone:'0986123456',address:'Hoàng Mai, Hà Nội',orders:8,total:3684000,debt:185000,last:'01/10/2026 10:20',first:'12/07/2026',note:'Khách mua thường xuyên tại kho HN.',status:'repeat'},
  {id:'cus-002',name:'Trần Thị Mai',phone:'0912345678',address:'Hai Bà Trưng, Hà Nội',orders:12,total:5826000,debt:0,last:'30/09/2026 20:18',first:'18/05/2026',note:'Ưu tiên thanh toán chuyển khoản.',status:'repeat'},
  {id:'cus-003',name:'Lê Văn Cường',phone:'0966456789',address:'Lạng Giang, Bắc Giang',orders:4,total:2363000,debt:263000,last:'30/09/2026 15:20',first:'03/08/2026',note:'Còn nợ một phần hóa đơn gần nhất.',status:'repeat'},
  {id:'cus-004',name:'Phạm Thu Trang',phone:'0388223344',address:'Thanh Xuân, Hà Nội',orders:1,total:622000,debt:622000,last:'29/09/2026 12:12',first:'29/09/2026',note:'Khách mới, đang ghi nợ toàn bộ hóa đơn đầu tiên.',status:'new'},
  {id:'cus-005',name:'Hoàng Minh Đức',phone:'0904987654',address:'Yên Dũng, Bắc Giang',orders:6,total:3145000,debt:0,last:'28/09/2026 18:44',first:'22/06/2026',note:'',status:'repeat'},
  {id:'cus-006',name:'Nguyễn Thu Hà',phone:'0977554433',address:'Long Biên, Hà Nội',orders:2,total:884000,debt:0,last:'26/09/2026 09:05',first:'11/09/2026',note:'',status:'repeat'},
  {id:'cus-007',name:'Đỗ Văn Nam',phone:'0326889977',address:'Lục Nam, Bắc Giang',orders:1,total:341000,debt:0,last:'24/09/2026 16:35',first:'24/09/2026',note:'Khách mới.',status:'new'},
  {id:'cus-008',name:'Bùi Lan Anh',phone:'0855332211',address:'Cầu Giấy, Hà Nội',orders:5,total:2478000,debt:410000,last:'22/09/2026 11:40',first:'19/07/2026',note:'Có 2 hóa đơn còn nợ.',status:'repeat'},
]

const DEMO_PURCHASES:Record<string,any[]> = {
  'cus-001':[
    {code:'POS-261001-000005',time:'01/10/2026 10:20',warehouse:'HN',items:3,total:685000,paid:500000,debt:185000,status:'PARTIAL'},
    {code:'POS-260925-000091',time:'25/09/2026 19:15',warehouse:'HN',items:2,total:493000,paid:493000,debt:0,status:'PAID'},
    {code:'POS-260918-000064',time:'18/09/2026 08:42',warehouse:'HN',items:4,total:826000,paid:826000,debt:0,status:'PAID'},
  ],
  'cus-002':[
    {code:'POS-260930-000118',time:'30/09/2026 20:18',warehouse:'HN',items:4,total:826000,paid:826000,debt:0,status:'PAID'},
    {code:'POS-260921-000073',time:'21/09/2026 14:21',warehouse:'HN',items:5,total:1135000,paid:1135000,debt:0,status:'PAID'},
  ],
  'cus-003':[
    {code:'POS-260930-000116',time:'30/09/2026 15:20',warehouse:'HN',items:3,total:1163000,paid:900000,debt:263000,status:'PARTIAL'},
  ],
  'cus-004':[
    {code:'POS-260929-000108',time:'29/09/2026 12:12',warehouse:'HN',items:4,total:622000,paid:0,debt:622000,status:'UNPAID'},
  ],
  'cus-008':[
    {code:'POS-260922-000079',time:'22/09/2026 11:40',warehouse:'HN',items:2,total:278000,paid:68000,debt:210000,status:'PARTIAL'},
    {code:'POS-260915-000051',time:'15/09/2026 16:10',warehouse:'HN',items:2,total:415000,paid:215000,debt:200000,status:'PARTIAL'},
  ],
}

function phone(v:string){
  return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')
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

export default async function CustomersDemoPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const state=sp.state??'all'
  const q=String(sp.q??'').trim().toLowerCase()

  let rows=[...DEMO_CUSTOMERS]
  if(state==='debt')rows=rows.filter(x=>x.debt>0)
  if(state==='repeat')rows=rows.filter(x=>x.orders>=2)
  if(state==='new')rows=rows.filter(x=>x.orders===1)
  if(q)rows=rows.filter(x=>[x.name,x.phone,x.address].join(' ').toLowerCase().includes(q))

  const selected=DEMO_CUSTOMERS.find(x=>x.id===sp.customer)??null
  const tab=sp.tab??'info'
  const purchases=selected?DEMO_PURCHASES[selected.id]??[]:[]

  const totalDebt=DEMO_CUSTOMERS.reduce((s,x)=>s+x.debt,0)
  const totalRevenue=DEMO_CUSTOMERS.reduce((s,x)=>s+x.total,0)

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    if(sp.q)p.set('q',sp.q)
    if(state!=='all')p.set('state',state)
    if(sp.customer)p.set('customer',sp.customer)
    if(sp.tab)p.set('tab',sp.tab)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v===''||v==='all')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/sales/customers'+(qs?'?'+qs:'')
  }

  return <div className={'sales-customers-demo '+(selected?'with-panel':'')}>
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">BÁN HÀNG · DEMO</span>
        <h1>Khách hàng</h1>
        <p>Hồ sơ khách, lịch sử mua, doanh số và công nợ</p>
      </div>
      <div className="head-actions">
        <span className="sales-demo-badge">DỮ LIỆU DEMO</span>
        <Link className="button" href="/sales/debt">Công nợ</Link>
        <button className="button primary" type="button" disabled>+ Thêm khách</button>
      </div>
    </header>

    <section className="entity-status-strip customer-demo-kpis">
      <Link className={'entity-status-metric '+(state==='all'?'active':'')} href={href({state:null,customer:null,tab:null})}>
        <span>Tổng khách hàng</span><b>{DEMO_CUSTOMERS.length}</b><small>{formatMoney(totalRevenue)} tổng mua</small>
      </Link>
      <Link className={'entity-status-metric success '+(state==='repeat'?'active':'')} href={href({state:'repeat',customer:null,tab:null})}>
        <span>Khách quay lại</span><b>{DEMO_CUSTOMERS.filter(x=>x.orders>=2).length}</b><small>Từ 2 hóa đơn trở lên</small>
      </Link>
      <Link className={'entity-status-metric info '+(state==='new'?'active':'')} href={href({state:'new',customer:null,tab:null})}>
        <span>Khách mới</span><b>{DEMO_CUSTOMERS.filter(x=>x.orders===1).length}</b><small>1 hóa đơn</small>
      </Link>
      <Link className={'entity-status-metric warning '+(state==='debt'?'active':'')} href={href({state:'debt',customer:null,tab:null})}>
        <span>Khách còn nợ</span><b>{DEMO_CUSTOMERS.filter(x=>x.debt>0).length}</b><small>{formatMoney(totalDebt)}</small>
      </Link>
    </section>

    <form className="entity-command-bar customer-demo-command" action="/sales/customers">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Tìm tên khách / SĐT / địa chỉ..."/>
      <select name="state" defaultValue={state}>
        <option value="all">Tất cả khách</option>
        <option value="repeat">Khách quay lại</option>
        <option value="new">Khách mới</option>
        <option value="debt">Còn công nợ</option>
      </select>
      <button className="button primary small">Lọc</button>
      {(q||state!=='all')&&<Link className="button small" href="/sales/customers">Đặt lại</Link>}
      <div className="entity-result-meta"><b>{rows.length}</b><span> khách hàng</span></div>
    </form>

    <div className="customer-demo-workspace">
      <section className="customer-demo-list">
        <div className="customer-demo-table-wrap">
          <table className="table customer-demo-table">
            <thead><tr>
              <th>Khách hàng</th><th>SĐT</th><th>Lần mua gần nhất</th><th>Số HĐ</th>
              <th>Tổng mua</th><th>Còn nợ</th><th>Trạng thái</th>
            </tr></thead>
            <tbody>{rows.map(row=><tr key={row.id} className={selected?.id===row.id?'selected':''}>
              <td><Link className="table-link" href={href({customer:row.id,tab:'info'})}>{row.name}</Link><small>{row.address}</small></td>
              <td>{phone(row.phone)}</td>
              <td>{row.last}</td>
              <td>{row.orders}</td>
              <td className="money">{formatMoney(row.total)}</td>
              <td className={'money '+(row.debt>0?'warning-text':'')}>{formatMoney(row.debt)}</td>
              <td>{row.debt>0
                ? <span className="status-pill orange">Còn nợ</span>
                : <span className="status-pill green">Bình thường</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {selected&&<aside className="customer-demo-panel">
        <div className="sales-detail-panel-head">
          <div>
            <span className="module-eyebrow">KHÁCH HÀNG</span>
            <h2>{selected.name}</h2>
            <p>{phone(selected.phone)} · {selected.address}</p>
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
            <div className="sales-detail-grid">
              <div><span>Họ tên</span><b>{selected.name}</b></div>
              <div><span>SĐT</span><b>{phone(selected.phone)}</b></div>
              <div className="full"><span>Địa chỉ</span><b>{selected.address}</b></div>
              <div><span>Khách từ</span><b>{selected.first}</b></div>
              <div><span>Mua gần nhất</span><b>{selected.last}</b></div>
            </div>
            <div className="customer-demo-summary">
              <div><span>Số hóa đơn</span><b>{selected.orders}</b></div>
              <div><span>Tổng mua</span><b>{formatMoney(selected.total)}</b></div>
              <div className={selected.debt>0?'warning':''}><span>Còn nợ</span><b>{formatMoney(selected.debt)}</b></div>
            </div>
            <div className="customer-demo-note"><span>Ghi chú</span><b>{selected.note||'Chưa có ghi chú.'}</b></div>
          </>}

          {tab==='purchases'&&<div className="customer-demo-purchases">
            {!purchases.length
              ? <div className="empty compact">Chưa có dữ liệu demo cho khách này.</div>
              : purchases.map(row=><div className="customer-purchase-row" key={row.code}>
                  <div><b>{row.code}</b><span>{row.time} · {row.warehouse} · {row.items} SP</span></div>
                  <div><strong>{formatMoney(row.total)}</strong><span className={'status-pill '+pill(row.status)}>{paymentLabel(row.status)}</span></div>
                </div>)}
          </div>}

          {tab==='debt'&&<div className="customer-demo-debt">
            <div className="customer-debt-total"><span>Công nợ hiện tại</span><b>{formatMoney(selected.debt)}</b></div>
            {selected.debt<=0
              ? <div className="empty compact">Khách hàng không còn công nợ.</div>
              : <>
                  {purchases.filter(x=>x.debt>0).map(row=><div className="customer-debt-invoice" key={row.code}>
                    <div><b>{row.code}</b><span>{row.time}</span></div>
                    <div><span>Đã thu {formatMoney(row.paid)}</span><b>{formatMoney(row.debt)} còn nợ</b></div>
                  </div>)}
                  <Link className="button primary customer-collect-button" href={'/sales/debt?customer='+selected.id+'&mode=collect'}>Thu nợ</Link>
                </>}
          </div>}

          {tab==='history'&&<div className="sales-audit-preview">
            <div><i></i><span>{selected.first}</span><b>Tạo khách hàng</b><small>Nguồn: POS</small></div>
            {purchases.slice().reverse().map(row=><div key={row.code}><i></i><span>{row.time}</span><b>Phát sinh hóa đơn</b><small>{row.code} · {formatMoney(row.total)}</small></div>)}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}
