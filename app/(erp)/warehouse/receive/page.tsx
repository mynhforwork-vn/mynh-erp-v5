import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'
import { WarehouseReceiveConsole } from '@/components/warehouse-receive-console'

export default async function WarehouseReceivePage(){
  const {supabase}=await requireUser()

  const [
    {data:orders,error:ordersError},
    {data:variants,error:variantsError},
    {data:warehouses,error:warehousesError},
    {data:transferLinks,error:transferError},
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,destination_hub,cod,warehouse_status,order_date,order_items(id,sku,product_name,variant,quantity,original_price,final_price,product_variant_id,product_variants(id,variant_name,sale_price,products(id,sku,name)))')
      .is('archived_at',null)
      .eq('receive_status','RECEIVED')
      .eq('warehouse_status','READY_TO_TRANSFER')
      .order('order_date',{ascending:false})
      .limit(300),
    supabase.from('product_variants')
      .select('id,variant_name,sale_price,products(id,sku,name)')
      .order('updated_at',{ascending:false})
      .limit(500),
    supabase.from('warehouses')
      .select('id,code,name')
      .eq('is_active',true)
      .order('code')
      .limit(100),
    supabase.from('transfer_items')
      .select('order_id,transfer_batch_id,transfer_batches(status)')
      .not('order_id','is',null)
      .limit(2000),
  ])

  const error=ordersError??variantsError??warehousesError??transferError
  const activeTransferMap=new Map<string,{id:string,status:string}>()
  for(const row of (transferLinks??[]) as any[]){
    const status=String(row.transfer_batches?.status??'')
    if(status&&status!=='CANCELLED'&&row.order_id){
      activeTransferMap.set(String(row.order_id),{id:String(row.transfer_batch_id),status})
    }
  }

  const rows=((orders??[]) as any[]).map(row=>({
    ...row,
    active_transfer_id:activeTransferMap.get(String(row.id))?.id??null,
    active_transfer_status:activeTransferMap.get(String(row.id))?.status??null,
  }))
  const needMapping=rows.filter(r=>(r.order_items??[]).some((i:any)=>!i.product_variant_id)).length
  const missingItems=rows.reduce((sum,r)=>sum+(r.order_items??[]).filter((i:any)=>!i.product_variant_id).length,0)
  const mappedItems=rows.reduce((sum,r)=>sum+(r.order_items??[]).filter((i:any)=>Boolean(i.product_variant_id)).length,0)
  const ready=rows.filter(r=>
    !r.active_transfer_id &&
    (r.order_items??[]).length>0 &&
    (r.order_items??[]).every((i:any)=>Boolean(i.product_variant_id))
  ).length

  return <div className="warehouse-screen warehouse-receive-screen warehouse-v2">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Bóc tách nhập kho</h1>
        <p>Đơn đã xác nhận nhận hàng → bóc tách SKU mua sang SKU bán → nhập trực tiếp vào Kho nhận.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ xác nhận nhận</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/receive"/>

    {error&&<div className="error-box">Không thể tải dữ liệu nhập kho: {error.message}</div>}

    <section className="warehouse-status-strip warehouse-status-strip-5 warehouse-kpi-row">
      <div><span>Chờ bóc tách</span><b>{rows.length}</b><small>Đơn đã nhận chưa nhập tồn</small></div>
      <div className={needMapping?'warning':''}><span>Thiếu mapping</span><b>{needMapping}</b><small>Đơn còn SKU chưa liên kết</small></div>
      <div className={missingItems?'warning':''}><span>SKU chưa map</span><b>{missingItems}</b><small>Dòng sản phẩm cần xử lý</small></div>
      <div className="info"><span>Đã mapping</span><b>{mappedItems}</b><small>Dòng sản phẩm đã xác định SKU bán</small></div>
      <div className="success"><span>Sẵn sàng nhập kho</span><b>{ready}</b><small>Có thể ghi tăng tồn Kho nhận</small></div>
    </section>

    <div className="warehouse-rule-note warehouse-rule-note-v2">
      <div className="warehouse-rule-icon">↔</div>
      <div>
        <b>SKU mua và SKU bán là hai khái niệm riêng.</b>
        <span>Chỉ khi tất cả sản phẩm của đơn đã được mapping thì nút “Xác nhận nhập kho” mới sử dụng được. Sau xác nhận, tồn tăng trực tiếp tại Kho nhận; không bắt buộc qua Chuyển kho.</span>
      </div>
    </div>

    <WarehouseReceiveConsole
      rows={rows as any[]}
      variants={(variants??[]) as any[]}
      warehouses={(warehouses??[]) as any[]}
    />
  </div>
}
