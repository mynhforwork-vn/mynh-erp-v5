import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

const out=path.join(mkdtempSync(path.join(os.tmpdir(),'sku-history-')),'history.mjs')
await build({
  entryPoints:[path.join(process.cwd(),'lib/warehouse-sku-suggestions.ts')],
  outfile:out,bundle:true,format:'esm',platform:'node',target:'node22',
})
const {indexHistoricalSkuMappings,suggestSkusFromHistory}=await import(pathToFileURL(out).href)
const base=(id,orderId,variantId='SKU-1',sku='MUA-165',name='Sữa đặc  Ông Thọ 165g',classification='Tuýp')=>({
  id,order_id:orderId,sku,product_name:name,variant:classification,
  product_variant_id:variantId,inventory_multiplier:2,
  created_at:'2026-11-01T10:00:00Z',
  product_variants:{
    id:variantId,variant_name:'Mẫu',
    products:{sku:variantId, name:variantId==='SKU-1'?'Sữa đặc bán':'Sản phẩm bán khác'}
  }
})
const mappings=[
  base('old-1','order-old-1'),
  {...base('old-2','order-old-2'),created_at:'2026-11-03T10:00:00Z'},
  {...base('old-3','order-old-3'),inventory_multiplier:1},
  {...base('other','order-other','SKU-2'),inventory_multiplier:1},
  {...base('wrong','order-wrong','SKU-3','DIFFERENT'),inventory_multiplier:6},
  {...base('self','order-target','SKU-4'),inventory_multiplier:3},
  {...base('bad','order-bad','SKU-5'),product_variants:null},
]
const index=indexHistoricalSkuMappings(mappings)
const target={id:'new',order_id:'order-target',sku:' mua-165 ',product_name:'Sữa đặc Ông Thọ 165g',variant:'Tuýp'}
const matches=suggestSkusFromHistory(target,index)
assert.deepEqual(matches.map(x=>x.variant_id),['SKU-1','SKU-2'],
  'rank recurring valid matches, do not confuse other purchase SKU or current order')
assert.equal(matches[0].history_count,3,'count distinct historically matched orders')
assert.equal(matches[0].multiplier,2,'suggest most frequent historical conversion')
assert.equal(matches[0].match_kind,'exact')
assert.equal(matches[1].history_count,1,'show alternative, never silently discard conflicting mapping')
assert.equal(suggestSkusFromHistory(target,index,1).length,1,'respect top-N limit')
assert.equal(suggestSkusFromHistory({...target,sku:'DIFFERENT'},index).length,1,
  'different purchase SKU must exclude incompatible candidate')
assert.equal(suggestSkusFromHistory({...target,sku:null},index).length,3,
  'missing purchase SKU can show several prior name-and-variant matches without choosing one')
assert.equal(suggestSkusFromHistory({...target,product_name:'Không khớp',sku:null},index).length,0,
  'no guessed SKU without historical match')
assert.equal(suggestSkusFromHistory({...target,variant:'Hộp'},index).length,0,
  'variant mismatch cannot recommend a different packaging')
assert.equal(suggestSkusFromHistory({...target,order_id:'order-old-1'},index)[0].history_count,2,
  'exclude all same-order mappings to avoid self-reference')
const unique=suggestSkusFromHistory({...target,sku:'MUA-165',product_name:'Tên mua đổi',variant:'Tuýp'},index)
assert.equal(unique[0].match_kind,'sku_variant','matching exact SKU+variant can tolerate renamed listing')
assert.equal(unique[0].history_count,3)
const unaffected=JSON.stringify(mappings)
suggestSkusFromHistory(target,index)
assert.equal(JSON.stringify(mappings),unaffected,'history suggestion builder is side-effect-free')
console.log('PASS historical SKU matching · normalization · frequency · conflicting SKU · exclusion · no auto-write')
