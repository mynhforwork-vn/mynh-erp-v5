import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = read('supabase/migrations/0075_warehouse_item_intake_v21.sql')
const actions = read('lib/actions/warehouse-item-v21.ts')
const oldActions = read('lib/actions/warehouse.ts')
const page = read('app/(erp)/warehouse/receive/page.tsx')
const workspace = read('components/warehouse-intake-v21-workspace.tsx')
const css = read('app/styles/warehouse-item-v21.css')
const pos = read('app/(erp)/sales/pos/page.tsx')
const inventory = read('app/(erp)/warehouse/inventory/page.tsx')

const checks = [
  ['legacy receipt status preserved', /warehouse_status in \('WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED'\)/i.test(sql)],
  ['item-level state and skip reason', /warehouse_item_status text not null default 'PENDING'/i.test(sql) && /warehouse_item_skip_reason/i.test(sql)],
  ['exactly-once stock ledger index', /create unique index if not exists inventory_one_purchase_receipt_per_order_item_v21/i.test(sql)],
  ['legacy RPC guarded against partial processing', /create or replace function private\.receive_orders_into_warehouse_impl/i.test(sql) && /warehouse_item_status<>'PENDING'/i.test(sql)],
  ['direct row-status writes restricted by trigger', /guard_warehouse_item_state_v21/.test(sql) && /current_user<>'postgres'/.test(sql)],
  ['direct purchase receipt insertion protected', /guard_direct_purchase_receipt_v21/.test(sql)],
  ['completed row deletes protected', /guard_completed_warehouse_item_delete_v21/.test(sql)],
  ['new RPC performs operator authorization', (sql.match(/perform private\.assert_operator\(\);/g) ?? []).length >= 3],
  ['transactionally stored audit', sql.includes("'UPDATE_SALE_PRICE'") && sql.includes("'SKIP_WAREHOUSE_ITEM'")],
  ['existing SKU global price has stale check', /v_old_price is distinct from p_expected_sale_price/i.test(sql)],
  ['create new SKU cannot overwrite old catalog entry', /on conflict\(sku\) do nothing/i.test(sql)],
  ['no delete or truncate in migration', !/^\s*(delete\s+from|truncate\s+table|drop\s+table)\b/im.test(sql)],
  ['server actions use new RPCs', actions.includes("rpc('map_warehouse_order_item_v21'") && actions.includes("rpc('process_warehouse_order_items_v21'")],
  ['legacy map and skip no longer direct write', !/\.upsert\(/.test(oldActions.slice(oldActions.indexOf('export async function mapWarehouseOrderItem'), oldActions.indexOf('export async function receiveOrdersIntoWarehouse'))) &&
    oldActions.includes('processWarehouseItemsV21(payload)')],
  ['live orders and receipt batches from Supabase, no fixture data', page.includes("supabase.from('orders')") && page.includes("receive_batch_details(") && page.includes("order_items(") && page.includes("erp_users(username)")],
  ['shared Warehouse right slidebar structure', workspace.includes('whx-intake-layout warehouse-intake-layout wiv21-workspace') && workspace.includes('whx-detail-panel mynh-slide-panel wiv21-panel') && workspace.includes('whx-panel-tabs wiv21-panel-tabs') && workspace.includes('whx-panel-scroll wiv21-panel-body')],
  ['Desktop table reserves shared 400px panel, Mobile uses shared overlay', css.includes('var(--mynh-panel-width,400px)') && css.includes('@media(max-width:900px)')],
  ['missing source price is never auto-zeroed', workspace.includes("? 'Chưa có' : formatMoney(value)") && workspace.includes("sourceTotal(")],
  ['read-only pre-migration Preview', page.includes('const schemaReady = !probe.error') && workspace.includes('disabled={!schemaReady || !canOperate || busy}')],
  ['purchase original and discounted price visible', workspace.includes('focused.original_price') && workspace.includes('focused.final_price')],
  ['per-item decisions with reason', workspace.includes("action: 'IN' | 'SKIP'") && workspace.includes('Lý do bỏ qua')],
  ['POS still reads sale_price from catalog', pos.includes("select('id,sale_price,barcode')")],
  ['warehouse inventory still derives from ledger', inventory.includes("from('inventory_transactions')")],
]

for (const [name, ok] of checks) {
  assert.equal(ok, true, 'FAIL: ' + name)
  console.log('PASS: ' + name)
}
console.log('Warehouse V2.1 static contracts: ' + checks.length + ' / ' + checks.length + ' PASS')
