import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const file=path=>readFileSync(path,'utf8')
const catalog=file('components/warehouse-sku-catalog.tsx')
const page=file('app/(erp)/warehouse/skus/page.tsx')
const actions=file('lib/actions/sku-catalog.ts')
const migration=file('supabase/migrations/0078_sku_catalog_safe_merge.sql')
const intake=file('components/warehouse-inline-sku-history-picker.tsx')
const pos=file('app/(erp)/sales/pos/page.tsx')
for(const expected of [
 'Tìm mã SKU, sản phẩm hoặc phân loại','Lọc SKU theo ABC',
 'Sửa SKU','Thêm phân loại','Gộp SKU','Xem trước gộp SKU',
 'Tôi xác nhận hai phân loại sử dụng cùng đơn vị tồn kho',
 'Xác nhận mã SKU nguồn','sku-catalog-drawer'
])assert(catalog.includes(expected),'Catalog UI missing '+expected)
assert(page.includes('ERP_SKU_CATALOG_LIVE'),'Page must gate live writes')
assert(actions.includes("process.env.ERP_SKU_CATALOG_LIVE!=='true'"),
  'Server actions must reject unset preview/live write feature')
assert(actions.includes('session(true)'),'Merge must require admin')
assert(actions.includes('p_fingerprint'),'Merge must reject stale preview')
assert(intake.includes('warehouse-sku-browser'),'Inline picker must remain')
assert(pos.includes("baseQuery.eq('is_active',true)"),'POS must hide retired SKU')
for(const expected of [
 'ENABLE ROW LEVEL SECURITY','private.assert_admin()',
 'private.assert_operator()','ADJUSTMENT_OUT','ADJUSTMENT_IN',
 'sku_merge_source_unique','guard_active_sku','FOR UPDATE',
 'sale_history','pending_transfers','CATALOG_MERGE_SKU',
 'public.merge_catalog_sku','source_variant_id','fingerprint'
])assert(migration.includes(expected),'SQL contract missing '+expected)
assert(!migration.includes('DELETE FROM public.inventory_transactions'),
  'Merge must never delete stock history')
console.log('PASS: SKU catalog ABC, editing, admin merge and ledger/RLS contracts')