import Link from 'next/link'

type SP={tab?:'overview'|'cashflow'|'settlement'|'reports'}
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' ₫'

const nav=[
  ['overview','Tổng quan tài chính'],
  ['cashflow','Thu / Chi'],
  ['settlement','Đối soát & Thanh toán'],
  ['reports','Báo cáo tài chính'],
] as const

export default async function FinancePublicPreview({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const tab=nav.some(x=>x[0]===sp.tab)?sp.tab!:'overview'
  return <div className="finance-public-preview">
    <aside className="finance-preview-sidebar">
      <div className="finance-preview-brand"><b>MYNH ERP</b><span>FINANCE PREVIEW</span></div>
      <div className="finance-preview-group">TÀI CHÍNH</div>
      {nav.map(([key,label])=><Link key={key} href={'/preview/finance?tab='+key} className={tab===key?'active':''}>{label}</Link>)}
      <div className="finance-preview-note">Bản xem giao diện · Dữ liệu minh hoạ</div>
    </aside>
    <main className="finance-preview-main">
      <div className="finance-preview-banner"><b>Cloudflare Preview</b><span>Không cần đăng nhập · Không ghi dữ liệu thật</span></div>

      {tab==='overview'&&<Overview/>}
      {tab==='cashflow'&&<Cashflow/>}
      {tab==='settlement'&&<Settlement/>}
      {tab==='reports'&&<Reports/>}
    </main>
  </div>
}

function Head({title,desc}:{title:string,desc:string}){
  return <header className="page-head finance-page-head"><div><span className="module-eyebrow">TÀI CHÍNH · PREVIEW</span><h1>{title}</h1><p>{desc}</p></div></header>
}

function Overview(){
  return <div className="finance-screen">
    <Head title="Tổng quan tài chính" desc="Dòng tiền, công nợ và các khoản đối soát trên một màn hình."/>
    <div className="finance-period-tabs"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span><span>Tháng này</span></div>
    <section className="finance-kpi-grid finance-overview-kpis">
      <div className="finance-kpi"><span>Tổng thu</span><b className="income">{money(1486000)}</b><small>3 giao dịch</small></div>
      <div className="finance-kpi"><span>Tổng chi</span><b className="expense">{money(2050000)}</b><small>Gồm đối soát Shipper</small></div>
      <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(-564000)}</b><small>Thu − Chi</small></div>
      <div className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{money(410000)}</b><small>2 khách còn nợ</small></div>
      <div className="finance-kpi"><span>COD đã đối soát</span><b>{money(2000000)}</b><small>4 đơn</small></div>
      <div className="finance-kpi warning"><span>Tip Shipper</span><b>{money(50000)}</b><small>2 đợt thanh toán</small></div>
    </section>
    <section className="finance-overview-grid">
      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Dòng tiền gần nhất</h2><span>4 ngày có phát sinh</span></div></div>
        <div className="finance-daily-list">
          {[
            ['02/10/2026',0,2050000,-2050000],
            ['01/10/2026',1486000,0,1486000],
            ['30/09/2026',800000,350000,450000],
            ['29/09/2026',0,120000,-120000],
          ].map(r=><div key={String(r[0])}><b>{r[0]}</b><span className="income">+ {money(Number(r[1]))}</span><span className="expense">− {money(Number(r[2]))}</span><strong>{money(Number(r[3]))}</strong></div>)}
        </div>
      </div>
      <div className="card finance-overview-card">
        <div className="card-head"><div><h2>Cơ cấu chi</h2><span>Top hạng mục</span></div></div>
        <div className="finance-category-bars">
          {[
            ['Thanh toán đơn nhập',2000000,100],
            ['Tip Shipper',50000,18],
            ['Đóng gói',35000,12],
            ['Phần mềm',12000,7],
          ].map(r=><div key={String(r[0])}><div><span>{r[0]}</span><b>{money(Number(r[1]))}</b></div><i><em style={{width:String(r[2])+'%'}}/></i></div>)}
        </div>
      </div>
    </section>
  </div>
}

