import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'
import { formatMoney } from '@/lib/format'

async function count(q:PromiseLike<{count:number|null}>){
  try{return (await q).count??0}catch{return 0}
}

export default async function WarehousePage(){
  const {supabase}=await requireUser()

  const [
    waiting,
    warehouseReceived,
    {data:readyOrders,error:readyError},
    {data:transferRows,error:transferError},
    {data:balances,error:balanceError},
    {data:warehouses,error:warehouseError},
  ]=await Promise.all([
    count(supabase.from('orders').select('*',{count:'exact',head:true}).is('archived_at',null).eq('receive_status','WAITING_RECEIVE')),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).is('archived_at',null).eq('warehouse_status','WAREHOUSE_RECEIVED')),
    supabase.from('orders')
      .select('id,shopee_order_id,destination_hub,cod,order_date,warehouse_status,order_items(id,product_name,sku,quantity,product_variant_id)')
      .is('archived_at',null)
      .eq('receive_status','RECEIVED')
      .eq('warehouse_status','READY_TO_TRANSFER')
      .order('order_date',{ascending:false})
      .limit(300),
    supabase.from('transfer_batches')
      .select('id,status,from_warehouse_id,to_warehouse_id,created_at,transferred_at,received_at,note,from_warehouse:warehouses!transfer_batches_from_warehouse_id_fkey(code,name),to_warehouse:warehouses!transfer_batches_to_warehouse_id_fkey(code,name),transfer_items(id,order_id,quantity)')
      .order('created_at',{ascending:false})
      .limit(100),
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,warehouse_name,product_variant_id,sku,product_name,variant_name,quantity')
      .order('warehouse_code')
      .limit(2000),
    supabase.from('warehouses').select('id,code,name,is_active').eq('is_active',true).order('code').limit(100),
  ])

  const error=readyError??transferError??balanceError??warehouseError
  const ready=(readyOrders??[]) as any[]
  const needMapping=ready.filter(o=>(o.order_items??[]).some((i:any)=>!i.product_variant_id))
  const mappedReady=ready.filter(o=>(o.order_items??[]).length>0&&(o.order_items??[]).every((i:any)=>i.product_variant_id))
  const transfers=(transferRows??[]) as any[]
  const draft=transfers.filter(t=>t.status==='DRAFT')
  const inTransit=transfers.filter(t=>t.status==='IN_TRANSIT')
  const stock=(balances??[]) as any[]
  const totalUnits=stock.reduce((sum,x)=>sum+Number(x.quantity??0),0)
  const skuCount=new Set(stock.filter(x=>Number(x.quantity??0)!==0).map(x=>String(x.product_variant_id))).size

  const stockByWarehouse=new Map<string,{code:string,name:string,units:number,skus:Set<string>}>()
  for(const row of stock){
    const id=String(row.warehouse_id??'unknown')
    const cur=stockByWarehouse.get(id)??{
      code:String(row.warehouse_code??'—'),
      name:String(row.warehouse_name??'Kho'),
      units:0,
      skus:new Set<string>(),
    }
    cur.units+=Number(row.quantity??0)
    if(Number(row.quantity??0)!==0)cur.skus.add(String(row.product_variant_id))
    stockByWarehouse.set(id,cur)
  }

  const queue=[
    ...needMapping.slice(0,4).map((o:any)=>({
      key:'map-'+o.id,
      level:'warning',
      title:o.shopee_order_id??o.id.slice(0,8),
      detail:'Chờ bóc tách SKU bán · '+(o.order_items??[]).filter((i:any)=>!i.product_variant_id).length+' dòng',
      href:'/warehouse/receive',
    })),
    ...draft.slice(0,3).map((t:any)=>({
      key:'draft-'+t.id,
      level:'info',
      title:'Phiếu '+String(t.id).slice(0,8),
      detail:'Nháp · '+(t.to_warehouse?.code??'Kho đích')+' · '+(t.transfer_items??[]).length+' dòng',
      href:'/warehouse/transfers?transfer='+t.id,
    })),
    ...inTransit.slice(0,3).map((t:any)=>({
      key:'transit-'+t.id,
      level:'warning',
      title:'Đang chuyển '+String(t.id).slice(0,8),
      detail:(t.from_warehouse?.code??'Khu nhận')+' → '+(t.to_warehouse?.code??'Kho đích'),
      href:'/warehouse/transfers?transfer='+t.id,
    })),
  ].slice(0,8)

  return <div className="warehouse-screen warehouse-dashboard">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tổng quan kho</h1>
        <p>Nhận hàng, bóc tách SKU, chuyển kho và kiểm soát tồn trên một luồng vận hành.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Xử lý chờ nhận</Link>
        <Link className="button primary" href="/warehouse/receive">Nhập kho</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse"/>

    {error&&<div className="error-box">Không thể tải dữ liệu kho: {error.message}</div>}

    <section className="warehouse-status-strip warehouse-status-strip-7">
      <Link href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE" className="warning">
        <span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đã giao thành công</small>
      </Link>
      <Link href="/warehouse/receive" className="warning">
        <span>Chờ bóc tách</span><b>{needMapping.length}</b><small>Chưa map SKU bán</small>
      </Link>
      <Link href="/warehouse/receive" className="success">
        <span>Sẵn sàng chuyển</span><b>{mappedReady.length}</b><small>Map đủ sản phẩm</small>
      </Link>
      <Link href="/warehouse/transfers">
        <span>Phiếu nháp</span><b>{draft.length}</b><small>Chờ xuất chuyển</small>
      </Link>
      <Link href="/warehouse/transfers" className="info">
        <span>Đang chuyển</span><b>{inTransit.length}</b><small>Chờ kho đích nhận</small>
      </Link>
      <Link href="/warehouse/inventory" className="success">
        <span>Đã nhập kho</span><b>{warehouseReceived}</b><small>Đơn hoàn tất luồng kho</small>
      </Link>
      <Link href="/warehouse/inventory">
        <span>Tồn hiện tại</span><b>{totalUnits}</b><small>{skuCount} SKU bán</small>
      </Link>
    </section>

    <section className="warehouse-dashboard-grid">
      <div className="card warehouse-command-board">
        <div className="card-head">
          <div><h2>Cần xử lý</h2><span className="muted">Ưu tiên theo bước đang chặn luồng kho</span></div>
          <Link className="button small" href="/warehouse/receive">Mở console nhập kho</Link>
        </div>
        <div className="warehouse-queue">
          {!queue.length
            ? <div className="empty compact">Không có việc kho cần xử lý ngay.</div>
            : queue.map(item=><Link href={item.href} key={item.key} className={'warehouse-queue-row '+item.level}>
                <span className="warehouse-queue-dot"/>
                <div><b>{item.title}</b><small>{item.detail}</small></div>
                <span>→</span>
              </Link>)}
        </div>
      </div>

      <div className="card warehouse-stock-board">
        <div className="card-head">
          <div><h2>Tồn theo kho</h2><span className="muted">{warehouses?.length??0} kho hoạt động</span></div>
          <Link className="button small" href="/warehouse/inventory">Xem tồn kho</Link>
        </div>
        <div className="warehouse-stock-summary">
          {[...stockByWarehouse.values()].map(w=><div key={w.code}>
            <div><b>{w.code}</b><span>{w.name}</span></div>
            <div><b>{w.units}</b><span>đơn vị</span></div>
            <div><b>{w.skus.size}</b><span>SKU</span></div>
          </div>)}
          {!stockByWarehouse.size&&<div className="empty compact">Chưa có tồn kho.</div>}
        </div>
      </div>
    </section>

    <section className="card warehouse-flow-board">
      <div className="card-head"><div><h2>Luồng vận hành kho</h2><span className="muted">Trạng thái chuyển tiếp dữ liệu</span></div></div>
      <div className="warehouse-flow-line">
        <div><b>1</b><span>Giao thành công</span><small>Chờ xác nhận nhận</small></div>
        <i>→</i>
        <div><b>2</b><span>Đã nhận</span><small>Bóc tách SKU mua → SKU bán</small></div>
        <i>→</i>
        <div><b>3</b><span>Tạo phiếu</span><small>Chọn kho đích</small></div>
        <i>→</i>
        <div><b>4</b><span>Đang chuyển</span><small>Chờ kho xác nhận</small></div>
        <i>→</i>
        <div><b>5</b><span>Nhập tồn</span><small>Ghi Inventory Ledger</small></div>
      </div>
    </section>
  </div>
}
