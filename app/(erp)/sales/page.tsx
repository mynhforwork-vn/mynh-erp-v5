import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={range?:RangeKey,from?:string,to?:string,warehouse?:string}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function localStartIso(dateText:string){return new Date(`${dateText}T00:00:00+07:00`).toISOString()}
function localEndIso(dateText:string){return new Date(`${dateText}T23:59:59.999+07:00`).toISOString()}
function shiftLocalDays(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {from:shiftLocalDays(y,m,d,-daysFromMonday),to:shiftLocalDays(y,m,d,6-daysFromMonday)}
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){const x=currentWeekRange(p.year,p.month,p.day);from=x.from;to=x.to;label='Tuần này'}
  if(key==='7d'){from=shiftLocalDays(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDays(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){from=ymd(p.year,Math.floor((p.month-1)/3)*3+1,1);label='Quý này'}
  if(key==='year'){from=ymd(p.year,1,1);label='Năm nay'}
  if(key==='all'){from='1970-01-01';to='9999-12-31';label='Toàn thời gian'}
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {key,from,to,label,start:localStartIso(from),end:localEndIso(to)}
}
function localDay(iso:string){
  const d=new Date(new Date(iso).getTime()+7*HOUR)
  return ymd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())
}

const DEMO_SALES=[
  {id:'demo-001',code:'POS-261001-0001',sale_at:'2026-10-01T02:10:00Z',warehouse:'HN',customer:'Khách lẻ',total:493000,paid:493000,debt:0,status:'PAID'},
  {id:'demo-002',code:'POS-261001-0002',sale_at:'2026-10-01T03:20:00Z',warehouse:'BG',customer:'Nguyễn Văn An',total:685000,paid:500000,debt:185000,status:'PARTIAL'},
  {id:'demo-003',code:'POS-261001-0003',sale_at:'2026-10-01T04:05:00Z',warehouse:'HN',customer:'Khách lẻ',total:152000,paid:152000,debt:0,status:'PAID'},
  {id:'demo-004',code:'POS-260930-0018',sale_at:'2026-09-30T13:18:00Z',warehouse:'HN',customer:'Trần Thị Mai',total:826000,paid:826000,debt:0,status:'PAID'},
  {id:'demo-005',code:'POS-260930-0017',sale_at:'2026-09-30T11:44:00Z',warehouse:'BG',customer:'Khách lẻ',total:278000,paid:278000,debt:0,status:'PAID'},
  {id:'demo-006',code:'POS-260930-0016',sale_at:'2026-09-30T08:20:00Z',warehouse:'HN',customer:'Lê Văn C',total:1163000,paid:900000,debt:263000,status:'PARTIAL'},
  {id:'demo-007',code:'POS-260929-0014',sale_at:'2026-09-29T12:35:00Z',warehouse:'BG',customer:'Khách lẻ',total:341000,paid:341000,debt:0,status:'PAID'},
  {id:'demo-008',code:'POS-260929-0013',sale_at:'2026-09-29T05:12:00Z',warehouse:'HN',customer:'Phạm Thị Lan',total:622000,paid:0,debt:622000,status:'UNPAID'},
]

