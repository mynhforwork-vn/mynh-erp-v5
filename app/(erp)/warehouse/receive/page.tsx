import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatMoney } from '@/lib/format'
import { WarehouseIntakeNativeDesign } from '@/components/warehouse-intake-native-design'
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
  ])
  const error = ordersError ?? variantsError ?? auditError
  const rows = (orders ?? []) as any[]
  const pending = rows.filter(row => row.warehouse_status === 'READY_TO_TRANSFER')
  const incomplete = pending.filter(row =>
    !(row.order_items ?? []).length ||
    (row.order_items ?? []).some((item: any) => !item.product_variant_id))
  const ready = pending.filter(row =>
    (row.order_items ?? []).length > 0 &&
    (row.order_items ?? []).every((item: any) => Boolean(item.product_variant_id)))
  const missingItems = incomplete.reduce((sum, row) =>
    sum + (row.order_items ?? []).filter((item: any) => !item.product_variant_id).length, 0)
  const warehouses = new Set(rows.map(row => batchOf(row)?.warehouse_id).filter(Boolean).map(String))
  const waitingCod = pending.reduce((sum, row) => sum + Number(row.cod ?? 0), 0)
  const currentStatus = state === 'ready' ? 'ready' : state === 'incomplete' || state === 'missing' ? 'pending' : state === 'done' ? 'done' : 'all'

  return <div className="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen">
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho</h1>
        <p>Theo Kho nhận · Bóc tách SKU · Quyết định nhập hoặc bỏ qua theo từng sản phẩm</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
      </div>
    </header>

    <div className="tracking-flash-row">
      <div className="warehouse-intake-rule" role="status">
        <b>Thiết kế mới · Dữ liệu thực MYNH ERP</b>
        <span>Chỉ xem và mô phỏng lựa chọn trên Preview; không ghi SKU, giá hoặc tồn kho vào Supabase.</span>
      </div>
    </div>
    {error && <div className="tracking-flash-row">
      <div className="error-box">Không thể tải dữ liệu Kho nhận: {error.message}</div>
    </div>}

    <section className="tracking-command-center-v2 warehouse-command-center">
      <div className="tracking-status-strip-v2">
        <Link href="/warehouse/receive?state=incomplete" className={'tracking-status-metric warning ' + (state === 'incomplete' ? 'active' : '')}>
          <span>Chờ bóc tách</span><b>{incomplete.length}</b><small>Đơn chưa xác nhận đủ SKU</small>
        </Link>
        <Link href="/warehouse/receive?state=missing" className={'tracking-status-metric amber ' + (state === 'missing' ? 'active' : '')}>
          <span>SKU chưa map</span><b>{missingItems}</b><small>Dòng sản phẩm cần xử lý</small>
        </Link>
        <Link href="/warehouse/receive?state=ready" className={'tracking-status-metric success ' + (state === 'ready' ? 'active' : '')}>
          <span>Chờ nhập kho</span><b>{ready.length}</b><small>Chưa ghi tăng tồn</small>
        </Link>
        <Link href="/warehouse/receive" className={'tracking-status-metric info ' + (state === 'all' ? 'active' : '')}>
          <span>Kho nhận</span><b>{warehouses.size}</b><small>{rows.length} đơn đã nhận</small>
        </Link>
        <div className="tracking-status-metric">
          <span>COD chờ xử lý</span><b>{formatMoney(waitingCod)}</b><small>{pending.length} đơn chưa xử lý kho</small>
        </div>
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
