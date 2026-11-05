import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseIntakeV21 } from '@/components/warehouse-intake-v21-workspace'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'
import '@/app/styles/warehouse-item-v21.css'

type SP = { state?: 'all' | 'incomplete' | 'missing' | 'ready' }

function keyOf(item: any) {
  return [
    String(item.sku ?? '').trim().toUpperCase(),
    String(item.product_name ?? '').trim().toLowerCase(),
    String(item.variant ?? '').trim().toLowerCase(),
  ].join('|')
}

export default async function WarehouseReceivePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, user } = await requireUser()
  const role = String(user.app_metadata?.role ?? 'viewer')
  const canOperate = ['admin', 'operator'].includes(role)

  // Feature compatibility gate. An independent Preview must not require
  // changes to the Production DB to show its read-only layout.
  const probe = await supabase.from('order_items').select('id,warehouse_item_status').limit(1)
  const schemaReady = !probe.error
  const itemColumns = [
    'id', 'sku', 'product_name', 'variant', 'quantity', 'original_price', 'final_price',
    'product_variant_id', 'inventory_multiplier',
    ...(schemaReady ? ['warehouse_item_status', 'warehouse_item_skip_reason'] : []),
    'product_variants(id,variant_name,sale_price,products(id,sku,name))',
  ].join(',')

  const [
    { data: orders, error: ordersError },
    { data: variants, error: variantsError },
    { data: warehouses, error: warehousesError },
    { data: auditLogs, error: auditError },
    { data: settings, error: settingsError },
    { data: previousMappings, error: mappingError },
  ] = await Promise.all([
    supabase.from('orders')
      .select([
        'id,shopee_order_id,cod,prepaid_amount,order_date,warehouse_status',
        'recipient_name,recipient_phone,recipient_address,destination_hub,area,order_status,payment_status,shipping_service,prepaid_source_label',
        'erp_users(username)',
        'shipments(carrier,tracking_number,current_tracking_status,is_active)',
        'order_vouchers(voucher_code,voucher_name,voucher_type,voucher_tag)',
        'receive_batch_details(id,receive_batch_id,receive_batches(id,warehouse_id,received_at,warehouses(id,code,name,address)))',
        'order_items(' + itemColumns + ')',
      ].join(','))
      .is('archived_at', null)
      .eq('receive_status', 'RECEIVED')
      .in('warehouse_status', schemaReady
        ? ['READY_TO_TRANSFER', 'WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED', 'WAREHOUSE_MIXED']
        : ['READY_TO_TRANSFER', 'WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED'])
      .order('order_date', { ascending: false })
      .limit(500),
    supabase.from('product_variants')
      .select('id,variant_name,sale_price,products(id,sku,name)')
      .order('updated_at', { ascending: false })
      .limit(1500),
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active', true).order('code').limit(100),
    supabase.from('audit_logs')
      .select('id,entity_id,action,created_at,old_value,new_value')
      .eq('module', 'WAREHOUSE').eq('entity_type', 'ORDER')
      .order('created_at', { ascending: false }).limit(800),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id').eq('id', 'main').maybeSingle(),
    supabase.from('order_items')
      .select('id,sku,product_name,variant,product_variant_id,inventory_multiplier,created_at,product_variants(id,variant_name,sale_price,products(id,sku,name))')
      .not('product_variant_id', 'is', null)
      .order('created_at', { ascending: false }).limit(3000),
  ])

  const error = ordersError ?? variantsError ?? warehousesError ?? auditError ?? settingsError ?? mappingError
  const rows = (orders ?? []) as any[]
  const latestByKey = new Map<string, any>()
  for (const mapped of (previousMappings ?? []) as any[]) {
    const key = keyOf(mapped)
    if (!latestByKey.has(key)) latestByKey.set(key, mapped)
  }
  const suggestions: Record<string, any> = {}
  for (const order of rows) for (const item of (order.order_items ?? []) as any[]) {
    if (item.product_variant_id) continue
    const previous = latestByKey.get(keyOf(item))
    if (!previous?.product_variant_id || !previous?.product_variants) continue
    suggestions[item.id] = {
      variant_id: previous.product_variant_id,
      sku: previous.product_variants?.products?.sku ?? null,
      product_name: previous.product_variants?.products?.name ?? null,
      variant_name: previous.product_variants?.variant_name ?? null,
      multiplier: Number(previous.inventory_multiplier ?? 1),
    }
  }

  return <div className="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen">
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho</h1>
        <p>Bóc tách SKU và xác nhận nhập tồn theo từng sản phẩm tại Kho nhận thực tế</p>
      </div>
      <div className="head-actions">
        {schemaReady && <WarehouseReceivingSettings
          warehouses={(warehouses ?? []) as any[]}
          defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id ?? null}
        />}
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">
          Đơn chờ nhận
        </Link>
      </div>
    </header>
    {!error && <div className="wiv21-live-source" role="status">
      <span><b>Dữ liệu thực MYNH ERP</b> · Supabase hiện hành · {rows.length} đơn đã nhận hàng · Chỉ xem trên Preview</span>
      <span>Không tạo dữ liệu mẫu, không tự điền giá nguồn còn thiếu.</span>
    </div>}
    {error && <div className="tracking-flash-row">
      <div className="error-box">Không thể tải dữ liệu Nhập kho: {error.message}</div>
    </div>}
    <WarehouseIntakeV21
      rows={rows} variants={(variants ?? []) as any[]}
      warehouses={(warehouses ?? []) as any[]}
      auditLogs={(auditLogs ?? []) as any[]}
      suggestions={suggestions}
      schemaReady={schemaReady} canOperate={canOperate}
      initialStage={sp.state === 'ready' ? 'ready' : 'needs'}
    />
  </div>
}
