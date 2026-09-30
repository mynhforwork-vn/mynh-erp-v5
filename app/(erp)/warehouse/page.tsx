import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseTabs } from '@/components/warehouse-tabs'

export default async function WarehousePage(){
  const {supabase}=await requireUser()

  const [
    {data:orders,error:ordersError},
    {data:balances,error:balanceError},
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,cod,order_date,order_items(id,product_name,product_variant_id,quantity,inventory_multiplier)')
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
  ])

  const error=ordersError??balanceError
  const waiting=(orders??[]) as any[]
  const stock=(balances??[]) as any[]

  const missingOrders=waiting.filter(order=>(order.order_items??[]).some((item:any)=>!item.product_variant_id))
  const missingItems=waiting.reduce(
    (sum,order)=>sum+(order.order_items??[]).filter((item:any)=>!item.product_variant_id).length,
    0
  )
  const readyOrders=waiting.filter(order=>
    (order.order_items??[]).length>0&&
    (order.order_items??[]).every((item:any)=>Boolean(item.product_variant_id))
  )

  const skuCount=new Set(stock.map(row=>String(row.product_variant_id))).size
  const totalUnits=stock.reduce((sum,row)=>sum+Number(row.quantity??0),0)
  const normal=stock.filter(row=>Number(row.quantity??0)>3)
  const low=stock.filter(row=>Number(row.quantity??0)>0&&Number(row.quantity??0)<=3)
  const out=stock.filter(row=>Number(row.quantity??0)===0)

  const queue=[
    ...missingOrders.slice(0,5).map(order=>({
      key:'order-'+order.id,
      title:order.shopee_order_id??String(order.id).slice(0,8),
      detail:(order.order_items??[]).filter((item:any)=>!item.product_variant_id).length+' SKU chưa mapping',
      group:'Bóc tách nhập kho',
      tone:'warning',
      href:'/warehouse/receive',
    })),
    ...readyOrders.slice(0,4).map(order=>({
      key:'ready-'+order.id,
      title:order.shopee_order_id??String(order.id).slice(0,8),
      detail:(order.order_items??[]).length+' dòng sản phẩm đã mapping',
      group:'Chờ nhập Kho nhận',
      tone:'success',
      href:'/warehouse/receive',
    })),
    ...low.slice(0,4).map(row=>({
      key:'low-'+row.warehouse_id+'-'+row.product_variant_id,
      title:row.sku??'SKU',
      detail:(row.product_name??'Sản phẩm')+' · còn '+Number(row.quantity??0),
      group:'Tồn thấp',
      tone:'danger',
      href:'/warehouse/inventory?q='+encodeURIComponent(String(row.sku??'')),
    })),
  ].slice(0,10)

  const stockTotal=Math.max(stock.length,1)
  const normalPct=Math.round(normal.length/stockTotal*100)
  const lowPct=Math.round(low.length/stockTotal*100)
  const outPct=Math.round(out.length/stockTotal*100)

  return <div className="whx-page">
    <header className="page-head whx-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tổng quan kho</h1>
        <p>Hàng đã nhận → bóc tách SKU → nhập Kho nhận → tồn kho → bán hàng.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/warehouse/history">Lịch sử kho</Link>
        <Link className="button primary" href="/warehouse/receive">Bóc tách nhập kho</Link>
      </div>
    </header>

    <WarehouseTabs active="/warehouse"/>

    {error&&<div className="error-box">Không thể tải dữ liệu kho: {error.message}</div>}

    <section className="whx-kpi-grid seven">
      <Link href="/warehouse/receive" className={waiting.length?'warning':''}>
        <span>Chờ bóc tách</span><b>{waiting.length}</b><small>Đã nhận, chưa nhập tồn</small>
      </Link>
      <Link href="/warehouse/receive" className={missingItems?'warning':''}>
        <span>Thiếu mapping</span><b>{missingItems}</b><small>Dòng SP chưa có SKU bán</small>
      </Link>
      <Link href="/warehouse/receive" className="info">
        <span>Chờ nhập kho</span><b>{readyOrders.length}</b><small>Đã mapping đầy đủ</small>
      </Link>
      <Link href="/warehouse/inventory">
        <span>Tổng SKU</span><b>{skuCount}</b><small>SKU bán đang quản lý</small>
      </Link>
      <Link href="/warehouse/inventory" className="success">
        <span>Tổng tồn</span><b>{totalUnits}</b><small>Đơn vị hàng hiện có</small>
      </Link>
      <Link href="/warehouse/inventory?status=low" className={low.length?'warning':''}>
        <span>Tồn thấp</span><b>{low.length}</b><small>SKU từ 1 đến 3</small>
      </Link>
      <Link href="/warehouse/inventory?status=out" className={out.length?'danger':''}>
        <span>Hết hàng</span><b>{out.length}</b><small>SKU tồn bằng 0</small>
      </Link>
    </section>

    <section className="whx-overview-grid">
      <div className="whx-surface">
        <div className="whx-surface-head">
          <div><span>ƯU TIÊN VẬN HÀNH</span><h2>Cần xử lý</h2></div>
          <Link href="/warehouse/receive">Mở danh sách →</Link>
        </div>

        <div className="whx-work-head">
          <span>Mã / SKU</span><span>Chi tiết</span><span>Nhóm xử lý</span><span>Trạng thái</span>
        </div>
        {!queue.length
          ? <div className="empty compact">Hiện không có việc kho cần xử lý ngay.</div>
          : queue.map(item=><Link className="whx-work-row" href={item.href} key={item.key}>
              <b>{item.title}</b>
              <span>{item.detail}</span>
              <span>{item.group}</span>
              <i className={item.tone}>{item.tone==='success'?'Sẵn sàng':item.tone==='danger'?'Cần chú ý':'Cần xử lý'}</i>
            </Link>)}
      </div>

      <div className="whx-side-stack">
        <div className="whx-surface">
          <div className="whx-surface-head">
            <div><span>SỨC KHỎE TỒN KHO</span><h2>Tình trạng tồn</h2></div>
          </div>

          <div className="whx-stock-summary">
            <div><b>{skuCount}</b><span>SKU bán</span></div>
            <div><b>{totalUnits}</b><span>đơn vị tồn</span></div>
          </div>

          <div className="whx-stock-bars">
            <div>
              <div><span>Bình thường</span><b>{normal.length}</b></div>
              <em><i className="success" style={{width:normalPct+'%'}}/></em>
            </div>
            <div>
              <div><span>Tồn thấp</span><b>{low.length}</b></div>
              <em><i className="warning" style={{width:lowPct+'%'}}/></em>
            </div>
            <div>
              <div><span>Hết hàng</span><b>{out.length}</b></div>
              <em><i className="danger" style={{width:outPct+'%'}}/></em>
            </div>
          </div>
        </div>

        <div className="whx-surface">
          <div className="whx-surface-head">
            <div><span>CẦN CHÚ Ý</span><h2>SKU tồn thấp</h2></div>
            <Link href="/warehouse/inventory?status=low">Xem tồn →</Link>
          </div>
          <div className="whx-low-list">
            {!low.length
              ? <div className="empty compact">Không có SKU tồn thấp.</div>
              : low.slice(0,6).map(row=><Link
                  key={String(row.warehouse_id)+'-'+String(row.product_variant_id)}
                  href={'/warehouse/inventory?q='+encodeURIComponent(String(row.sku??''))}
                >
                  <div><b>{row.sku??'—'}</b><span>{row.product_name??'—'} · {row.variant_name??'Mặc định'}</span></div>
                  <strong>{row.quantity}</strong>
                </Link>)}
          </div>
        </div>
      </div>
    </section>

    <section className="whx-flow">
      <div><span>01</span><b>Đã nhận hàng</b><small>Hàng đã về tay bạn</small></div>
      <i>→</i>
      <div><span>02</span><b>Bóc tách SKU</b><small>SKU mua → SKU bán</small></div>
      <i>→</i>
      <div><span>03</span><b>Nhập Kho nhận</b><small>Ghi tăng tồn</small></div>
      <i>→</i>
      <div><span>04</span><b>Tồn kho & bán</b><small>Bán hàng trừ tồn</small></div>
    </section>
  </div>
}
