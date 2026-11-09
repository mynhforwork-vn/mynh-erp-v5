import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const page=read('app/(erp)/warehouse/receive/page.tsx')
const table=read('components/warehouse-intake-workspace.tsx')
const filter=read('components/purchase-date-filter.tsx')
const settings=read('components/warehouse-receiving-settings.tsx')
const css=read('app/styles/warehouse-intake-preview.css')
const panel=read('components/warehouse-intake-detail-preview.tsx')
const panelCss=read('app/styles/warehouse-intake-detail-preview.css')
const migration=read('supabase/migrations/0075_item_level_warehouse_decisions.sql')
const actions=read('lib/actions/warehouse-item-decisions.ts')
const bulkActions=read('lib/actions/warehouse-bulk-receive.ts')
const bulkBar=read('components/warehouse-bulk-receive-bar.tsx')
const config=read('wrangler.jsonc')
const checks=[
  ['only Warehouse receive page uses the changed scoped stylesheet',
    page.includes("import '@/app/styles/warehouse-intake-preview.css'")&&
    css.includes('.warehouse-receive-screen')],
  ['date filter uses purchase/tracking tabs and actual receiving date, not order_date',
    page.includes('dateDescription="ngày nhận hàng"')&&
    page.includes('rangeParam="received_range"')&&
    page.includes('receiptDay(batchOf(row)?.received_at)')&&
    !table.includes('??row.order_date')&&
    filter.includes("query.set(rangeParam,nextRange)")],
  ['time presets and inclusive calendar range',
    filter.includes("key:'today'")&&filter.includes("key:'week'")&&
    filter.includes("key:'7d'")&&filter.includes("key:'30d'")&&
    filter.includes("key:'month'")&&filter.includes("key:'year'")&&
    page.includes('day >= sinceDay')&&page.includes('day <= untilDay')],
  ['KPI all includes all received orders, including completed and skipped',
    page.includes(".eq('receive_status', 'RECEIVED')")&&
    !page.includes(".eq('warehouse_status', 'READY_TO_TRANSFER')")&&
    !page.includes(".in('warehouse_status'")&&
    page.includes("statusHref('all')")&&
    page.includes("statusHref('done')")&&
    page.includes('<span>Tất cả</span><b>{rows.length}</b>')&&
    page.includes("'WAREHOUSE_SKIPPED'")&&page.includes("'WAREHOUSE_RECEIVED'")],
  ['all rows paginated with stable ordering; no silent 500 or 1000 record cap',
    page.includes('.range(offset,offset+batchSize-1)')&&
    page.includes(".order('id', { ascending: true })")&&
    page.includes("Danh sách nhận hàng vượt giới hạn 50.000 đơn.")],
  ['status and date preserved across navigation',
    page.includes("if (receivedPeriod !== 'all') query.set('received_range'")&&
    page.includes('preserveParams={{state:currentStatus}}')],
  ['one 7-column table per confirmed warehouse with actual product details',
    table.includes("type TableCol='order'|'received'|'warehouse'|'product'|'progress'|'cod'|'status'")&&
    table.includes('warehouse-unified-table')&&
    table.includes('row.order_items.map(item=><div')&&
    !table.includes('warehouse-split-table')&&
    !table.includes('warehouse-ready-table')],
  ['independent column menu per receiving warehouse and sortable columns',
    table.includes("mynh-warehouse-intake-bg-columns-v1") &&
    table.includes("mynh-warehouse-intake-hn-columns-v1") &&
    table.includes("group.code==='BG'?bgColumns:group.code==='HN'?hnColumns:otherColumns") &&
    table.includes('<ManagedColumnsMenu labels={TABLE_LABELS}')&&
    table.includes('<SortableHeader') &&
    table.includes('warehouse-unified-group-column-control') &&
    !table.includes('warehouse-unified-toolbar')],
  ['real-width Auto Fit preserves seven actual table columns without blank width',
    table.includes('new ResizeObserver(measure)') &&
    table.includes('autoFitColumnWidths(tableColumns.visible,laneWidth)') &&
    table.includes('style={{width:columnWidths[index]+\'%\'}}') &&
    css.includes('container-type:inline-size') &&
    css.includes('@container warehouse-lane (max-width:850px)') &&
    css.includes('display:table!important') &&
    css.includes('display:table-row!important') &&
    css.includes('display:table-cell!important') &&
    css.includes('display:table-header-group!important') &&
    !css.includes('.warehouse-unified-table tbody tr{\n    display:grid!important') &&
    !css.includes('min-width:870px!important')],
  ['hide warehouses without actionable orders outside completed KPI',
    table.includes('.filter(group=>showProcessedOnly||group.rows.some(row=>!isDone(row)))') &&
    table.includes('showProcessedOnly=false') &&
    table.includes('const visibleRows=useMemo(()=>groups.flatMap(group=>group.rows)') &&
    table.includes('data-warehouse-actionable={waiting.length}') &&
    page.includes("showProcessedOnly={currentStatus==='done'}") &&
    table.includes('Các kho đã hết đơn cần xử lý.')],
  ['warehouse height follows row count instead of fixed 50/50 split',
    table.includes("'--warehouse-row-weight':Math.min(group.rows.length,30)") &&
    css.includes('flex:var(--warehouse-row-weight,1) 1 0!important') &&
    css.includes('min-height:145px!important') &&
    css.includes('overflow-y:auto!important') &&
    css.includes('max-height:none!important') &&
    !css.includes('max-height:clamp(150px,43dvh,410px)!important')],
  ['one product per line and full detail in tooltip',
    table.includes('warehouse-unified-product-line') &&
    table.includes("['SL '+item.quantity]") === false &&
    table.includes("'SL '+item.quantity") &&
    css.includes('white-space:nowrap') &&
    css.includes('text-overflow:ellipsis')],
  ['receive warehouse is actual batch; BG and HN stay distinct',
    table.includes('batchOf(row)?.warehouses?.code')&&
    table.includes('BG - 320 Nguyễn Công Hãng')&&
    table.includes('HN - 164 Hồng Mai')&&
    table.includes('const batch=batchOf(row)')&&
    !table.includes('destination_hub??')],
  ['preview banner and redundant visual date heading removed',
    !page.includes('Thiết kế mới · Dữ liệu thực MYNH ERP') &&
    !page.includes('Chỉ xem và mô phỏng lựa chọn trên Preview') &&
    !page.includes('<span className="warehouse-receive-date-label">') &&
    page.includes('rangeParam="received_range"')],
  ['compact gap and table isolated from generic ERP table widths',
    css.includes('column-gap:10px!important') &&
    css.includes('.brand-shell-v1 .warehouse-receive-screen .warehouse-intake-preview-layout.with-panel') &&
    table.includes('<table className="warehouse-unified-table"') &&
    !table.includes('<table className="table warehouse-unified-table"') &&
    css.includes('table.warehouse-unified-table') &&
    css.includes('width:auto!important;min-width:0!important;max-width:none!important') &&
    !css.includes('body.brand-shell-v1')],
  ['receiving table and unchanged detail panel consume full page height',
    css.includes('.brand-shell-v1>.main:has(>.warehouse-receive-screen)') &&
    css.includes('padding-bottom:8px!important') &&
    css.includes('grid-template-rows:minmax(0,1fr)!important') &&
    css.includes('flex:1 1 0!important') &&
    css.includes('height:100%!important') &&
    css.includes('overflow-y:auto!important') &&
    css.includes('.warehouse-unified-group.open>.warehouse-unified-table-wrap') &&
    !css.includes('margin-bottom:10px;border-radius:7px')],
  ['selectors target the real ERP shell wrapper instead of body',
    read('app/(erp)/layout.tsx').includes('className="shell brand-shell-v1"') &&
    read('app/layout.tsx').includes('<body>{children}</body>') &&
    !css.includes('body.brand-shell-v1')],

  ['tablet/mobile uses full table width and fixed original slidebar overlay',
    css.includes('grid-template-columns:minmax(0,1fr)!important') &&
    css.includes('width:min(100vw,430px)!important') &&
    css.includes('position:fixed!important;inset:0 0 0 auto!important')],
  ['V2 panel replaces only the detail aside and keeps receiving table unchanged',
    table.includes('<WarehouseIntakeDetailPreview key={active.id}') &&
    table.includes('className="warehouse-unified-table"') &&
    panel.includes('<aside className="whx-detail-panel warehouse-intake-panel warehouse-detail-v2 mynh-slide-panel"') &&
    panel.includes('className="panel-tabs warehouse-detail-v2-tabs"') &&
    page.includes("import '@/app/styles/warehouse-intake-detail-preview.css'") &&
    settings.includes('<div className="whx-settings-popover">')],
  ['V2 tabs use the same slidebar contract as Order and User panels',
    panel.includes('mynh-slide-panel"') &&
    panel.includes('role="tablist"') &&
    panel.includes('context-stack-breadcrumb warehouse-detail-v2-meta') &&
    panel.includes('aria-selected={tab===') &&
    panel.includes('panel-tabs warehouse-detail-v2-tabs') &&
    !panelCss.includes('.warehouse-detail-v2-tabs button.active') &&
    !panelCss.includes('background:#eff6fb!important') &&
    read('app/styles/brand-responsive-v1.css').includes('.mynh-slide-panel>.panel-tabs')],
  ['Order detail uses canonical ERP content layout and accurate paid value',
    panel.includes('detail-grid compact-detail-grid') &&
    panel.includes('context-order-items warehouse-detail-v2-order-items') &&
    panel.includes('<VoucherTags value={voucherText}/>') &&
    panel.includes("import {prepaidSourceLabel,resolveOrderValue}") &&
    panel.includes('Giá trị đơn hàng') &&
    panel.includes('Loại tài khoản/thẻ') &&
    panel.includes('Kho nhận thực tế') &&
    panel.includes("setTab('products')") &&
    page.includes('prepaid_source_type') &&
    page.includes('shipping_service') &&
    page.includes('order_date,created_at') &&
    panelCss.includes('.warehouse-detail-v2-order-info .detail-grid')],
  ['V2 per-product SKU matching price conversion and separate stock decision',
    panel.includes("type Decision='IN'|'SKIP'") &&
    panel.includes("type Choice={action:Decision") &&
    panel.includes('Record<string,Choice>') &&
    panel.includes('Đối chiếu giá mua') &&
    panel.includes('Giá bán (sửa được)') &&
    panel.includes('Hệ số quy đổi') &&
    panel.includes('Ghi nhận lựa chọn thử') &&
    panel.includes('Lý do bỏ qua kho (bắt buộc)') &&
    panel.includes('Xem lựa chọn dự kiến')],
  ['V2 tab Info/History, per-item navigation, real data only',
    panel.includes('Thông tin đơn') &&
    panel.includes("setTab('products')") &&
    panel.includes("tab==='history'") &&
    panel.includes('activeShipment') &&
    panel.includes('order.order_vouchers') &&
    panel.includes('order.order_vouchers')],
  ['Preview safety keeps all persisted stock and SKU operations blocked',
    page.includes('previewOnly') &&
    table.includes('previewOnly={previewOnly}') &&
    bulkBar.includes('if(previewOnly||busy') &&
    !panel.includes('mapWarehouseOrderItem') &&
    !panel.includes('skipWarehouseOrder') &&
    !panel.includes('receiveOrdersIntoWarehouse') &&
    !panel.includes("from('@/lib/actions/warehouse')") &&
    panel.includes('không tạo SKU hoặc ghi tồn kho vào Supabase') &&
    settings.includes('previewOnly?undefined:saveReceivingWarehouseSettings')],
  ['backend item decisions persist independently and finalize as one DB transaction',
    migration.includes('CREATE TABLE IF NOT EXISTS public.warehouse_item_decisions') &&
    migration.includes('CREATE OR REPLACE FUNCTION private.save_warehouse_item_decision_impl') &&
    migration.includes('CREATE OR REPLACE FUNCTION private.finalize_warehouse_item_decisions_impl') &&
    migration.includes("d.decision='IN'") &&
    migration.includes('GROUP BY d.product_variant_id') &&
    migration.includes('warehouse_item_skip_reason_check') &&
    migration.includes('guard_warehouse_item_legacy_transition') &&
    migration.includes("'WAREHOUSE_MIXED'") &&
    migration.includes("PERFORM private.assert_operator();")],
  ['production-only write flag and read-only Cloudflare Preview',
    config.includes('"ERP_WAREHOUSE_V2_LIVE": "true"') &&
    config.includes('"ERP_WAREHOUSE_V2_LIVE": "false"') &&
    page.includes("process.env.ERP_WAREHOUSE_V2_LIVE==='true'") &&
    page.includes('previewOnly={!canWrite}') &&
    page.includes('simulate={!isLive}') &&
    actions.includes('assertLive()') &&
    actions.includes("!['admin','operator'].includes")],
  ['live UI uses server-side persistence and double-confirm stock finalization',
    panel.includes('saveWarehouseItemDecision(') &&
    panel.includes('finalizeWarehouseItemDecisions(') &&
    panel.includes('router.refresh()') &&
    panel.includes('Xác nhận ghi tồn kho') &&
    panel.includes('Ghi nhận lựa chọn thử') &&
    table.includes('bulkPreview(row,itemDecisions)') &&
    bulkActions.includes("supabase.rpc('finalize_warehouse_item_decisions'")],
  ['bulk receipt preflights selected legacy and V2 orders and permissions',
    bulkActions.includes("ERP_WAREHOUSE_V2_LIVE!=='true'") &&
    bulkActions.includes("!['admin','operator'].includes") &&
    bulkActions.includes("p_order_ids:legacy") &&
    bulkActions.includes("p_order_id:row.id") &&
    bulkActions.includes("warehouse_item_decisions") &&
    bulkActions.includes("receive_batch_details") &&
    bulkActions.includes('WAREHOUSE_BULK_LIMIT=25') &&
    bulkActions.includes("row.warehouse_status!=='READY_TO_TRANSFER'") &&
    bulkActions.includes('result.failed.push(') &&
    bulkActions.includes('result.succeeded.push(')],
  ['bulk UI supports 25 order selection, explicit review, and partial failure',
    table.includes('function bulkPreview(row:Row,decisions:Record<string,ItemDecision>)') &&
    table.includes('const capped=readyIds.slice(0,25)') &&
    table.includes('className="button small warehouse-bulk-shortcut"') &&
    table.includes('<WarehouseBulkReceiveBar') &&
    table.includes('setSelected(current=>current.filter(id=>failedIds.has(id)))') &&
    bulkBar.includes('Xem trước nhập hàng loạt') &&
    bulkBar.includes('Xác nhận nhập ') &&
    bulkBar.includes('warehouseId,orderIds:orders.map(x=>x.id),note') &&
    bulkBar.includes('if(previewOnly||busy||orders.length===0') &&
    css.includes('.warehouse-bulk-review') &&
    !table.includes('action={previewOnly?undefined:receiveOrdersIntoWarehouse}')],
  ['V2 slidebar height internal scroll and fixed footer',
    panelCss.includes('.warehouse-detail-v2-scroll') &&
    panelCss.includes('flex:1 1 auto!important') &&
    panelCss.includes('.warehouse-detail-v2-footer') &&
    panelCss.includes('flex:0 0 auto!important') &&
    panelCss.includes('@media(max-width:900px)')],
]
for(const [title,passed] of checks){assert.ok(passed,title);console.log('PASS',title)}
console.log(checks.length+'/'+checks.length+' warehouse Preview contracts PASS')
