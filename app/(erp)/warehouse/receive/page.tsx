import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatMoney } from '@/lib/format'
import { WarehouseIntakeWorkspace } from '@/components/warehouse-intake-workspace'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'

function suggestionKey(item:any){
  return [
    String(item.sku??'').trim().toUpperCase(),
    String(item.product_name??'').trim().toLowerCase(),
    String(item.variant??'').trim().toLowerCase(),
  ].join('|')
}

function receiveBatchOf(row:any){
  const detail=Array.isArray(row.receive_batch_details)
    ? row.receive_batch_details[0]
    : row.receive_batch_details
  const batch=detail?.receive_batches
  return Array.isArray(batch)?batch[0]??null:batch??null
}

export default async function WarehouseReceivePage(){
  const {supabase}=await requireUser()

  const [
    {data:orders,error:ordersError},
    {data:variants,error:variantsError},
    {data:warehouses,error:warehousesError},
    {data:auditLogs,error:auditError},
    {data:settings,error:settingsError},
    {data:recentMappings,error:mappingError},
  ]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,cod,order_date,warehouse_status,receive_batch_details(id,receive_batch_id,receive_batches(id,warehouse_id,received_at,warehouses(id,code,name,address))),order_items(id,sku,product_name,variant,quantity,original_price,final_price,product_variant_id,inventory_multiplier,product_variants(id,variant_name,sale_price,products(id,sku,name)))')
      .is('archived_at',null)
      .eq('receive_status','RECEIVED')
      .eq('warehouse_status','READY_TO_TRANSFER')
      .order('order_date',{ascending:false})
      .limit(500),
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
      .limit(800),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id')
      .eq('id','main')
      .single(),
    supabase.from('order_items')
      .select('id,sku,product_name,variant,product_variant_id,inventory_multiplier,created_at,product_variants(id,variant_name,sale_price,products(id,sku,name))')
      .not('product_variant_id','is',null)
      .order('created_at',{ascending:false})
      .limit(3000),
  ])

  const error=ordersError??variantsError??warehousesError??auditError??settingsError??mappingError
  const rows=(orders??[]) as any[]

  const incompleteRows=rows.filter(row=>
    !(row.order_items??[]).length||
    (row.order_items??[]).some((item:any)=>!item.product_variant_id)
  )
  const readyRows=rows.filter(row=>
    (row.order_items??[]).length>0&&
    (row.order_items??[]).every((item:any)=>Boolean(item.product_variant_id))
  )
  const missingItems=incompleteRows.reduce(
    (sum,row)=>sum+(row.order_items??[]).filter((item:any)=>!item.product_variant_id).length,
    0
  )

  const latestSuggestionByKey=new Map<string,any>()
  for(const row of (recentMappings??[]) as any[]){
    const key=suggestionKey(row)
    if(!latestSuggestionByKey.has(key)){
      latestSuggestionByKey.set(key,row)
    }
  }

  const suggestions:Record<string,any>={}
  for(const order of rows){
    for(const item of (order.order_items??[]) as any[]){
      if(item.product_variant_id)continue
      const matched=latestSuggestionByKey.get(suggestionKey(item))
      if(!matched?.product_variant_id||!matched?.product_variants)continue
      suggestions[item.id]={
        variant_id:matched.product_variant_id,
        sku:matched.product_variants?.products?.sku??null,
        product_name:matched.product_variants?.products?.name??null,
        variant_name:matched.product_variants?.variant_name??null,
        multiplier:Number(matched.inventory_multiplier??1),
      }
    }
  }

  const receivingWarehouseIds=new Set(
    rows
      .map(row=>receiveBatchOf(row)?.warehouse_id)
      .filter(Boolean)
      .map(String)
  )
  const waitingCod=rows.reduce((sum,row)=>sum+Number(row.cod??0),0)

  return <div className="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen">
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho</h1>
        <p>Theo Kho nhận · bóc tách SKU bán · xác nhận nhập tồn thủ công</p>
      </div>
      <div className="head-actions">
        <WarehouseReceivingSettings
          warehouses={(warehouses??[]) as any[]}
          defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
        />
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
      </div>
    </header>

    {error&&<div className="tracking-flash-row">
      <div className="error-box">Không thể tải dữ liệu nhập kho: {error.message}</div>
    </div>}

    <section className="tracking-command-center-v2 warehouse-command-center">
      <div className="tracking-status-strip-v2">
        <div className="tracking-status-metric warning">
          <span>Chờ bóc tách</span><b>{incompleteRows.length}</b><small>Chỉ đơn chưa bóc tách</small>
        </div>
        <div className="tracking-status-metric amber">
          <span>SKU chưa map</span><b>{missingItems}</b><small>Dòng sản phẩm cần xử lý</small>
        </div>
        <div className="tracking-status-metric success">
          <span>Chờ nhập kho</span><b>{readyRows.length}</b><small>Đã bóc tách, chưa ghi tồn</small>
        </div>
        <div className="tracking-status-metric info">
          <span>Kho nhận</span><b>{receivingWarehouseIds.size}</b><small>Kho đang có hàng chờ xử lý</small>
        </div>
        <div className="tracking-status-metric">
          <span>COD chờ xử lý</span><b>{formatMoney(waitingCod)}</b><small>{rows.length} đơn đã nhận</small>
        </div>
      </div>

      <div className="tracking-control-row-v2 warehouse-control-row">
        <div className="tracking-console-title">
          <b>Nhập kho theo Kho nhận</b>
          <span>{rows.length} đơn đã nhận · không tự động nhập tồn</span>
        </div>
        <div className="warehouse-intake-rule">
          <b>Gợi ý SKU ≠ tự động bóc tách.</b>
          <span>Người vận hành phải xác nhận mapping và sau đó tiếp tục bấm Xác nhận nhập kho.</span>
        </div>
      </div>
    </section>

    <WarehouseIntakeWorkspace
      rows={rows}
      variants={(variants??[]) as any[]}
      auditLogs={(auditLogs??[]) as any[]}
      suggestions={suggestions}
    />
  </div>
}
