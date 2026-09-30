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
  const ready=rows.filter(r=>
    !r.active_transfer_id &&
    (r.order_items??[]).length>0 &&
    (r.order_items??[]).every((i:any)=>Boolean(i.product_variant_id))
  ).length
  const withDraft=rows.filter(r=>r.active_transfer_id).length

  return <div className="warehouse-screen warehouse-receive-screen">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho · Bóc tách</h1>
        <p>Đơn đã nhận vật lý → map SKU mua sang SKU bán → tạo phiếu chuyển vào kho nội bộ.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
        <Link className="button primary" href="/warehouse/transfers">Phiếu chuyển kho</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/receive"/>

    {error&&<div className="error-box">Không thể tải dữ liệu nhập kho: {error.message}</div>}

    <section className="warehouse-status-strip">
      <div><span>Đã nhận · chờ xử lý</span><b>{rows.length}</b><small>Đơn RECEIVED / READY_TO_TRANSFER</small></div>
      <div className="warning"><span>Chờ bóc tách SKU</span><b>{needMapping}</b><small>SKU mua chưa liên kết SKU bán</small></div>
      <div className="success"><span>Sẵn sàng chuyển</span><b>{ready}</b><small>Đã map đủ sản phẩm</small></div>
      <div><span>Đã tạo phiếu</span><b>{withDraft}</b><small>Không chọn lại vào phiếu mới</small></div>
    </section>

    <div className="warehouse-rule-note">
      <b>Quy tắc SKU:</b>
      <span>SKU trong đơn nhập chỉ là SKU mua vào. Tại bước bóc tách, bạn chọn/tạo SKU bán riêng và nhập giá bán; hệ thống không tự đổi SKU mua thành SKU tồn kho.</span>
    </div>

    <WarehouseReceiveConsole
      rows={rows as any[]}
      variants={(variants??[]) as any[]}
      warehouses={(warehouses??[]) as any[]}
    />
  </div>
}
