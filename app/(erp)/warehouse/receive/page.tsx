import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseIntakeNativeDesign } from '@/components/warehouse-intake-native-design'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'
import '@/app/styles/warehouse-native-design.css'

function batchOf(row: any) {
  const detail = Array.isArray(row.receive_batch_details)
    ? row.receive_batch_details[0] : row.receive_batch_details
  const value = detail?.receive_batches
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

type SP = { state?: 'all' | 'incomplete' | 'missing' | 'ready' | 'done' }

export default async function WarehouseReceivePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const state = params.state ?? 'all'
  const { supabase } = await requireUser()
  const [
    { data: orders, error: ordersError },
    { data: variants, error: variantsError },
    { data: auditLogs, error: auditError },
    { data: receiptLinks, error: receiptLinksError },
    { data: receiptBatches, error: receiptBatchesError },
    { data: receivingWarehouses, error: receivingWarehousesError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('orders')
      .select([
        'id,shopee_order_id,cod,prepaid_amount,prepaid_source_label,order_date,warehouse_status,order_status,payment_status',
        'recipient_name,recipient_phone,recipient_address,area,destination_hub',
        'erp_users(username)',
        'shipments(carrier,tracking_number,current_tracking_status,is_active)',
        'order_vouchers(voucher_code,voucher_name,voucher_type,voucher_tag)',
        'receive_batch_details(id,receive_batch_id,receive_batches(id,warehouse_id,received_at,warehouses(id,code,name,address)))',
        'order_items(id,sku,product_name,variant,quantity,original_price,final_price,product_variant_id,inventory_multiplier,product_variants(id,variant_name,sale_price,products(id,sku,name)))',
      ].join(','))
      .is('archived_at', null)
      .eq('receive_status', 'RECEIVED')
      .in('warehouse_status', ['READY_TO_TRANSFER', 'WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED'])
      .order('order_date', { ascending: false })
      .limit(500),
    supabase.from('product_variants')
      .select('id,variant_name,sale_price,products(id,sku,name)')
      .order('updated_at', { ascending: false }).limit(1500),
    supabase.from('audit_logs')
      .select('id,entity_id,action,created_at,old_value,new_value')
      .eq('module', 'WAREHOUSE').eq('entity_type', 'ORDER')
      .order('created_at', { ascending: false }).limit(800),
    supabase.from('receive_batch_details')
      .select('order_id,receive_batch_id').limit(1500),
    supabase.from('receive_batches')
      .select('id,warehouse_id,received_at').limit(1000),
    supabase.from('warehouses')
      .select('id,code,name,address,is_active').in('code', ['BG', 'HN']).limit(10),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id').eq('id', 'main').single(),
  ])
  const error = ordersError ?? variantsError ?? auditError ??
    receiptLinksError ?? receiptBatchesError ?? receivingWarehousesError ?? settingsError

  // Read-only reconciliation from the confirmed receiving records. Do not
  // infer warehouse from HUB/delivery destination or place of residence.
  // This also protects the Preview from an absent nested PostgREST relation.
  const batchMap = new Map((receiptBatches ?? []).map(batch => [batch.id, batch]))
  const warehouseMap = new Map((receivingWarehouses ?? []).map(warehouse => [warehouse.id, warehouse]))
  const linksMap = new Map<string, Array<{ receive_batch_id: string }>>()
  for (const link of receiptLinks ?? []) {
    const previous = linksMap.get(link.order_id) ?? []
    previous.push({ receive_batch_id: link.receive_batch_id })
    linksMap.set(link.order_id, previous)
  }
  const rows = ((orders ?? []) as any[]).map(order => {
    const links = linksMap.get(order.id) ?? []
    if (links.length !== 1) return {
      ...order,
      receive_batch_details: links.length === 0 ? order.receive_batch_details : [],
    }
    const batch = batchMap.get(links[0].receive_batch_id)
    const warehouse = batch ? warehouseMap.get(batch.warehouse_id) : null
    if (!batch || !warehouse || !['BG', 'HN'].includes(warehouse.code)) {
      return { ...order, receive_batch_details: [] }
    }
    return { ...order, receive_batch_details: [{
      receive_batches: {
        warehouse_id: warehouse.id, received_at: batch.received_at,
        warehouses: { id: warehouse.id, code: warehouse.code, name: warehouse.name, address: warehouse.address },
      },
    }] }
  })
  const assignedCount = rows.filter(row => {
    const batch = row.receive_batch_details?.[0]?.receive_batches
    return batch?.warehouses?.code === 'BG' || batch?.warehouses?.code === 'HN'
  }).length
  const unresolvedCount = rows.length - assignedCount
  const pending = rows.filter(row => row.warehouse_status === 'READY_TO_TRANSFER')
  const incomplete = pending.filter(row =>
    !(row.order_items ?? []).length ||
    (row.order_items ?? []).some((item: any) => !item.product_variant_id))
  const ready = pending.filter(row =>
    (row.order_items ?? []).length > 0 &&
    (row.order_items ?? []).every((item: any) => Boolean(item.product_variant_id)))
  const missingItems = incomplete.reduce((sum, row) =>
    sum + (row.order_items ?? []).filter((item: any) => !item.product_variant_id).length, 0)
  const done = rows.filter(row =>
    ['WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED', 'WAREHOUSE_MIXED'].includes(String(row.warehouse_status)))
  // Preserve legacy deep-links from Kho overview; expose only three workflow states.
  const currentStatus = state === 'ready' ? 'ready' :
    state === 'pending' || state === 'incomplete' || state === 'missing' ? 'pending' :
    state === 'done' ? 'done' : 'all'

  return <div className="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen">
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho</h1>
        <p>Theo Kho nhận · Bóc tách SKU · Quyết định nhập hoặc bỏ qua theo từng sản phẩm</p>
      </div>
      <div className="head-actions">
        <WarehouseReceivingSettings
          warehouses={((receivingWarehouses ?? []).filter(w => w.is_active)) as any[]}
          defaultReceivingWarehouseId={settings?.default_receiving_warehouse_id ?? null}
          previewOnly
        />
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
      </div>
    </header>

    <div className="tracking-flash-row">
      <div className="warehouse-intake-rule" role="status">
        <b>Thiết kế mới · Dữ liệu thực MYNH ERP</b>
        <span>Chỉ xem và mô phỏng lựa chọn trên Preview; không ghi SKU, giá hoặc tồn kho vào Supabase.</span>
      </div>
    </div>
    {!error && unresolvedCount > 0 && <div className="tracking-flash-row">
      <div className="warehouse-intake-rule" role="status">
        <b>{unresolvedCount} đơn chưa xác định được kho nhận thực tế</b>
        <span>Vui lòng kiểm tra liên kết phiếu nhận. Hệ thống không tự suy đoán theo HUB và không nhập kho.</span>
      </div>
    </div>}
    {error && <div className="tracking-flash-row">
      <div className="error-box">Không thể tải dữ liệu Kho nhận: {error.message}</div>
    </div>}

    <section className="tracking-command-center-v2 warehouse-command-center">
      <div className="tracking-status-strip-v2 wh-native-three-statuses" aria-label="Ba trạng thái nhập kho">
        <Link href="/warehouse/receive?state=pending" className={'tracking-status-metric warning ' + (currentStatus === 'pending' ? 'active' : '')}>
          <span>Chờ bóc tách</span><b>{incomplete.length}</b><small>{missingItems} dòng SKU chưa ghép</small>
        </Link>
        <Link href="/warehouse/receive?state=ready" className={'tracking-status-metric info ' + (currentStatus === 'ready' ? 'active' : '')}>
          <span>Chờ nhập kho</span><b>{ready.length}</b><small>Đã ghép SKU, chưa ghi tồn</small>
        </Link>
        <Link href="/warehouse/receive?state=done" className={'tracking-status-metric success ' + (currentStatus === 'done' ? 'active' : '')}>
          <span>Đã xử lý</span><b>{done.length}</b><small>Đã nhập kho hoặc bỏ qua kho</small>
        </Link>
      </div>
    </section>

    <WarehouseIntakeNativeDesign
      rows={rows}
      variants={(variants ?? []) as any[]}
      auditLogs={(auditLogs ?? []) as any[]}
      initialPhase={currentStatus}
    />
  </div>
}
