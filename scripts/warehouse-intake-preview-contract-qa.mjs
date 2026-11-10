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
const skipMigration=read('supabase/migrations/0076_skip_unmapped_warehouse_item.sql')
const actions=read('lib/actions/warehouse-item-decisions.ts')
const bulkActions=read('lib/actions/warehouse-bulk-receive.ts')
const bulkBar=read('components/warehouse-bulk-receive-bar.tsx')
const skuHistory=read('lib/warehouse-sku-suggestions.ts')
const inlinePicker=read('components/warehouse-inline-sku-history-picker.tsx')
const skipPicker=read('components/warehouse-inline-skip-item.tsx')
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
  ['one 6-column table per confirmed warehouse with date under order',
    table.includes("type TableCol='order'|'sku'|'product'|'purchase'|'sale'|'status'")&&
    table.includes('warehouse-unified-table')&&
    table.includes('row.order_items.map(item=><div')&&
    !table.includes('warehouse-split-table')&&
    !table.includes('warehouse-ready-table')],
  ['independent column menu per receiving warehouse and sortable columns',
    table.includes("mynh-warehouse-intake-bg-columns-v3") &&
    table.includes("mynh-warehouse-intake-hn-columns-v3") &&
    table.includes("group.code==='BG'?bgColumns:group.code==='HN'?hnColumns:otherColumns") &&
    table.includes('<ManagedColumnsMenu labels={TABLE_LABELS}')&&
    table.includes('<SortableHeader') &&
    table.includes('warehouse-unified-group-column-control') &&
    !table.includes('warehouse-unified-toolbar')],
  ['real-width Auto Fit preserves six actual table columns without blank width',
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
  ['warehouse 0/1/2/3+ row states preserve compact groups and dense scrolling',
    table.includes("group.rows.length===1?'one':group.rows.length===2?'two':'many'") &&
    table.includes('data-warehouse-row-mode={groupRowMode}') &&
    table.includes("warehouse-rows-'+groupRowMode") &&
    table.includes("Math.min(group.rows.length,30)") &&
    table.includes('.filter(group=>showProcessedOnly||group.rows.some(row=>!isDone(row)))') &&
    css.includes('.warehouse-unified-group.open.warehouse-rows-one') &&
    css.includes('.warehouse-unified-group.open.warehouse-rows-two') &&
    css.includes('flex:0 0 auto!important;min-height:0!important') &&
    css.includes('.warehouse-unified-group.open.warehouse-rows-many') &&
    css.includes('flex:var(--warehouse-dense-weight,3) 1 auto!important') &&
    css.includes('.warehouse-unified-group.open.warehouse-rows-many:only-of-type') &&
    css.includes('overflow-y:auto!important') &&
    !css.includes('flex:var(--warehouse-row-weight,1) 1 0!important')],
  ['order slidebar opens only on explicit order-code click',
    table.includes('const [activeId,setActiveId]=useState<string|null>(null)') &&
    table.includes("onClick={event=>{event.stopPropagation();setActiveId(row.id)}}") &&
    table.includes("onOpenOrder={id=>{setBulkReviewGroup(null);setActiveId(id)}}") &&
    !table.includes("onClick={()=>{setActiveId(row.id)}}") &&
    !table.includes("firstIncomplete?.id??null") &&
    table.includes("onClose={()=>setActiveId(null)")],
  ['one product per line and full detail in tooltip',
    table.includes('warehouse-unified-product-line') &&
    table.includes("['SL '+item.quantity]") === false &&
    table.includes("'SL '+item.quantity") &&
    css.includes('white-space:nowrap') &&
    css.includes('text-overflow:ellipsis')],
  ['receive warehouse is actual batch; BG and HN stay distinct',
    table.includes('const warehouse=batch?.warehouses')&&
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
  ['bulk selection rail and six-column content align across eligible/ineligible rows',
    table.includes('warehouse-bulk-select-control') &&
    table.includes('warehouse-bulk-select-spacer') &&
    table.includes('warehouse-unified-order-details') &&
    table.includes('partiallyReadySelected') &&
    table.includes('data-partial={partiallyReadySelected?') &&
    table.includes('<th key={col} data-col={col}>') &&
    css.includes('.warehouse-bulk-select-checkbox:checked+.warehouse-bulk-select-mark') &&
    css.includes('.warehouse-bulk-select-checkbox:focus-visible+.warehouse-bulk-select-mark') &&
    css.includes('th[data-col="purchase"] .managed-sort-head span') &&
    css.includes('th[data-col="sale"] .managed-sort-head span') &&
    css.includes('th[data-col="status"] .managed-sort-head span') &&
    css.includes('.warehouse-unified-prices .warehouse-unified-product-line') &&
    css.includes('.warehouse-unified-status .warehouse-unified-product-line') &&
    css.includes('display:block;padding-left:0;margin-top:3px;') &&
    !css.includes('display:block;padding-left:18px;margin-top:3px;')],
  ['per-order icon submits only eligible orders directly via guarded Server Action',
    table.includes('warehouse-order-quick-receive') &&
    table.includes("aria-label={'Nhập nhanh đơn '+") &&
    table.includes('!showProcessedOnly&&!!bulkPreview(row,itemDecisions)') &&
    table.includes('disabled={previewOnly||quickReceivingId!==null}') &&
    table.includes('quickInFlight.current=true') &&
    table.includes('if(previewOnly||quickInFlight.current||!bulkPreview(row,itemDecisions))return') &&
    table.includes('warehouseId,orderIds:[row.id],note:') &&
    table.includes('void handleQuickReceive(row,group.id)') &&
    table.includes('setQuickReceivingId(row.id)') &&
    table.includes('setQuickNotice({kind:') &&
    table.includes('router.refresh()') &&
    table.includes('setTimeout(()=>setQuickNotice(null),5000)') &&
    table.includes('<WarehouseBulkReceiveBar') &&
    !table.includes('warehouse-order-quick-label') &&
    css.includes('.warehouse-unified-order-inline') &&
    css.includes('.warehouse-unified-order-details .warehouse-order-quick-receive') &&
    css.includes('.warehouse-quick-notice')],
  ['bulk confirmation requires one click, without an agreement checkbox',
    !bulkBar.includes('confirmText') &&
    !bulkBar.includes('warehouse-bulk-agreement') &&
    !bulkBar.includes('Tôi đã đối chiếu đơn') &&
    !bulkBar.includes('type="checkbox"') &&
    bulkBar.includes('if(previewOnly||busy||orders.length===0||orders.length>25)return') &&
    bulkBar.includes('disabled={previewOnly||busy||orders.length===0||orders.length>25}') &&
    bulkBar.includes("warehouseId,orderIds:orders.map(x=>x.id),note")],
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
  ['bulk receipt preview is a receiving-style modal with true item-level audit fields',
    bulkBar.includes('createPortal(') &&
    bulkBar.includes('receive-confirm-backdrop warehouse-bulk-backdrop') &&
    bulkBar.includes('receive-confirm-modal warehouse-bulk-modal') &&
    bulkBar.includes('role="dialog" aria-modal="true"') &&
    bulkBar.includes('warehouse-bulk-review-table') &&
    bulkBar.includes('price(item.originalPrice)') &&
    bulkBar.includes('price(item.salePrice)') &&
    bulkBar.includes('item.sku') &&
    bulkBar.includes("item.decision==='IN'?'Nhập kho':'Bỏ qua kho'") &&
    bulkBar.includes("onOpenOrder(order.id)") &&
    css.includes('.warehouse-bulk-backdrop .warehouse-bulk-review-table') &&
    css.includes('@media(max-width:720px)')],
  ['bulk preview is ONE table with exactly one order code per order via row span',
    bulkBar.includes('orders.flatMap((order,orderIndex)=>order.items.map((item,itemIndex)=>') &&
    bulkBar.includes('itemIndex===0&&<td rowSpan={order.items.length}') &&
    bulkBar.includes('data-review-order={order.id}') &&
    bulkBar.includes('data-order-first={itemIndex===0?') &&
    bulkBar.includes("item.decision==='IN'?'Nhập kho':'Bỏ qua kho'") &&
    bulkBar.includes('onOpenOrder(order.id)') &&
    !bulkBar.includes('expandedOrders') &&
    !bulkBar.includes('warehouse-bulk-order-toggle') &&
    !bulkBar.includes('Thu gọn tất cả') &&
    css.includes('warehouse-bulk-order-cell') &&
    !css.includes('warehouse-bulk-order-group')],
  ['receiving table combines received date with order and SKU with sale name',
    table.includes("const TABLE_COLUMNS:TableCol[]=['order','sku','product','purchase','sale','status']") &&
    table.includes('warehouse-unified-received-at') &&
    table.includes('formatDateTime(receivedAt(row))') &&
    table.includes('warehouse-unified-sku-identity') &&
    table.includes('warehouse-unified-sku-title') &&
    table.includes('item.product_variants.products.name') &&
    table.includes("if(col==='order')return new Date(receivedAt(row)??0).getTime()") &&
    table.includes("mynh-warehouse-intake-hn-columns-v3") &&
    css.includes('.warehouse-unified-sku-title') &&
    css.includes('.warehouse-unified-received-at')],
  ['unparsed order shows canonical full order value, never COD-only or guessed sum',
    table.includes("import { resolveOrderValue } from '@/lib/order-prepaid'") &&
    table.includes('!isDone(row)&&!isComplete(row,itemDecisions)&&') &&
    table.includes('warehouse-unified-pending-value') &&
    table.includes('Giá trị đơn: <strong>') &&
    table.includes('paymentStatus:row.payment_status') &&
    table.includes('prepaidAmount:row.prepaid_amount') &&
    table.includes('cod:row.cod') &&
    table.includes("value===null?'Chưa đủ dữ liệu':formatMoney(value)") &&
    css.includes('.warehouse-unified-table .warehouse-unified-pending-value') &&
    !table.includes('warehouse-unified-pending-cod') &&
    !table.includes('COD: <strong>')],
  ['Giá gốc uses stored original price (not after-discount) in table and popup',
    table.includes("purchase:'Giá gốc'") &&
    table.includes("if(col==='purchase')return Number(row.order_items[0]?.original_price??0)") &&
    table.includes('linePrice(item.original_price)') &&
    bulkBar.includes('<th>Giá gốc/SP</th>') &&
    bulkBar.includes('price(item.originalPrice)') &&
    bulkBar.includes('price(item.discountedPrice)') &&
    !bulkBar.includes('purchasePrice') &&
    !bulkBar.includes('Giá nhập/SP')],
  ['suggestions derive from persisted prior-order SKU history, not guessed text',
    page.includes('indexHistoricalSkuMappings(history)') &&
    page.includes('suggestSkusFromHistory({...item,order_id:order.id},historicIndex,3)') &&
    page.includes("'id,order_id,sku,product_name,variant,product_variant_id,inventory_multiplier,created_at") &&
    skuHistory.includes('row.order_id===target.order_id') &&
    skuHistory.includes("if(sku&&previousSku&&sku!==previousSku)continue") &&
    skuHistory.includes('history_count:entry.orderIds.size') &&
    skuHistory.includes('previous.multipliers.set') &&
    panel.includes('suggestionOptions.map((option,index)=>') &&
    panel.includes('onClick={()=>applySuggestion(option)}') &&
    panel.includes('GỢI Ý SKU TỪ LỊCH SỬ ĐÃ LƯU') &&
    panel.includes('Đã từng ghép với nhiều SKU') &&
    !panel.includes('onClick={applySuggestion}') &&
    panelCss.includes('.warehouse-detail-v2-suggestion-entry')],
  ['inline SKU draft from history can confirm once or create a new SKU without slidebar',
    table.includes("from '@/components/warehouse-inline-sku-history-picker'") &&
    table.includes('warehouse-inline-sku-trigger') &&
    table.includes('warehouse-inline-sku-pair') &&
    table.includes('warehouse-inline-sku-confirm') &&
    table.includes('const proposed=historical[0]') &&
    table.includes('void confirmSuggestedSku(row,item,proposed)') &&
    table.includes('await saveWarehouseItemDecision({') &&
    table.includes("decision:'IN',skipReason:null") &&
    table.includes('quickSkuInFlight.current=true') &&
    table.includes('if(previewOnly||isDone(row)||item.product_variant_id||quickSkuInFlight.current)return') &&
    table.includes('Chưa ghi tăng tồn kho.') &&
    table.includes('<WarehouseInlineSkuHistoryPicker') &&
    inlinePicker.includes("history.filter(item=>variants.some(variant=>variant.id===item.variant_id))") &&
    inlinePicker.includes('const preferred=history.find(') &&
    inlinePicker.includes("useState<Decision|null>(preferredVariant?'IN':null)") &&
    inlinePicker.includes('Tạo SKU mới') &&
    inlinePicker.includes('Mã SKU bán mới ghép nhanh') &&
    inlinePicker.includes("mode==='new'?newCode:null") &&
    inlinePicker.includes("mode==='new'?validNew:!!selected") &&
    inlinePicker.includes("decision==='SKIP'?skipReason.trim():null") &&
    inlinePicker.includes('await saveWarehouseItemDecision({') &&
    inlinePicker.includes('const canSave=!previewOnly') &&
    !inlinePicker.includes('finalizeWarehouseItemDecisions') &&
    !inlinePicker.includes('receiveOrdersIntoWarehouse') &&
    css.includes('.warehouse-inline-sku-confirm') &&
    css.includes('.warehouse-inline-sku-history-modes') &&
    css.includes('position:fixed;z-index:3200')],
  ['unmapped product can be explicitly skipped without fake sale SKU or stock movement',
    table.includes("from '@/components/warehouse-inline-skip-item'") &&
    table.includes('warehouse-inline-item-skip-trigger') &&
    table.includes('openSkipItem(event,row,item)') &&
    table.includes('className="warehouse-inline-sku-pair"') &&
    table.indexOf('className="warehouse-inline-item-skip-trigger"')>
      table.indexOf('className="warehouse-inline-sku-trigger"') &&
    table.indexOf('className="warehouse-inline-item-skip-trigger"')<
      table.indexOf("if(col==='product')return <td",table.indexOf('className="warehouse-inline-item-skip-trigger"')) &&
    table.includes('className="warehouse-unified-status"') &&
    !table.includes('className="status-pill warehouse-inline-item-skip-trigger"') &&
    table.includes('itemDecisions[item.id]') &&
    table.includes('record.decision') &&
    table.includes('record.product_variant_id===null') &&
    table.includes('<WarehouseInlineSkipItem') &&
    table.includes("return !!bulkPreview(row,decisions)") &&
    table.includes("!canSuggest&&<b>{itemDecisions[item.id]?.decision==='SKIP'") &&
    skipPicker.includes('skipWarehouseItemWithoutSku({orderItemId:target.orderItemId,reason:reason.trim()})') &&
    skipPicker.includes("reason.trim().length>0&&reason.trim().length<=500") &&
    skipPicker.includes('if(!canSave||inFlight.current)return') &&
    skipPicker.includes('Không cần ghép hoặc tạo SKU bán') &&
    skipPicker.includes('data-warehouse-inline-skip') &&
    actions.includes("supabase.rpc('skip_warehouse_item_without_sku'") &&
    actions.includes('const supabase=await authorize()') &&
    bulkActions.includes('skipWithoutSku=skipped&&!item.product_variant_id') &&
    page.includes('const decisionSourceRows') &&
    page.includes('const ready=pending.filter(isReady)') &&
    skipMigration.includes('ALTER COLUMN product_variant_id DROP NOT NULL') &&
    skipMigration.includes("product_variant_id IS NOT NULL OR") &&
    skipMigration.includes("decision='SKIP' AND multiplier=1 AND sale_price=0") &&
    skipMigration.includes('CREATE OR REPLACE FUNCTION private.skip_warehouse_item_unmapped_impl') &&
    skipMigration.includes('PERFORM private.assert_operator()') &&
    skipMigration.includes('WHERE id=v_order_id FOR UPDATE') &&
    skipMigration.includes('v_item.product_variant_id IS NOT NULL') &&
    skipMigration.includes("WHERE it.reference_type='PURCHASE_RECEIPT'") &&
    skipMigration.includes("WHERE d.order_id=p_order_id AND d.decision='IN'") &&
    skipMigration.includes('CREATE OR REPLACE FUNCTION private.finalize_warehouse_item_decisions_impl') &&
    !skipPicker.includes('bulkReceiveWarehouseOrders(') &&
    !skipPicker.includes('saveWarehouseItemDecision(') &&
    css.includes('.warehouse-unified-skus .warehouse-inline-sku-pair .warehouse-inline-item-skip-trigger') &&
    css.includes('flex:0 0 18px;width:18px;height:18px') &&
    table.includes("aria-label={'Bỏ qua kho sản phẩm '+item.product_name}") &&
    !table.includes('<span>Bỏ qua kho</span>') &&
    !css.includes('.warehouse-inline-item-skip-trigger span') &&
    !css.includes('.warehouse-unified-status .warehouse-inline-item-skip-trigger') &&
    css.includes('.warehouse-inline-skip-reason')],
  ['V2 slidebar height internal scroll and fixed footer',
    panelCss.includes('.warehouse-detail-v2-scroll') &&
    panelCss.includes('flex:1 1 auto!important') &&
    panelCss.includes('.warehouse-detail-v2-footer') &&
    panelCss.includes('flex:0 0 auto!important') &&
    panelCss.includes('@media(max-width:900px)')],
]
for(const [title,passed] of checks){assert.ok(passed,title);console.log('PASS',title)}
console.log(checks.length+'/'+checks.length+' warehouse Preview contracts PASS')
