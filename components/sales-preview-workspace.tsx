'use client'
import { useMemo,useState } from 'react'

type View='overview'|'pos'|'history'|'customers'|'debt'
type Sale={id:string,code:string,time:string,customer:string,phone:string,warehouse:string,total:number,paid:number,debt:number,status:'PAID'|'PARTIAL'|'UNPAID',method:string,items:number}
type Customer={id:string,name:string,phone:string,address:string,orders:number,revenue:number,debt:number,last:string,status:'GOOD'|'DEBT'|'VIP'}

const money=(v:number)=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(v)
const SALES:Sale[]=[
  {id:'1',code:'POS-261002-00128',time:'02/10/2026 20:16',customer:'Nguyễn Văn An',phone:'0986 123 456',warehouse:'HN',total:685000,paid:500000,debt:185000,status:'PARTIAL',method:'Kết hợp',items:4},
  {id:'2',code:'POS-261002-00127',time:'02/10/2026 19:42',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:493000,paid:493000,debt:0,status:'PAID',method:'Chuyển khoản',items:3},
  {id:'3',code:'POS-261002-00126',time:'02/10/2026 18:05',customer:'Phạm Thu Trang',phone:'0388 223 344',warehouse:'BG',total:622000,paid:0,debt:622000,status:'UNPAID',method:'Ghi nợ',items:4},
  {id:'4',code:'POS-261002-00125',time:'02/10/2026 17:21',customer:'Lê Minh C',phone:'0966 456 789',warehouse:'HN',total:1163000,paid:1163000,debt:0,status:'PAID',method:'Tiền mặt',items:2},
  {id:'5',code:'POS-261002-00124',time:'02/10/2026 16:08',customer:'Bùi Lan Anh',phone:'0855 332 211',warehouse:'BG',total:410000,paid:210000,debt:200000,status:'PARTIAL',method:'Kết hợp',items:3},
  {id:'6',code:'POS-261002-00123',time:'02/10/2026 14:56',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:278000,paid:278000,debt:0,status:'PAID',method:'Tiền mặt',items:6},
]
const CUSTOMERS:Customer[]=[
  {id:'c1',name:'Nguyễn Văn An',phone:'0986 123 456',address:'Hoàng Mai, Hà Nội',orders:14,revenue:6850000,debt:185000,last:'02/10/2026 20:16',status:'VIP'},
  {id:'c2',name:'Phạm Thu Trang',phone:'0388 223 344',address:'Thanh Xuân, Hà Nội',orders:8,revenue:3380000,debt:622000,last:'02/10/2026 18:05',status:'DEBT'},
  {id:'c3',name:'Lê Minh C',phone:'0966 456 789',address:'Cầu Giấy, Hà Nội',orders:11,revenue:5240000,debt:0,last:'02/10/2026 17:21',status:'GOOD'},
  {id:'c4',name:'Bùi Lan Anh',phone:'0855 332 211',address:'Ba Đình, Hà Nội',orders:6,revenue:2110000,debt:410000,last:'02/10/2026 16:08',status:'DEBT'},
  {id:'c5',name:'Trần Thị Mai',phone:'0912 110 245',address:'Bắc Giang',orders:9,revenue:3960000,debt:0,last:'30/09/2026 20:18',status:'GOOD'},
]
const PRODUCTS=[
  ['OMO Matic 3kg','OMO-3KG-D','Túi 3kg',289000,18],
  ['Ensure Gold 850g','ENS-850','Lon',535000,6],
  ['Dove 640g','DOVE-640','Chai',195000,11],
  ['Nước rửa chén Sunlight','SUN-750','750g',64000,4],
  ['Coca Cola 1.5L','COKE-15','Chai',18000,26],
  ['Mì Hảo Hảo','MI-HAOHAO','Gói',4500,84],
] as const

