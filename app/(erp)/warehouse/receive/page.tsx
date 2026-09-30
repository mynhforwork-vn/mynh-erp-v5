import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseIntakeWorkspace } from '@/components/warehouse-intake-workspace'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'

export default async function WarehouseReceivePage(){
  const {supabase}=await requireUser()

  const [
    {data:orders,error:ordersError},
    {data:variants,error:variantsError},
    {data:warehouses,error:warehousesError},
    {data:auditLogs,error:auditError},
    {data:settings,error:settingsError},
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,cod,order_date,warehouse_status,receive_batch_details(receive_batches(received_at)),order_items(id,sku,product_name,variant,quantity,original_price,final_price,product_variant_id,inventory_multiplier,product_variants(id,variant_name,sale_price,products(id,sku,name)))')
      .is('archived_at',null)
      .eq('receive_status','RECEIVED')
      .eq('warehouse_status','READY_TO_TRANSFER')
      .order('order_date',{ascending:false})
      .limit(300),
    supabase.from('product_variants')
      .select('id,variant_name,sale_price,products(id,sku,name)')
      .order('updated_at',{ascending:false})
      .limit(1500),
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active',true)
      .order('code')
      .limit(100),
    supabase.from('audit_logs')
      .select('id,entity_id,action,created_at,new_value')
      .eq('module','WAREHOUSE')
      .eq('entity_type','ORDER')
      .order('created_at',{ascending:false})
      .limit(500),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id')
      .eq('id','main')
      .single(),
  ])

  const error=ordersError??variantsError??warehousesError??auditError??settingsError
  const rows=(orders??[]) as any[]
  const missingOrders=rows.filter(row=>(row.order_items??[]).some((item:any)=>!item.product_variant_id))
  const missingItems=rows.reduce(
    (sum,row)=>sum+(row.order_items??[]).filter((item:any)=>!item.product_variant_id).length,
    0
  )
  const mappedItems=rows.reduce(
    (sum,row)=>sum+(row.order_items??[]).filter((item:any)=>Boolean(item.product_variant_id)).length,
    0
  )
  const ready=rows.filter(row=>
    (row.order_items??[]).length>0&&
    (row.order_items??[]).every((item:any)=>Boolean(item.product_variant_id))
  )

  return <div className="whx-page">
    <header className="page-head whx-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Bóc tách nhập kho</h1>
        <p>Đơn đã xác nhận nhận hàng → mapping SKU bán → quy đổi số lượng → nhập trực tiếp vào Kho nhận.</p>
      </div>
      <div className="head-actions">
        <WarehouseReceivingSettings
          warehouses={(warehouses??[]) as any[]}
          defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
        />
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ xác nhận nhận</Link>
      </div>
    </header>

    {error&&<div className="error-box">Không thể tải dữ liệu bóc tách: {error.message}</div>}

    <section className="whx-kpi-grid five">
      <div className={rows.length?'warning':''}><span>Chờ bóc tách</span><b>{rows.length}</b><small>Đã nhận, chưa nhập tồn</small></div>
      <div className={missingOrders.length?'warning':''}><span>Thiếu mapping</span><b>{missingOrders.length}</b><small>Đơn còn SKU chưa liên kết</small></div>
      <div className={missingItems?'warning':''}><span>SKU chưa map</span><b>{missingItems}</b><small>Dòng sản phẩm cần xử lý</small></div>
      <div className="info"><span>Đã mapping</span><b>{mappedItems}</b><small>Dòng sản phẩm đã xác định SKU bán</small></div>
      <div className="success"><span>Sẵn sàng nhập kho</span><b>{ready.length}</b><small>Có thể ghi tăng tồn Kho nhận</small></div>
    </section>

    <div className="whx-rule-note">
      <span>↔</span>
      <div>
        <b>SKU mua không phải SKU tồn kho.</b>
        <small>Mỗi dòng sản phẩm có thể mapping sang SKU bán khác và đặt hệ số quy đổi riêng. Ví dụ: 1 combo mua = 5 đơn vị tồn.</small>
      </div>
    </div>

    <WarehouseIntakeWorkspace
      rows={rows}
      variants={(variants??[]) as any[]}
      warehouses={(warehouses??[]) as any[]}
      auditLogs={(auditLogs??[]) as any[]}
      defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
    />
  </div>
}
