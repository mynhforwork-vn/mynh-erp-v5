import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const page = read('app/(erp)/warehouse/receive/page.tsx')
const workspace = read('components/warehouse-intake-native-design.tsx')
const css = read('app/styles/warehouse-native-design.css')
const receivingSettings = read('components/warehouse-receiving-settings.tsx')
const checks = [
  ['existing ERP layout and slidebar', workspace.includes('whx-intake-layout warehouse-intake-layout wh-native-workspace') && workspace.includes('whx-detail-panel warehouse-intake-panel mynh-slide-panel')],
  ['existing ERP tables and shared column controls', workspace.includes('tracking-hub-table-wrap') && workspace.includes('ManagedColumnsMenu') && workspace.includes('SortableHeader')],
  ['real Supabase orders, receiving batches, items and vouchers', page.includes("supabase.from('orders')") && page.includes("receive_batch_details(") && page.includes("order_items(") && page.includes("order_vouchers(")],
  ['purchase price before pricing form', workspace.indexOf('Đối chiếu giá mua') >= 0 && workspace.indexOf('Đối chiếu giá mua') < workspace.indexOf('Ghép SKU bán và quyết định giá')],
  ['real price missing is not zero', workspace.includes("? 'Chưa có' : formatMoney(value)")],
  ['per-item choice preview without writes', workspace.includes('setPreviewChoices') && workspace.includes('không ghi Supabase')],
  ['no old V2.1 component or migration needed', !workspace.includes('warehouse-intake-v21-workspace') && !page.includes('warehouse-item-v21')],
  ['no app server actions in preview component', !workspace.includes("from '@/lib/actions/warehouse'") && !workspace.includes('supabase.rpc(')],
  ['ResizeObserver measures true list width without auto-hiding columns',
    workspace.includes('new ResizeObserver(') && workspace.includes('setListWidth(') &&
    !workspace.includes('renderGroupedCells') && !workspace.includes('tableMode')],
  ['all seven visible columns preserve managed order while pixel widths flex',
    workspace.includes('minWidths: Record<Column, number>') &&
    workspace.includes('colWidths') && workspace.includes('<colgroup>') &&
    workspace.includes('columns.visible.map(column => renderCell(row, column))')],
  ['inner scroll is allowed when two panels constrain list width',
    css.includes('overflow-x:auto!important') &&
    css.includes('var(--wh-table-width,100%)') &&
    css.includes('max-height:min(58dvh,660px)')],
  ['warehouse settings reuse native component without Preview mutations',
    page.includes('<WarehouseReceivingSettings') &&
    page.includes('previewOnly') && page.includes("supabase.from('warehouse_settings')") &&
    receivingSettings.includes('previewOnly ? undefined : saveReceivingWarehouseSettings') &&
    receivingSettings.includes('disabled={previewOnly}')],
  ['only three order workflow statuses exist everywhere',
    workspace.includes("pending: 'Chờ bóc tách'") &&
    workspace.includes("ready: 'Chờ nhập kho'") &&
    workspace.includes("done: 'Đã xử lý'") &&
    !workspace.includes("'Chờ quyết định kho'") &&
    !workspace.includes("return 'Đã nhập kho'") &&
    !workspace.includes("return 'Đã bỏ qua kho'") &&
    !workspace.includes("return 'Đã xử lý hỗn hợp'")],
  ['the three KPI status cards match phase filters and deep-links',
    page.includes("tracking-status-strip-v2 wh-native-three-statuses") &&
    page.includes('href="/warehouse/receive?state=pending"') &&
    page.includes('href="/warehouse/receive?state=ready"') &&
    page.includes('href="/warehouse/receive?state=done"') &&
    page.includes('const done = rows.filter(') &&
    !page.includes('<span>SKU chưa map</span>') &&
    css.includes("grid-template-columns:repeat(3,minmax(0,1fr))!important")],
  ['status pills use the existing ERP semantic palette',
    workspace.includes("'status-ready_to_ship'") &&
    workspace.includes("'orange'") && workspace.includes("'green'") &&
    !workspace.includes(" ? 'blue' :") &&
    workspace.includes("'status-pill ' + phaseStatusTone(row)")],
  ['fixed table layout clips long strings and keeps sticky header',
    css.includes('table-layout:fixed!important') && css.includes('overflow:hidden!important') &&
    css.includes('position:sticky!important') && css.includes('white-space:nowrap!important') && css.includes('font-weight:400!important')],
  ['all products listed once per row, no bold wrapping',
    workspace.includes('row.order_items.map(item => <span key={item.id}') &&
    workspace.includes('productDescription(item)') && css.includes('.wh-native-product-line') &&
    css.includes('font-weight:400!important')],
  ['both receiving warehouse lanes derived from confirmed batch links',
    page.includes("supabase.from('receive_batch_details')") &&
    page.includes("supabase.from('receive_batches')") &&
    page.includes("supabase.from('warehouses')") &&
    workspace.includes('KHO BG') && workspace.includes('KHO HN') &&
    !workspace.includes('destination_hub || warehouse')],
  ['two embedded detail panels adapt table width',
    workspace.includes('new MutationObserver(() => { watchTables(); adapt() })') &&
    workspace.includes('mutation?.observe(workspace, { childList: true, subtree: true })') &&
    css.includes('aside.mynh-slide-panel:nth-of-type(2)')],
  ['warehouse cards mirror Shipping Alert HUB interactions',
    workspace.includes('tracking-hub-card tracking-hub-card-v2 wh-native-warehouse-card') &&
    workspace.includes('tracking-hub-head-v2 wh-native-warehouse-head') &&
    workspace.includes('tracking-hub-metrics-v2 wh-native-warehouse-metrics') &&
    workspace.includes("aria-expanded={expanded}") &&
    workspace.includes('setOpenWarehouses(previous =>') ],
  ['warehouse card operational summaries derived from its own rows',
    workspace.includes('pending: buckets[group.key].filter') &&
    workspace.includes('ready: buckets[group.key].filter') &&
    workspace.includes('done: buckets[group.key].filter') &&
    workspace.includes('cod: buckets[group.key].reduce') ],
  ['warehouse card owns a subtable and shares scrollable outer stack',
    workspace.includes('wh-native-warehouse-stack') &&
    workspace.includes('group.rows.map(row =>') &&
    css.includes('overflow-y:auto!important') &&
    css.includes('container-type:inline-size')],
  ['no fixed-position desktop panel', css.includes('@media(min-width:901px)') && css.includes('position:relative!important') && !css.includes('position:fixed')],
  ['escape key closes slidebar', workspace.includes("event.key === 'Escape'")],
]
for (const [name, pass] of checks) {
  assert.ok(pass, name)
  console.log('PASS', name)
}
console.log(checks.length + '/' + checks.length + ' native warehouse design contracts PASS')
