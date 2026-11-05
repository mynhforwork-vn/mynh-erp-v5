import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const page = read('app/(erp)/warehouse/receive/page.tsx')
const workspace = read('components/warehouse-intake-native-design.tsx')
const css = read('app/styles/warehouse-native-design.css')
const checks = [
  ['existing ERP layout and slidebar', workspace.includes('whx-intake-layout warehouse-intake-layout wh-native-workspace') && workspace.includes('whx-detail-panel warehouse-intake-panel mynh-slide-panel')],
  ['existing ERP tables and shared column controls', workspace.includes('tracking-hub-table-wrap') && workspace.includes('ManagedColumnsMenu') && workspace.includes('SortableHeader')],
  ['real Supabase orders, receiving batches, items and vouchers', page.includes("supabase.from('orders')") && page.includes("receive_batch_details(") && page.includes("order_items(") && page.includes("order_vouchers(")],
  ['purchase price before pricing form', workspace.indexOf('Đối chiếu giá mua') >= 0 && workspace.indexOf('Đối chiếu giá mua') < workspace.indexOf('Ghép SKU bán và quyết định giá')],
  ['real price missing is not zero', workspace.includes("? 'Chưa có' : formatMoney(value)")],
  ['per-item choice preview without writes', workspace.includes('setPreviewChoices') && workspace.includes('không ghi Supabase')],
  ['no old V2.1 component or migration needed', !workspace.includes('warehouse-intake-v21-workspace') && !page.includes('warehouse-item-v21')],
  ['no app server actions in preview component', !workspace.includes("from '@/lib/actions/warehouse'") && !workspace.includes('supabase.rpc(')],
  ['ResizeObserver tracks real list width and switches presentation modes',
    workspace.includes('new ResizeObserver(') && workspace.includes('width < 570') && workspace.includes('width < 950')],
  ['wide columns strictly sized by visible column weights',
    workspace.includes('columnWeights') && workspace.includes('<colgroup>') && workspace.includes('totalColumnWeight')],
  ['compact groups preserve date, warehouse, progress and COD',
    workspace.includes('renderGroupedCells') && workspace.includes('visibleColumn(\'received\')') &&
    workspace.includes('visibleColumn(\'warehouse\')') && workspace.includes('visibleColumn(\'progress\')') &&
    workspace.includes('visibleColumn(\'cod\')')],
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
    workspace.includes('new MutationObserver(adapt)') &&
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
