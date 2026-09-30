import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'

export default async function WarehousePage(){
  const {supabase}=await requireUser()

  const [
    {data:readyOrders,error:readyError},
    {data:balances,error:balanceError},
    {data:warehouses,error:warehouseError},
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,cod,order_date,warehouse_status,order_items(id,product_name,sku,quantity,product_variant_id)')
      .is('archived_at',null)
      .eq('receive_status','RECEIVED')
      .eq('warehouse_status','READY_TO_TRANSFER')
      .order('order_date',{ascending:false})
      .limit(300),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,warehouse_name,product_variant_id,sku,product_name,variant_name,quantity')
      .order('warehouse_code')
      .order('sku')
      .limit(3000),
    supabase.from('warehouses').select('id,code,name,is_active').eq('is_active',true).order('code').limit(100),
  ])

  const error=readyError??balanceError??warehouseError
  const ready=(readyOrders??[]) as any[]
  const stock=(balances??[]) as any[]

  const waitingBreakdown=ready.length
  const missingMappingItems=ready.reduce(
    (sum,o)=>sum+(o.order_items??[]).filter((i:any)=>!i.product_variant_id).length,
    0
  )
  const readyToStock=ready.filter(o=>
    (o.order_items??[]).length>0 &&
    (o.order_items??[]).every((i:any)=>Boolean(i.product_variant_id))
  )

  const totalUnits=stock.reduce((sum,x)=>sum+Number(x.quantity??0),0)
  const skuCount=new Set(stock.map(x=>String(x.product_variant_id))).size
  const lowStock=stock.filter(x=>Number(x.quantity??0)>0&&Number(x.quantity??0)<=3)
  const outStock=stock.filter(x=>Number(x.quantity??0)===0)
  const normalStock=stock.filter(x=>Number(x.quantity??0)>3)

  const queue=[
    ...ready
      .filter(o=>(o.order_items??[]).some((i:any)=>!i.product_variant_id))
      .slice(0,5)
      .map(o=>({
        key:'map-'+o.id,
        tone:'warning',
        title:o.shopee_order_id??String(o.id).slice(0,8),
        detail:(o.order_items??[]).filter((i:any)=>!i.product_variant_id).length+' SKU chưa mapping',
        meta:'Bóc tách nhập kho',
        href:'/warehouse/receive',
      })),
    ...readyToStock.slice(0,4).map(o=>({
      key:'ready-'+o.id,
      tone:'success',
      title:o.shopee_order_id??String(o.id).slice(0,8),
      detail:(o.order_items??[]).length+' dòng sản phẩm đã mapping',
      meta:'Sẵn sàng nhập Kho nhận',
      href:'/warehouse/receive',
    })),
    ...lowStock.slice(0,4).map(s=>({
      key:'stock-'+s.warehouse_id+'-'+s.product_variant_id,
      tone:'danger',
      title:s.sku??'SKU',
      detail:(s.product_name??'Sản phẩm')+' · tồn '+Number(s.quantity??0),
      meta:'Tồn thấp',
      href:'/warehouse/inventory?q='+encodeURIComponent(String(s.sku??'')),
    })),
  ].slice(0,10)

  const totalState=Math.max(stock.length,1)
  const normalPct=Math.round(normalStock.length/totalState*100)
  const lowPct=Math.round(lowStock.length/totalState*100)
  const outPct=Math.max(0,100-normalPct-lowPct)

  return <div className="warehouse-screen warehouse-dashboard warehouse-v2">
    <header className="page-head warehouse-page-head warehouse-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tổng quan kho</h1>
        <p>Theo dõi hàng đã nhận, bóc tách nhập Kho nhận và tình trạng tồn kho trên một màn hình.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/warehouse/history">Xem lịch sử kho</Link>
        <Link className="button primary" href="/warehouse/receive">Bóc tách nhập kho</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse"/>

    {error&&<div className="error-box">Không thể tải dữ liệu kho: {error.message}</div>}

    <section className="warehouse-status-strip warehouse-status-strip-7 warehouse-kpi-row">
      <Link href="/warehouse/receive" className={waitingBreakdown?'warning':''}>
        <span>Chờ bóc tách</span><b>{waitingBreakdown}</b><small>Đã nhận nhưng chưa nhập tồn</small>
      </Link>
      <Link href="/warehouse/receive" className={missingMappingItems?'warning':''}>
        <span>Thiếu mapping</span><b>{missingMappingItems}</b><small>Dòng sản phẩm chưa có SKU bán</small>
      </Link>
      <Link href="/warehouse/receive" className="info">
        <span>Chờ nhập kho</span><b>{readyToStock.length}</b><small>Đã mapping đầy đủ</small>
      </Link>
      <Link href="/warehouse/inventory">
        <span>Tổng SKU</span><b>{skuCount}</b><small>SKU bán đang quản lý</small>
      </Link>
      <Link href="/warehouse/inventory" className="success">
        <span>Tổng tồn</span><b>{totalUnits}</b><small>Đơn vị hàng hiện có</small>
      </Link>
      <Link href="/warehouse/inventory" className={lowStock.length?'warning':''}>
        <span>Tồn thấp</span><b>{lowStock.length}</b><small>SKU tồn từ 1 đến 3</small>
      </Link>
      <Link href="/warehouse/inventory" className={outStock.length?'danger':''}>
        <span>Hết hàng</span><b>{outStock.length}</b><small>SKU có tồn bằng 0</small>
      </Link>
    </section>

    <section className="warehouse-overview-grid">
      <div className="card warehouse-task-board">
        <div className="card-head warehouse-card-head-v2">
          <div>
            <span className="warehouse-card-eyebrow">ƯU TIÊN VẬN HÀNH</span>
            <h2>Cần xử lý</h2>
          </div>
          <Link className="warehouse-inline-link" href="/warehouse/receive">Xem tất cả →</Link>
        </div>

        <div className="warehouse-task-table">
          <div className="warehouse-task-table-head">
            <span>Mã / SKU</span><span>Chi tiết</span><span>Nhóm xử lý</span><span>Trạng thái</span>
          </div>
          {!queue.length
            ? <div className="empty compact">Hiện không có việc kho cần xử lý ngay.</div>
            : queue.map(item=><Link href={item.href} key={item.key} className="warehouse-task-row">
                <b>{item.title}</b>
                <span>{item.detail}</span>
                <span>{item.meta}</span>
                <i className={'warehouse-task-state '+item.tone}>
                  {item.tone==='warning'?'Cần xử lý':item.tone==='danger'?'Cần chú ý':'Sẵn sàng'}
                </i>
              </Link>)}
        </div>
      </div>

      <div className="warehouse-overview-side">
        <div className="card warehouse-stock-health">
          <div className="card-head warehouse-card-head-v2">
            <div>
              <span className="warehouse-card-eyebrow">SỨC KHỎE TỒN KHO</span>
              <h2>Tình trạng tồn</h2>
            </div>
            <span className="warehouse-mini-badge">{warehouses?.length??0} kho</span>
          </div>

          <div className="warehouse-stock-health-total">
            <b>{skuCount}</b>
            <span>SKU bán</span>
          </div>

          <div className="warehouse-stock-bars">
            <div>
              <div><span><i className="dot success"/>Bình thường</span><b>{normalStock.length}</b></div>
              <em><i className="success" style={{width:normalPct+'%'}}/></em>
            </div>
            <div>
              <div><span><i className="dot warning"/>Tồn thấp</span><b>{lowStock.length}</b></div>
              <em><i className="warning" style={{width:lowPct+'%'}}/></em>
            </div>
            <div>
              <div><span><i className="dot danger"/>Hết hàng</span><b>{outStock.length}</b></div>
              <em><i className="danger" style={{width:outPct+'%'}}/></em>
            </div>
          </div>
        </div>

        <div className="card warehouse-low-stock-card">
          <div className="card-head warehouse-card-head-v2">
            <div>
              <span className="warehouse-card-eyebrow">CẦN CHÚ Ý</span>
              <h2>SKU tồn thấp</h2>
            </div>
            <Link className="warehouse-inline-link" href="/warehouse/inventory">Xem tồn kho →</Link>
          </div>
          <div className="warehouse-low-stock-list">
            {lowStock.slice(0,6).map(row=><Link
              href={'/warehouse/inventory?q='+encodeURIComponent(String(row.sku??''))}
              key={String(row.warehouse_id)+'-'+String(row.product_variant_id)}
            >
              <div><b>{row.sku??'—'}</b><span>{row.product_name??'—'} · {row.variant_name??'Mặc định'}</span></div>
              <strong>{row.quantity}</strong>
            </Link>)}
            {!lowStock.length&&<div className="empty compact">Không có SKU tồn thấp.</div>}
          </div>
        </div>
      </div>
    </section>

    <section className="warehouse-flow-v2">
      <div><span>01</span><b>Đã nhận hàng</b><small>Từ Cảnh báo vận chuyển</small></div>
      <i>→</i>
      <div><span>02</span><b>Bóc tách SKU</b><small>SKU mua → SKU bán</small></div>
      <i>→</i>
      <div><span>03</span><b>Nhập Kho nhận</b><small>Ghi tăng tồn kho</small></div>
      <i>→</i>
      <div><span>04</span><b>Tồn kho & bán</b><small>Bán hàng trừ tồn tại kho</small></div>
    </section>
  </div>
}
