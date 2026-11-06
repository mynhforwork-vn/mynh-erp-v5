import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const page=read('app/(erp)/warehouse/receive/page.tsx')
const table=read('components/warehouse-intake-workspace.tsx')
const filter=read('components/purchase-date-filter.tsx')
const settings=read('components/warehouse-receiving-settings.tsx')
const css=read('app/styles/warehouse-intake-preview.css')
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
  ['real-width Auto Fit with no horizontal table scrollbar',
    table.includes('new ResizeObserver(measure)') &&
    table.includes('laneRef') &&
    table.includes('laneWidth<1050?TABLE_COMPACT_WEIGHTS:TABLE_WEIGHTS') &&
    css.includes('container-type:inline-size') &&
    css.includes('@container warehouse-lane (max-width:850px)') &&
    css.includes('overflow:visible!important') &&
    css.includes('min-width:0!important') &&
    !css.includes('min-width:870px!important')],
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
    !table.includes('destination_hub')],
  ['preview banner and redundant visual date heading removed',
    !page.includes('Thiết kế mới · Dữ liệu thực MYNH ERP') &&
    !page.includes('Chỉ xem và mô phỏng lựa chọn trên Preview') &&
    !page.includes('<span className="warehouse-receive-date-label">') &&
    page.includes('rangeParam="received_range"')],
  ['more space between the receiving table and the existing desktop slidebar',
    css.includes('column-gap:26px!important')],
  ['tablet/mobile uses full table width and fixed original slidebar overlay',
    css.includes('grid-template-columns:minmax(0,1fr)!important') &&
    css.includes('width:min(100vw,430px)!important') &&
    css.includes('position:fixed!important;inset:0 0 0 auto!important')],
  ['existing detail slidebar remains old JSX and no new panel redesign',
    table.includes('<aside className="whx-detail-panel warehouse-intake-panel">')&&
    table.includes('className="whx-panel-tabs"')&&
    !table.includes('wh-native-panel')&&
    settings.includes('<div className="whx-settings-popover">')&&!settings.includes('createPortal')],
  ['read-only Preview blocks warehouse forms and settings writes',
    page.includes('previewOnly')&&
    table.includes('previewOnly?undefined:receiveOrdersIntoWarehouse')&&
    table.includes('previewOnly?undefined:skipWarehouseOrder')&&
    table.includes('previewOnly?undefined:mapWarehouseOrderItem')&&
    settings.includes('previewOnly?undefined:saveReceivingWarehouseSettings')],
]
for(const [title,passed] of checks){assert.ok(passed,title);console.log('PASS',title)}
console.log(checks.length+'/'+checks.length+' warehouse Preview contracts PASS')