const DEMO_ITEMS=[
  {sale_id:'demo-001',warehouse:'HN',sku:'OMO-3KG-D',name:'OMO Matic 3kg',variant:'Túi 3kg',qty:1,revenue:289000},
  {sale_id:'demo-001',warehouse:'HN',sku:'DOVE-640',name:'Dove 640g',variant:'Chai',qty:1,revenue:195000},
  {sale_id:'demo-001',warehouse:'HN',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',variant:'Gói',qty:2,revenue:9000},
  {sale_id:'demo-002',warehouse:'BG',sku:'ENS-850',name:'Ensure Gold 850g',variant:'Lon',qty:1,revenue:535000},
  {sale_id:'demo-002',warehouse:'BG',sku:'COKE-15',name:'Coca Cola 1.5L',variant:'Chai',qty:5,revenue:80000},
  {sale_id:'demo-002',warehouse:'BG',sku:'AQUA-500',name:'Nước suối 500ml',variant:'Chai',qty:10,revenue:70000},
  {sale_id:'demo-003',warehouse:'HN',sku:'SUN-750',name:'Nước rửa chén Sunlight',variant:'750g',qty:2,revenue:64000},
  {sale_id:'demo-003',warehouse:'HN',sku:'MENTOS',name:'Kẹo Mentos',variant:'Thỏi',qty:4,revenue:48000},
  {sale_id:'demo-003',warehouse:'HN',sku:'AQUA-500',name:'Nước suối 500ml',variant:'Chai',qty:6,revenue:40000},
  {sale_id:'demo-004',warehouse:'HN',sku:'OMO-3KG-D',name:'OMO Matic 3kg',variant:'Túi 3kg',qty:2,revenue:578000},
  {sale_id:'demo-004',warehouse:'HN',sku:'DOVE-640',name:'Dove 640g',variant:'Chai',qty:1,revenue:195000},
  {sale_id:'demo-004',warehouse:'HN',sku:'COKE-15',name:'Coca Cola 1.5L',variant:'Chai',qty:3,revenue:53000},
  {sale_id:'demo-005',warehouse:'BG',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',variant:'Gói',qty:20,revenue:90000},
  {sale_id:'demo-005',warehouse:'BG',sku:'AQUA-500',name:'Nước suối 500ml',variant:'Chai',qty:12,revenue:72000},
  {sale_id:'demo-005',warehouse:'BG',sku:'SUN-750',name:'Nước rửa chén Sunlight',variant:'750g',qty:2,revenue:64000},
  {sale_id:'demo-005',warehouse:'BG',sku:'MENTOS',name:'Kẹo Mentos',variant:'Thỏi',qty:4,revenue:52000},
  {sale_id:'demo-006',warehouse:'HN',sku:'ENS-850',name:'Ensure Gold 850g',variant:'Lon',qty:2,revenue:1070000},
  {sale_id:'demo-006',warehouse:'HN',sku:'AQUA-500',name:'Nước suối 500ml',variant:'Chai',qty:15,revenue:93000},
  {sale_id:'demo-007',warehouse:'BG',sku:'DOVE-640',name:'Dove 640g',variant:'Chai',qty:1,revenue:195000},
  {sale_id:'demo-007',warehouse:'BG',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',variant:'Gói',qty:12,revenue:54000},
  {sale_id:'demo-007',warehouse:'BG',sku:'MENTOS',name:'Kẹo Mentos',variant:'Thỏi',qty:8,revenue:92000},
  {sale_id:'demo-008',warehouse:'HN',sku:'OMO-3KG-D',name:'OMO Matic 3kg',variant:'Túi 3kg',qty:1,revenue:289000},
  {sale_id:'demo-008',warehouse:'HN',sku:'DOVE-640',name:'Dove 640g',variant:'Chai',qty:1,revenue:195000},
  {sale_id:'demo-008',warehouse:'HN',sku:'SUN-750',name:'Nước rửa chén Sunlight',variant:'750g',qty:4,revenue:128000},
  {sale_id:'demo-008',warehouse:'HN',sku:'MENTOS',name:'Kẹo Mentos',variant:'Thỏi',qty:1,revenue:10000},
]

export default async function SalesDashboard({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const range=resolveRange(sp)
  const {supabase}=await requireUser()

  const [{data:salesData,error:salesError},{data:warehouses},{data:balances}]=await Promise.all([
    supabase.from('sales')
      .select('id,customer_id,sale_at,total_amount,paid_amount,debt_amount,payment_status,created_by,customers(name,phone)')
      .gte('sale_at',range.start)
      .lte('sale_at',range.end)
      .order('sale_at',{ascending:false})
      .limit(3000),
    supabase.from('warehouses').select('id,code,name,address').eq('is_active',true).order('code'),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,sku,product_name,variant_name,quantity')
      .order('quantity',{ascending:true})
      .limit(1000),
  ])

  const realSales=(salesData??[]) as any[]
  const saleIds=realSales.map(x=>x.id)
  let realItems:any[]=[]
  if(saleIds.length){
    const {data}=await supabase.from('sale_items')
      .select('sale_id,warehouse_id,product_variant_id,quantity,sale_price,warehouses(code,address),product_variants(variant_name,products(sku,name))')
      .in('sale_id',saleIds)
      .limit(10000)
    realItems=(data??[]) as any[]
  }

  const hasRealSales=realSales.length>0
  const warehouseFilter=String(sp.warehouse??'ALL').toUpperCase()

  const sales=hasRealSales
    ? realSales.map((s:any)=>{
        const first=realItems.find((i:any)=>i.sale_id===s.id)
        const wh=first?.warehouses
        return {
          id:String(s.id),
          code:'POS-'+String(s.id).slice(0,8).toUpperCase(),
          sale_at:String(s.sale_at),
          warehouse:String(wh?.code??'—'),
          customer:String(s.customers?.name??'Khách lẻ'),
          total:Number(s.total_amount??0),
          paid:Number(s.paid_amount??0),
          debt:Number(s.debt_amount??Math.max(0,Number(s.total_amount??0)-Number(s.paid_amount??0))),
          status:String(s.payment_status??'UNPAID'),
        }
      })
    : DEMO_SALES

  const items=hasRealSales
    ? realItems.map((i:any)=>({
        sale_id:String(i.sale_id),
        warehouse:String(i.warehouses?.code??'—'),
        sku:String(i.product_variants?.products?.sku??'—'),
        name:String(i.product_variants?.products?.name??'Sản phẩm'),
        variant:String(i.product_variants?.variant_name??''),
        qty:Number(i.quantity??0),
        revenue:Number(i.quantity??0)*Number(i.sale_price??0),
      }))
    : DEMO_ITEMS

  const visibleSales=sales.filter(s=>{
    if(warehouseFilter!=='ALL'&&s.warehouse!==warehouseFilter)return false
    if(hasRealSales)return true
    const day=localDay(s.sale_at)
    return day>=range.from&&day<=range.to
  })
  const visibleIds=new Set(visibleSales.map(s=>s.id))
  const visibleItems=items.filter(i=>visibleIds.has(i.sale_id)&&(warehouseFilter==='ALL'||i.warehouse===warehouseFilter))

  const revenue=visibleSales.reduce((sum,s)=>sum+s.total,0)
  const invoices=visibleSales.length
  const units=visibleItems.reduce((sum,i)=>sum+i.qty,0)
  const avg=invoices?revenue/invoices:0
  const collected=visibleSales.reduce((sum,s)=>sum+s.paid,0)
  const debt=visibleSales.reduce((sum,s)=>sum+s.debt,0)
  const customerCount=new Set(visibleSales.filter(s=>s.customer!=='Khách lẻ').map(s=>s.customer)).size

  const byWarehouse=[...(warehouses??[])].map((w:any)=>{
    const code=String(w.code)
    const rows=visibleSales.filter(s=>s.warehouse===code)
    const ids=new Set(rows.map(s=>s.id))
    const its=visibleItems.filter(i=>ids.has(i.sale_id))
    const rev=rows.reduce((sum,s)=>sum+s.total,0)
    return {
      code,address:String(w.address??w.name??''),
      invoices:rows.length,
      revenue:rev,
      units:its.reduce((sum,i)=>sum+i.qty,0),
      avg:rows.length?rev/rows.length:0,
      debt:rows.reduce((sum,s)=>sum+s.debt,0),
    }
  })

  const productMap=new Map<string,{sku:string,name:string,variant:string,qty:number,revenue:number}>()
  for(const i of visibleItems){
    const key=i.sku
    const cur=productMap.get(key)??{sku:i.sku,name:i.name,variant:i.variant,qty:0,revenue:0}
    cur.qty+=i.qty
    cur.revenue+=i.revenue
    productMap.set(key,cur)
  }
  const topProducts=[...productMap.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,8)

  const dayMap=new Map<string,number>()
  for(const s of visibleSales){
    const day=localDay(s.sale_at)
    dayMap.set(day,(dayMap.get(day)??0)+s.total)
  }
  const daily=[...dayMap.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([day,value])=>({day,value}))
  const maxDay=Math.max(...daily.map(x=>x.value),1)

  const paymentStats=[
    {key:'PAID',label:'Đã thanh toán',count:visibleSales.filter(s=>s.status==='PAID').length},
    {key:'PARTIAL',label:'Thanh toán một phần',count:visibleSales.filter(s=>s.status==='PARTIAL').length},
    {key:'UNPAID',label:'Chưa thanh toán',count:visibleSales.filter(s=>s.status==='UNPAID').length},
  ]
  const maxPayment=Math.max(...paymentStats.map(x=>x.count),1)

  const lowStock=((balances??[]) as any[])
    .filter((x:any)=>warehouseFilter==='ALL'||String(x.warehouse_code)===warehouseFilter)
    .filter((x:any)=>Number(x.quantity??0)<=10)
    .slice(0,6)

  function href(extra:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    p.set('range',range.key)
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    if(warehouseFilter!=='ALL')p.set('warehouse',warehouseFilter)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    return '/sales?'+p.toString()
  }

  return <div className="sales-dashboard-screen">
    <header className="page-head">
      <div>
        <span className="module-eyebrow">BÁN HÀNG</span>
        <h1>Tổng quan bán hàng</h1>
        <p>Doanh thu, hóa đơn POS, sản phẩm, tồn bán và công nợ theo HN / BG</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/sales/history">Lịch sử bán</Link>
        <Link className="button primary" href="/sales/pos">Mở POS</Link>
      </div>
    </header>

    <PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      basePath="/sales"
      showAll
      preserveParams={{warehouse:warehouseFilter==='ALL'?null:warehouseFilter}}
    />

    <div className="sales-dashboard-toolbar">
      <div className="sales-warehouse-filter">
        <span>Kho bán</span>
        <Link className={warehouseFilter==='ALL'?'active':''} href={href({warehouse:null})}>Tất cả</Link>
        {(warehouses??[]).map((w:any)=>
          <Link key={w.id} className={warehouseFilter===String(w.code)?'active':''} href={href({warehouse:String(w.code)})}>
            {w.code} · {w.address??w.name}
          </Link>
        )}
      </div>
      {!hasRealSales&&<span className="sales-demo-badge">DỮ LIỆU DEMO · Chưa có giao dịch POS thật</span>}
    </div>

    {salesError&&<div className="error-box">Không thể tải dữ liệu bán hàng: {salesError.message}</div>}

    <section className="sales-kpi-strip">
      <div className="sales-kpi"><span>Doanh thu</span><b className="money">{formatMoney(revenue)}</b><small>{invoices} hóa đơn</small></div>
      <div className="sales-kpi"><span>Số hóa đơn</span><b>{invoices}</b><small>{customerCount} khách có hồ sơ</small></div>
      <div className="sales-kpi"><span>Sản phẩm bán</span><b>{units}</b><small>{topProducts.length} SKU phát sinh</small></div>
      <div className="sales-kpi"><span>Giá trị TB/HĐ</span><b className="money">{formatMoney(avg)}</b><small>Trung bình mỗi hóa đơn</small></div>
      <div className="sales-kpi success"><span>Đã thu</span><b className="money">{formatMoney(collected)}</b><small>{revenue?Math.round(collected/revenue*100):0}% doanh thu</small></div>
      <div className="sales-kpi warning"><span>Công nợ</span><b className="money">{formatMoney(debt)}</b><small>{visibleSales.filter(s=>s.debt>0).length} hóa đơn còn nợ</small></div>
      <div className="sales-kpi danger"><span>Hoàn / huỷ</span><b>0</b><small>Sẽ lấy từ luồng POS hoàn/hủy</small></div>
    </section>

    <section className="sales-dashboard-grid sales-dashboard-grid-main">
      <div className="card sales-revenue-card">
        <div className="card-head">
          <div><h2>Doanh thu theo ngày</h2><span className="muted">8 ngày có phát sinh gần nhất trong khoảng đang xem</span></div>
          <b className="sales-card-total">{formatMoney(revenue)}</b>
        </div>
        <div className="sales-mini-chart">
          {!daily.length
            ? <div className="empty compact">Chưa có doanh thu.</div>
            : daily.map(x=><div className="sales-chart-col" key={x.day}>
                <div className="sales-chart-value">{formatMoney(x.value)}</div>
                <div className="sales-chart-track"><i style={{height:`${Math.max(8,x.value/maxDay*100)}%`}}/></div>
                <span>{x.day.slice(5).split('-').reverse().join('/')}</span>
              </div>)}
        </div>
      </div>

      <div className="card sales-attention-card">
        <div className="card-head"><div><h2>Cần chú ý</h2><span className="muted">Tồn thấp và công nợ cần xử lý</span></div></div>
        <div className="sales-attention-list">
          <Link href="/warehouse/inventory" className="sales-attention-summary warning">
            <div><b>{lowStock.length}</b><span>SKU tồn ≤ 10</span></div><small>Mở tồn kho →</small>
          </Link>
          <Link href="/sales/debt" className="sales-attention-summary danger">
            <div><b>{visibleSales.filter(s=>s.debt>0).length}</b><span>Hóa đơn còn nợ</span></div><small>{formatMoney(debt)}</small>
          </Link>
          {lowStock.slice(0,4).map((x:any)=><div className="sales-low-stock-row" key={String(x.warehouse_id)+String(x.product_variant_id)}>
            <div><b>{x.sku}</b><span>{x.product_name}{x.variant_name?' · '+x.variant_name:''}</span></div>
            <div><small>{x.warehouse_code}</small><b className={Number(x.quantity)<=0?'danger-text':'warning-text'}>{Number(x.quantity)} tồn</b></div>
          </div>)}
        </div>
      </div>
    </section>

    <section className="sales-dashboard-grid sales-dashboard-grid-analytics">
      <div className="card">
        <div className="card-head"><div><h2>Hiệu quả theo kho bán</h2><span className="muted">HN · 164 Hồng Mai và BG · 320 Nguyễn Công Hãng</span></div></div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table sales-summary-table">
            <thead><tr><th>Kho</th><th>Hóa đơn</th><th>SP bán</th><th>Doanh thu</th><th>TB/HĐ</th><th>Công nợ</th></tr></thead>
            <tbody>{byWarehouse.map(x=><tr key={x.code}>
              <td><b>{x.code}</b><small>{x.address}</small></td>
              <td>{x.invoices}</td><td>{x.units}</td>
              <td className="money">{formatMoney(x.revenue)}</td>
              <td className="money">{formatMoney(x.avg)}</td>
              <td className="money">{formatMoney(x.debt)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Thanh toán & công nợ</h2><span className="muted">Tình trạng thu tiền của hóa đơn</span></div></div>
        <div className="sales-payment-breakdown">
          {paymentStats.map(x=><div className="sales-payment-row" key={x.key}>
            <div><span>{x.label}</span><b>{x.count}</b></div>
            <div className="sales-payment-bar"><i style={{width:`${Math.max(x.count?8:0,x.count/maxPayment*100)}%`}}/></div>
          </div>)}
          <div className="sales-payment-money">
            <div><span>Đã thu</span><b>{formatMoney(collected)}</b></div>
            <div><span>Còn nợ</span><b className="warning-text">{formatMoney(debt)}</b></div>
          </div>
          <Link className="button small" href="/sales/debt">Mở công nợ</Link>
        </div>
      </div>
    </section>

    <section className="sales-dashboard-grid sales-dashboard-grid-bottom">
      <div className="card">
        <div className="card-head">
          <div><h2>Top sản phẩm bán</h2><span className="muted">Xếp theo số lượng bán</span></div>
          <Link className="button small" href="/warehouse/inventory">Xem tồn kho</Link>
        </div>
        <div className="compact-table-wrap">
          <table className="table compact-summary-table sales-summary-table">
            <thead><tr><th>SKU</th><th>Sản phẩm</th><th>SL bán</th><th>Doanh thu</th></tr></thead>
            <tbody>{!topProducts.length
              ? <tr><td colSpan={4} className="empty">Chưa có sản phẩm bán.</td></tr>
              : topProducts.map(x=><tr key={x.sku}>
                  <td className="strong">{x.sku}</td>
                  <td><b>{x.name}</b>{x.variant&&<small>{x.variant}</small>}</td>
                  <td>{x.qty}</td><td className="money">{formatMoney(x.revenue)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Giao dịch gần nhất</h2><span className="muted">Hóa đơn POS trong khoảng đang xem</span></div>
          <Link className="button small" href="/sales/history">Lịch sử bán</Link>
        </div>
        <div className="sales-recent-list">
          {visibleSales.slice(0,7).map(s=><div className="sales-recent-row" key={s.id}>
            <div><b>{s.code}</b><span>{s.customer} · {s.warehouse}</span></div>
            <div><b>{formatMoney(s.total)}</b><span>{formatDateTime(s.sale_at)}</span></div>
            <span className={'status-pill '+(s.status==='PAID'?'green':s.status==='PARTIAL'?'orange':'red')}>{statusLabel(s.status)}</span>
          </div>)}
        </div>
      </div>
    </section>

    <div className="sales-flow-strip">
      <Link href="/sales"><span>1</span><div><b>Tổng quan bán hàng</b><small>Hiệu quả · tồn · công nợ</small></div></Link>
      <i>→</i>
      <Link href="/sales/pos"><span>2</span><div><b>POS</b><small>Quét / chọn SP · thanh toán</small></div></Link>
      <i>→</i>
      <Link href="/sales/history"><span>3</span><div><b>Lịch sử bán</b><small>In lại · huỷ · hoàn hàng</small></div></Link>
      <i>→</i>
      <Link href="/sales/customers"><span>4</span><div><b>Khách hàng</b><small>Hồ sơ · lịch sử mua</small></div></Link>
      <i>→</i>
      <Link href="/sales/debt"><span>5</span><div><b>Công nợ</b><small>Thu tiền · theo dõi dư nợ</small></div></Link>
    </div>
  </div>
}
