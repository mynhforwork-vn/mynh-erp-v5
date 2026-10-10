// P1 Purchase contract — read-only and deterministic. Does not need a browser.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {normalizeLegacyVisibleColumns,normalizeLegacyColumnOrder} from '../lib/table-column-preferences.ts'
const cols=['number','order','username','time','product','cod','tracking','carrier','voucher','status']
const tests=[
['Legacy Order preserves required ID',()=>{
 assert.deepEqual(normalizeLegacyVisibleColumns(['status','status','missing'],cols,['order']),['order','status'])
}],
['Legacy Order preserves user reorder while discarding duplicates',()=>{
 assert.deepEqual(normalizeLegacyColumnOrder(['status','status','order','missing'],cols).slice(0,2),['status','order'])
}],
['Legacy User locked username and safe defaults',()=>{
 const cols=['username','status','phone']
 assert.deepEqual(normalizeLegacyVisibleColumns(['status'],cols,['username']),['username','status'])
 assert.deepEqual(normalizeLegacyVisibleColumns('invalid',cols,['username']),cols)
}],
['P1 CSS scoped to Purchase only',()=>{
 const css=fs.readFileSync('app/styles/p1-purchase-tables.css','utf8')
 assert.match(css,/\.order-table-card/)
 assert.match(css,/\.account-table-card/)
 assert.match(css,/table\.table\.user-table/)
 assert.match(css,/table\.table\.order-table/)
 assert.ok(!/tracking-hub-head-v2|warehouse-intake-layout/.test(css))
}],
['P1 legacy preference identifiers unchanged',()=>{
 const account=fs.readFileSync('components/purchase-account-table.tsx','utf8')
 const order=fs.readFileSync('components/purchase-order-table.tsx','utf8')
 assert.ok(account.includes("const STORAGE_KEY='mynh-v5-purchase-account-columns'"))
 assert.ok(account.includes("const STORAGE_ORDER_KEY='mynh-v5-purchase-account-column-order'"))
 assert.ok(order.includes("const STORAGE_COLUMNS='mynh-v5-purchase-order-columns'"))
 assert.ok(order.includes("const STORAGE_COLUMN_ORDER='mynh-v5-purchase-order-column-order'"))
 assert.ok(account.includes("className=\"table user-table\""))
 assert.ok(order.includes("className=\"table order-table\""))
}],
['P1 existing business actions retained',()=>{
 const order=fs.readFileSync('components/purchase-order-table.tsx','utf8')
 const account=fs.readFileSync('components/purchase-account-table.tsx','utf8')
 for(const fn of ['archiveOrdersBulk','restoreOrdersBulk','quickAddTrackingNumber'])assert.ok(order.includes(fn))
 for(const fn of ['archiveERPUsersBulk','restoreERPUsersBulk'])assert.ok(account.includes(fn))
}],
]
let fail=0
for(const[name,fn]of tests)try{fn();console.log('PASS '+name)}catch(e){fail++;console.error('FAIL '+name,String(e))}
console.log('P1_STATIC_QA '+JSON.stringify({passed:tests.length-fail,failed:fail}))
assert.equal(fail,0,'P1 contract regression failed')