function Cashflow(){
  const rows=[
    ['02/10/2026 15:30','PC-261002-000021','Chi','Đóng gói','Mua thùng carton','Nhập tay','Chuyển khoản',0,350000,'Đã ghi nhận'],
    ['02/10/2026 11:05','PC-261002-000019','Chi','Thanh toán đơn nhập','Đối soát 4 đơn','Đối soát','Chuyển khoản',0,2000000,'Đã ghi nhận'],
    ['01/10/2026 15:20','PT-261001-000022','Thu','Thu công nợ','Nguyễn Văn A thanh toán','Công nợ','Tiền mặt',800000,0,'Đã ghi nhận'],
    ['01/10/2026 08:20','POS-261001-000010','Thu','Bán hàng','Thanh toán POS','POS','Chuyển khoản',698000,0,'Đã ghi nhận'],
  ]
  return <div className="finance-screen">
    <Head title="Thu / Chi" desc="Sổ giao dịch tài chính trung tâm · Phiếu thu, Phiếu chi và Hạng mục trong cùng một màn hình."/>
    <div className="head-actions finance-preview-actions"><button className="button">Hạng mục</button><button className="button">+ Phiếu thu</button><button className="button primary">+ Phiếu chi</button></div>
    <section className="finance-kpi-grid">
      <div className="finance-kpi"><span>Tổng thu</span><b className="income">{money(1498000)}</b><small>Đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Tổng chi</span><b className="expense">{money(2350000)}</b><small>Đã ghi nhận</small></div>
      <div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(-852000)}</b><small>Thu − Chi</small></div>
      <div className="finance-kpi"><span>Số phiếu thu</span><b>2</b><small>Phiếu trong kỳ</small></div>
      <div className="finance-kpi"><span>Số phiếu chi</span><b>2</b><small>Phiếu trong kỳ</small></div>
      <div className="finance-kpi warning"><span>Chờ xử lý</span><b>1</b><small>Phiếu nháp</small></div>
    </section>
    <div className="finance-toolbar"><input className="search" readOnly placeholder="Tìm mã phiếu / nội dung / đối tượng..."/><button className="button small">Thu / Chi</button><button className="button small">Hạng mục</button><button className="button small">Nguồn</button></div>
    <div className="card table-card finance-table-card"><table className="table finance-table"><thead><tr><th>Thời gian</th><th>Mã phiếu</th><th>Loại</th><th>Hạng mục</th><th>Nội dung</th><th>Nguồn</th><th>Phương thức</th><th>Tiền thu</th><th>Tiền chi</th><th>Trạng thái</th></tr></thead><tbody>
      {rows.map((r,i)=><tr key={i}><td>{r[0]}</td><td className="strong finance-code">{r[1]}</td><td><span className={'finance-type '+(r[2]==='Thu'?'income':'expense')}>{r[2]}</span></td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td><td>{r[6]}</td><td className="money finance-money income">{Number(r[7])?money(Number(r[7])):'—'}</td><td className="money finance-money expense">{Number(r[8])?money(Number(r[8])):'—'}</td><td><span className="finance-status posted">{r[9]}</span></td></tr>)}
    </tbody></table></div>
  </div>
}