function Status({status}:{status:Sale['status']}){
  return <span className={'sp-status '+status.toLowerCase()}>{status==='PAID'?'Đã thanh toán':status==='PARTIAL'?'Một phần':'Chưa thanh toán'}</span>
}
function Kpi({tone,label,value,sub,onClick}:{tone:string,label:string,value:string,sub:string,onClick?:()=>void}){
  return <button type="button" className={'sp-kpi '+tone} onClick={onClick}><span>{label}</span><b>{value}</b><small>{sub}</small></button>
}
function Header({title,desc,actions}:{title:string,desc:string,actions?:React.ReactNode}){
  return <header className="sp-head"><div><span>BÁN HÀNG · PREVIEW</span><h1>{title}</h1><p>{desc}</p></div><div className="sp-head-actions">{actions}</div></header>
}

export function SalesPreviewWorkspace(){
  const [view,setView]=useState<View>('overview')
  const [selectedSale,setSelectedSale]=useState<Sale|null>(null)
  const [selectedCustomer,setSelectedCustomer]=useState<Customer|null>(null)
  const [query,setQuery]=useState('')
  const [saleFilter,setSaleFilter]=useState<'ALL'|Sale['status']>('ALL')
  const [debtPanel,setDebtPanel]=useState<Customer|null>(null)
  const [cart,setCart]=useState<{name:string,qty:number,price:number}[]>([
    {name:'OMO Matic 3kg',qty:1,price:289000},{name:'Dove 640g',qty:1,price:195000}
  ])

  const filteredSales=useMemo(()=>SALES.filter(s=>{
    if(saleFilter!=='ALL'&&s.status!==saleFilter)return false
    if(query&&!([s.code,s.customer,s.phone,s.method].join(' ').toLowerCase().includes(query.toLowerCase())))return false
    return true
  }),[query,saleFilter])
  const cartTotal=cart.reduce((sum,x)=>sum+x.qty*x.price,0)
  const revenue=SALES.reduce((s,x)=>s+x.total,0)
  const collected=SALES.reduce((s,x)=>s+x.paid,0)
  const debt=SALES.reduce((s,x)=>s+x.debt,0)

  return <div className="sales-preview-root">
    <div className="sp-preview-banner"><b>PREVIEW RIÊNG · BÁN HÀNG</b><span>Chưa thay đổi nhóm Bán hàng trên main</span></div>
    <nav className="sp-module-nav">
      {([
        ['overview','Tổng quan bán hàng'],['pos','POS'],['history','Lịch sử bán'],['customers','Khách hàng'],['debt','Công nợ']
      ] as [View,string][]).map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>{setView(key);setSelectedSale(null);setSelectedCustomer(null);setDebtPanel(null)}}>{label}</button>)}
    </nav>

    {view==='overview'&&<div className="sp-screen">
      <Header title="Tổng quan bán hàng" desc="Doanh thu, dòng tiền, khách hàng và cảnh báo bán hàng trên cùng một màn hình"
        actions={<><button className="sp-btn">Lịch sử bán</button><button className="sp-btn primary" onClick={()=>setView('pos')}>Mở POS</button></>}/>
      <div className="sp-period"><button className="active">Toàn thời gian</button><button>Hôm nay</button><button>7 ngày</button><button>Tháng này</button><select><option>Tất cả kho</option><option>Kho HN</option><option>Kho BG</option></select></div>
      <section className="sp-kpis seven">
        <Kpi tone="blue" label="Doanh thu" value={money(revenue)} sub="6 hóa đơn"/>
        <Kpi tone="green" label="Đã thu" value={money(collected)} sub="Tiền thực nhận"/>
        <Kpi tone="amber" label="Công nợ mới" value={money(debt)} sub="3 khách đang nợ" onClick={()=>setView('debt')}/>
        <Kpi tone="purple" label="Khách mua" value="5" sub="4 khách có hồ sơ"/>
        <Kpi tone="cyan" label="Sản phẩm bán" value="22" sub="6 SKU"/>
        <Kpi tone="navy" label="Giá trị TB/HĐ" value={money(Math.round(revenue/SALES.length))} sub="Trung bình"/>
        <Kpi tone="red" label="Tồn thấp" value="2" sub="Cần bổ sung"/>
      </section>
      <div className="sp-overview-grid">
        <section className="sp-card revenue-card">
          <div className="sp-card-head"><div><b>Doanh thu theo ngày</b><span>Màu xanh = doanh thu thực tế</span></div><strong>{money(revenue)}</strong></div>
          <div className="sp-bars">
            {[['27/09',620000],['28/09',980000],['29/09',1340000],['30/09',890000],['01/10',1580000],['02/10',3651000]].map(([d,v])=><div key={d as string}><span>{d}</span><i><em style={{width:(Number(v)/3651000*100)+'%'}}/></i><b>{money(Number(v))}</b></div>)}
          </div>
        </section>
        <section className="sp-card payment-card">
          <div className="sp-card-head"><div><b>Tình trạng thanh toán</b><span>Phân biệt rõ đã thu / công nợ</span></div></div>
          <div className="sp-payment-ring">
            <div className="sp-donut"><b>71%</b><span>đã thu</span></div>
            <div className="sp-legend">
              <div className="green"><i/><span>Đã thanh toán</span><b>3 HĐ</b></div>
              <div className="amber"><i/><span>Một phần</span><b>2 HĐ</b></div>
              <div className="red"><i/><span>Chưa thanh toán</span><b>1 HĐ</b></div>
            </div>
          </div>
        </section>
        <section className="sp-card customer-card">
          <div className="sp-card-head"><div><b>Khách hàng cần chú ý</b><span>Công nợ và tần suất mua</span></div><button onClick={()=>setView('customers')}>Xem tất cả</button></div>
          {CUSTOMERS.slice(0,4).map(c=><div className="sp-customer-row" key={c.id}><span><b>{c.name}</b><small>{c.phone} · {c.orders} đơn</small></span><span className={c.debt?'debt':'ok'}><b>{c.debt?money(c.debt):'Không nợ'}</b><small>{c.status==='VIP'?'Khách VIP':c.debt?'Cần theo dõi':'Ổn định'}</small></span></div>)}
        </section>
        <section className="sp-card stock-card">
          <div className="sp-card-head"><div><b>Cảnh báo tồn bán</b><span>Chỉ SKU cần hành động</span></div></div>
          <div className="sp-stock-alert red"><span><b>Sunlight 750g</b><small>SUN-750 · Kho HN</small></span><strong>4</strong></div>
          <div className="sp-stock-alert amber"><span><b>Ensure Gold 850g</b><small>ENS-850 · Kho BG</small></span><strong>6</strong></div>
          <div className="sp-stock-alert green"><span><b>Dove 640g</b><small>DOVE-640 · Kho HN</small></span><strong>11</strong></div>
        </section>
      </div>
      <section className="sp-card sp-recent">
        <div className="sp-card-head"><div><b>Giao dịch gần nhất</b><span>Click để mở chi tiết</span></div><button onClick={()=>setView('history')}>Mở lịch sử</button></div>
        <table><thead><tr><th>Mã HĐ</th><th>Khách hàng</th><th>Kho</th><th>Thanh toán</th><th>Tổng tiền</th><th>Đã thu</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead>
          <tbody>{SALES.slice(0,5).map(s=><tr key={s.id} onClick={()=>{setSelectedSale(s);setView('history')}}><td><b>{s.code}</b><small>{s.time}</small></td><td>{s.customer}</td><td>{s.warehouse}</td><td>{s.method}</td><td>{money(s.total)}</td><td className="income">{money(s.paid)}</td><td className={s.debt?'expense':''}>{s.debt?money(s.debt):'—'}</td><td><Status status={s.status}/></td></tr>)}</tbody>
        </table>
      </section>
    </div>}

    {view==='pos'&&<div className="sp-screen sp-pos-screen">
      <Header title="POS bán hàng" desc="Bán nhanh, nhìn rõ tồn kho, giá bán và trạng thái thanh toán"
        actions={<><span className="sp-live"><i/> POS sẵn sàng</span><button className="sp-btn">Đơn tạm (2)</button></>}/>
      <section className="sp-kpis four">
        <Kpi tone="blue" label="Kho bán" value="HN" sub="Kho Hà Nội"/>
        <Kpi tone="green" label="SKU có tồn" value="148" sub="Có thể bán"/>
        <Kpi tone="amber" label="Tồn thấp" value="12" sub="≤ 10 sản phẩm"/>
        <Kpi tone="purple" label="Doanh thu hôm nay" value={money(3651000)} sub="6 hóa đơn"/>
      </section>
      <div className="sp-pos-toolbar"><select><option>Kho HN · Hà Nội</option><option>Kho BG · Bắc Giang</option></select><input placeholder="Tìm tên sản phẩm / SKU / quét barcode..."/><button className="sp-btn">Gắn khách</button></div>
      <div className="sp-pos-grid">
        <section className="sp-products">
          <div className="sp-section-title"><div><span>SẢN PHẨM ĐANG BÁN</span><b>Kho HN · 148 SKU có tồn</b></div><strong>Chọn để thêm vào giỏ</strong></div>
          <div className="sp-product-grid">{PRODUCTS.map(p=><button key={p[1]} onClick={()=>setCart(prev=>[...prev,{name:p[0],qty:1,price:p[3]}])} className={(p[4] as number)<=6?'low':''}><div><b>{p[0]}</b><span>{p[2]}</span></div><small>{p[1]}</small><footer><strong>{money(p[3] as number)}</strong><em>{p[4]} tồn</em></footer></button>)}</div>
        </section>
        <aside className="sp-cart">
          <div className="sp-cart-head"><div><span>HÓA ĐƠN HIỆN TẠI</span><b>Giỏ hàng · {cart.reduce((s,x)=>s+x.qty,0)} SP</b><small>Khách lẻ · Kho HN</small></div><button onClick={()=>setCart([])}>Xóa giỏ</button></div>
          <div className="sp-cart-lines">{cart.length===0?<div className="sp-empty">Chưa có sản phẩm</div>:cart.map((line,i)=><div className="sp-cart-line" key={i}><span><b>{line.name}</b><small>{money(line.price)}</small></span><div><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:Math.max(1,x.qty-1)}:x))}>−</button><b>{line.qty}</b><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:x.qty+1}:x))}>+</button></div><strong>{money(line.qty*line.price)}</strong></div>)}</div>
          <div className="sp-cart-customer"><span>Khách hàng</span><b>Khách lẻ</b><button>Gắn khách</button></div>
          <div className="sp-cart-summary"><div><span>Tiền hàng</span><b>{money(cartTotal)}</b></div><div><span>Giảm giá</span><b>0 ₫</b></div><div className="total"><span>PHẢI THU</span><b>{money(cartTotal)}</b></div></div>
          <div className="sp-pay-actions"><button>Giữ</button><button className="cash">Tiền mặt</button><button className="transfer">Chuyển khoản</button><button className="debt">Ghi nợ</button></div>
        </aside>
      </div>
    </div>}

    {view==='history'&&<div className={'sp-screen sp-with-panel '+(selectedSale?'open':'')}>
      <main>
        <Header title="Lịch sử bán" desc="Tra cứu hóa đơn, thanh toán và công nợ phát sinh"
          actions={<button className="sp-btn primary" onClick={()=>setView('pos')}>+ Bán hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="blue" label="Tổng hóa đơn" value="128" sub="Tháng này"/>
          <Kpi tone="green" label="Đã thanh toán" value="96" sub="75%"/>
          <Kpi tone="amber" label="Một phần" value="21" sub="Còn công nợ"/>
          <Kpi tone="red" label="Chưa thanh toán" value="11" sub="Cần theo dõi"/>
          <Kpi tone="purple" label="Doanh thu" value={money(48260000)} sub="Tháng này"/>
        </section>
        <div className="sp-toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã hóa đơn / khách hàng / SĐT..."/><select value={saleFilter} onChange={e=>setSaleFilter(e.target.value as any)}><option value="ALL">Tất cả trạng thái</option><option value="PAID">Đã thanh toán</option><option value="PARTIAL">Một phần</option><option value="UNPAID">Chưa thanh toán</option></select><select><option>Tất cả kho</option></select><button className="sp-btn">Cột</button></div>
        <section className="sp-card sp-table-card"><table><thead><tr><th>Thời gian</th><th>Mã HĐ</th><th>Khách hàng</th><th>Kho</th><th>SP</th><th>Phương thức</th><th>Tổng tiền</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead><tbody>{filteredSales.map(s=><tr key={s.id} className={selectedSale?.id===s.id?'selected':''} onClick={()=>setSelectedSale(s)}><td>{s.time}</td><td><b>{s.code}</b></td><td><b>{s.customer}</b><small>{s.phone}</small></td><td>{s.warehouse}</td><td>{s.items}</td><td>{s.method}</td><td className="money">{money(s.total)}</td><td className={s.debt?'expense':''}>{s.debt?money(s.debt):'—'}</td><td><Status status={s.status}/></td></tr>)}</tbody></table></section>
      </main>
      {selectedSale&&<aside className="sp-slidebar"><div className="sp-panel-head"><div><span>CHI TIẾT HÓA ĐƠN</span><h2>{selectedSale.code}</h2><p>{selectedSale.customer} · {selectedSale.time}</p></div><button onClick={()=>setSelectedSale(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Thông tin</button><button>Thanh toán</button><button>Lịch sử</button></div><div className="sp-panel-scroll"><div className="sp-detail-grid"><div><span>Khách hàng</span><b>{selectedSale.customer}</b></div><div><span>Kho bán</span><b>{selectedSale.warehouse}</b></div><div><span>Phương thức</span><b>{selectedSale.method}</b></div><div><span>Trạng thái</span><Status status={selectedSale.status}/></div></div><div className="sp-money-box"><div><span>Tổng hóa đơn</span><b>{money(selectedSale.total)}</b></div><div className="income"><span>Đã thu</span><b>{money(selectedSale.paid)}</b></div><div className="expense"><span>Còn nợ</span><b>{money(selectedSale.debt)}</b></div></div><div className="sp-panel-section"><b>Sản phẩm</b>{PRODUCTS.slice(0,selectedSale.items>3?3:2).map(p=><div className="sp-mini-row" key={p[1]}><span><b>{p[0]}</b><small>{p[1]} · {p[2]}</small></span><strong>{money(p[3] as number)}</strong></div>)}</div></div></aside>}
    </div>}

    {view==='customers'&&<div className={'sp-screen sp-with-panel '+(selectedCustomer?'open':'')}>
      <main>
        <Header title="Khách hàng" desc="Hồ sơ mua hàng, doanh thu và công nợ theo từng khách"
          actions={<button className="sp-btn primary">+ Khách hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="blue" label="Tổng khách" value="248" sub="Có hồ sơ"/>
          <Kpi tone="green" label="Mua trong 30 ngày" value="86" sub="Đang hoạt động"/>
          <Kpi tone="purple" label="Khách VIP" value="18" sub="Doanh thu cao"/>
          <Kpi tone="amber" label="Khách đang nợ" value="27" sub={money(2860000)}/>
          <Kpi tone="red" label="Nợ từ 7 ngày" value="6" sub="Cần xử lý"/>
        </section>
        <div className="sp-toolbar"><input placeholder="Tìm tên / SĐT / địa chỉ..."/><select><option>Tất cả khách</option><option>Đang nợ</option><option>VIP</option></select><button className="sp-btn">Cột</button></div>
        <section className="sp-card sp-table-card"><table><thead><tr><th>Khách hàng</th><th>SĐT</th><th>Địa chỉ</th><th>Số đơn</th><th>Doanh thu</th><th>Công nợ</th><th>Mua gần nhất</th><th>Nhóm</th></tr></thead><tbody>{CUSTOMERS.map(c=><tr key={c.id} className={selectedCustomer?.id===c.id?'selected':''} onClick={()=>setSelectedCustomer(c)}><td><b>{c.name}</b></td><td>{c.phone}</td><td>{c.address}</td><td>{c.orders}</td><td className="income">{money(c.revenue)}</td><td className={c.debt?'expense':''}>{c.debt?money(c.debt):'—'}</td><td>{c.last}</td><td><span className={'sp-customer-tag '+c.status.toLowerCase()}>{c.status==='VIP'?'VIP':c.status==='DEBT'?'Đang nợ':'Ổn định'}</span></td></tr>)}</tbody></table></section>
      </main>
      {selectedCustomer&&<aside className="sp-slidebar"><div className="sp-panel-head"><div><span>KHÁCH HÀNG</span><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.phone} · {selectedCustomer.address}</p></div><button onClick={()=>setSelectedCustomer(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Tổng quan</button><button>Lịch sử mua</button><button>Công nợ</button></div><div className="sp-panel-scroll"><div className="sp-customer-summary"><Kpi tone="blue" label="Số đơn" value={String(selectedCustomer.orders)} sub="Toàn thời gian"/><Kpi tone="green" label="Doanh thu" value={money(selectedCustomer.revenue)} sub="Tổng mua"/><Kpi tone={selectedCustomer.debt?'amber':'green'} label="Công nợ" value={money(selectedCustomer.debt)} sub={selectedCustomer.debt?'Cần theo dõi':'Không nợ'}/></div><div className="sp-panel-section"><b>Giao dịch gần đây</b>{SALES.filter(s=>s.customer===selectedCustomer.name).map(s=><div className="sp-mini-row" key={s.id}><span><b>{s.code}</b><small>{s.time}</small></span><strong>{money(s.total)}</strong></div>)}</div></div></aside>}
    </div>}

    {view==='debt'&&<div className={'sp-screen sp-with-panel '+(debtPanel?'open':'')}>
      <main>
        <Header title="Công nợ khách hàng" desc="Theo dõi số tiền còn phải thu và thao tác thu nợ theo khách"
          actions={<button className="sp-btn" onClick={()=>setView('customers')}>Khách hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="amber" label="Tổng công nợ" value={money(2860000)} sub="27 khách"/>
          <Kpi tone="red" label="Nợ từ 7 ngày" value={money(860000)} sub="6 khách"/>
          <Kpi tone="purple" label="Hóa đơn còn nợ" value="34" sub="Chưa thu đủ"/>
          <Kpi tone="green" label="Đã thu hôm nay" value={money(1250000)} sub="8 phiếu thu"/>
          <Kpi tone="blue" label="Thu trong tháng" value={money(14380000)} sub="92 phiếu thu"/>
        </section>
        <div className="sp-toolbar"><input placeholder="Tìm khách / SĐT / mã hóa đơn..."/><select><option>Tất cả công nợ</option><option>Nợ một phần</option><option>Nợ từ 7 ngày</option></select><button className="sp-btn">Bộ lọc</button></div>
        <section className="sp-card sp-table-card"><table><thead><tr><th>Khách hàng</th><th>SĐT</th><th>HĐ nợ</th><th>Công nợ</th><th>Nợ cũ nhất</th><th>Thu gần nhất</th><th>Mức độ</th><th>Xử lý</th></tr></thead><tbody>{CUSTOMERS.filter(c=>c.debt>0).map((c,i)=><tr key={c.id}><td><b>{c.name}</b><small>{c.address}</small></td><td>{c.phone}</td><td>{i+1}</td><td className="expense"><b>{money(c.debt)}</b></td><td>{i===1?'25/09/2026':'01/10/2026'}</td><td>{i===1?'—':'01/10/2026 10:20'}</td><td><span className={'sp-risk '+(i===1?'high':'medium')}>{i===1?'Ưu tiên':'Theo dõi'}</span></td><td><button className="sp-btn small primary" onClick={()=>setDebtPanel(c)}>Thu nợ</button></td></tr>)}</tbody></table></section>
      </main>
      {debtPanel&&<aside className="sp-slidebar"><div className="sp-panel-head amber"><div><span>THU CÔNG NỢ</span><h2>{debtPanel.name}</h2><p>{debtPanel.phone}</p></div><button onClick={()=>setDebtPanel(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Thu tiền</button><button>Phân bổ</button><button>Lịch sử</button></div><div className="sp-panel-scroll"><div className="sp-debt-total"><span>Số tiền cần thu</span><b>{money(debtPanel.debt)}</b><small>2 hóa đơn còn công nợ</small></div><div className="sp-payment-methods"><button className="active">Tiền mặt</button><button>Chuyển khoản</button><button>Kết hợp</button></div><div className="sp-panel-section"><b>Phân bổ vào hóa đơn</b><div className="sp-mini-row"><span><b>POS-261002-00128</b><small>02/10/2026 20:16</small></span><strong>{money(debtPanel.debt)}</strong></div></div><div className="sp-panel-actions"><button className="sp-btn">In phiếu thu</button><button className="sp-btn primary">Xác nhận thu {money(debtPanel.debt)}</button></div></div></aside>}
    </div>}
  </div>
}