function Settlement(){
  return <div className="finance-screen">
    <Head title="Đối soát & Thanh toán" desc="Một màn hình cho Đơn nhập / Shipper và Khách hàng."/>
    <div className="finance-mode-bar"><div className="segmented finance-mode-tabs"><span className="active">Đơn nhập / Shipper</span><span>Khách hàng</span></div><div className="finance-period-tabs compact"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span></div></div>
    <section className="finance-kpi-grid finance-settlement-kpis">
      <div className="finance-kpi"><span>Đợt đối soát</span><b>2</b><small>4 đơn</small></div>
      <div className="finance-kpi"><span>Tổng COD</span><b>{money(2000000)}</b><small>COD snapshot</small></div>
      <div className="finance-kpi"><span>Thực chuyển</span><b className="expense">{money(2050000)}</b><small>Tiền đã chuyển</small></div>
      <div className="finance-kpi warning"><span>Tip Shipper</span><b>{money(50000)}</b><small>Thực chuyển − COD</small></div>
    </section>
    <div className="finance-settlement-list">
      {[
        ['HUB HN - Hồng Mai','HN','3 đơn',1500000,1530000,30000],
        ['HUB BG - Nguyễn Công Hãng','BG','1 đơn',500000,520000,20000],
      ].map((r,i)=><article className="card shipper-payment-batch" key={i}><div className="shipper-payment-batch-head"><div><span className="module-eyebrow">ĐỢT ĐỐI SOÁT</span><h2>{r[0]}</h2><small>{r[1]} · 02/10/2026 11:{i?'40':'05'}</small></div><div className="shipper-payment-batch-metrics"><div><span>Đơn</span><b>{r[2]}</b></div><div><span>COD</span><b>{money(Number(r[3]))}</b></div><div><span>Thực chuyển</span><b>{money(Number(r[4]))}</b></div><div><span>Tip</span><b>{money(Number(r[5]))}</b></div></div></div></article>)}
    </div>
    <div className="finance-preview-customer-mini">
      <div><b>Chế độ Khách hàng</b><span>Phải thu · Thu công nợ · Phân bổ vào hóa đơn · Lịch sử phiếu thu</span></div><strong>{money(410000)}</strong>
    </div>
  </div>
}

function Reports(){
  return <div className="finance-screen">
    <Head title="Báo cáo tài chính" desc="Dòng tiền, thu/chi, công nợ và hiệu quả bán hàng."/>
    <div className="finance-period-tabs"><span className="active-preview">Toàn thời gian</span><span>Hôm nay</span><span>7 ngày</span><span>Tháng này</span></div>
    <section className="finance-report-section"><div className="finance-report-title"><div><span>01</span><h2>Dòng tiền</h2></div></div><div className="finance-kpi-grid finance-report-kpis"><div className="finance-kpi"><span>Tiền vào</span><b className="income">{money(2286000)}</b></div><div className="finance-kpi"><span>Tiền ra</span><b className="expense">{money(2435000)}</b></div><div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(-149000)}</b></div></div></section>
    <section className="finance-report-section"><div className="finance-report-title"><div><span>02</span><h2>Hiệu quả bán hàng</h2></div><small>Báo cáo quản trị nội bộ</small></div><div className="finance-kpi-grid finance-report-kpis five"><div className="finance-kpi"><span>Doanh thu</span><b>{money(1486000)}</b></div><div className="finance-kpi"><span>Đã thu</span><b className="income">{money(1486000)}</b></div><div className="finance-kpi"><span>Giá vốn</span><b>{money(910000)}</b></div><div className="finance-kpi"><span>Lợi nhuận gộp</span><b>{money(576000)}</b></div><div className="finance-kpi warning"><span>Phải thu</span><b>{money(410000)}</b></div></div></section>
    <section className="finance-report-grid"><div className="card finance-overview-card"><div className="card-head"><div><h2>Chi theo hạng mục</h2><span>4 nhóm chính</span></div></div><div className="finance-category-bars report">{[['Thanh toán đơn nhập',2000000,100],['Đóng gói',350000,30],['Tip Shipper',50000,14],['Phần mềm',35000,10]].map(r=><div key={String(r[0])}><div><span>{r[0]}</span><b>{money(Number(r[1]))}</b></div><i><em style={{width:String(r[2])+'%'}}/></i></div>)}</div></div><div className="card finance-overview-card"><div className="card-head"><div><h2>Công nợ & Đối soát</h2></div></div><div className="finance-report-summary-list"><div><span>Phải thu khách hàng</span><b>{money(410000)}</b></div><div><span>COD đã đối soát</span><b>{money(2000000)}</b></div><div><span>Tip Shipper</span><b>{money(50000)}</b></div></div></div></section>
  </div>
}
