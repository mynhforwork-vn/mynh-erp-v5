// P1 Purchase contract — read-only and deterministic. Does not need a browser.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {normalizeLegacyVisibleColumns,normalizeLegacyColumnOrder} from '../lib/table-column-preferences.ts'
import {accountDeviceFields} from '../lib/purchase-account-device-fields.ts'
import {trackingNumberMeansCancelled,orderIsCancelled} from '../lib/purchase-order-cancellation.ts'
const cols=['number','order','username','device','time','product','cod','tracking','voucher','status']
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
 // Legacy combined device rows and new independent slots display consistently.
 assert.deepEqual(accountDeviceFields({all_devices:[{
   device_key:'manual-primary',device_name:'Samsung S30',
   device_type:'DESKTOP',browser_name:'Chrome',is_active:true
 }]}),{mobileType:'Samsung S30',browserName:'Chrome'})
 assert.deepEqual(accountDeviceFields({all_devices:[
   {device_key:'manual-primary',device_name:'Samsung S30',device_type:'DESKTOP',browser_name:'Chrome',is_active:false},
   {device_key:'manual-mobile',device_name:'iPhone 15',device_type:'MOBILE',is_active:true},
   {device_key:'manual-browser',device_name:'Safari',device_type:'BROWSER_PROFILE',browser_name:'Safari',is_active:true},
 ]}),{mobileType:'iPhone 15',browserName:'Safari'})
 const account=fs.readFileSync('components/purchase-account-table.tsx','utf8')
 const order=fs.readFileSync('components/purchase-order-table.tsx','utf8')
 assert.ok(account.includes("const STORAGE_KEY='mynh-v5-purchase-account-columns'"))
 assert.ok(account.includes("const STORAGE_ORDER_KEY='mynh-v5-purchase-account-column-order'"))
 assert.ok(order.includes("const STORAGE_COLUMNS='mynh-v5-purchase-order-columns'"))
 assert.ok(order.includes("const STORAGE_COLUMN_ORDER='mynh-v5-purchase-order-column-order'"))
 assert.match(account,/className="table user-table mynh-p1-semantic-table"/)
 assert.ok(account.includes("mobile:'Mobile',browser:'Browser'"))
 assert.ok(!account.includes('DeviceIcons'))
 const core=fs.readFileSync('lib/actions/core.ts','utf8')
 const accountPage=fs.readFileSync('app/(erp)/users/page.tsx','utf8')
 for(const slot of ['manual-mobile','manual-browser'])assert.ok(core.includes(slot))
 for(const field of ['mobile_device_type','browser_name'])assert.ok(accountPage.includes('name="'+field+'"'))
 assert.ok(!accountPage.includes('name="device_name"'))
 assert.ok(!accountPage.includes('name="browser_profile"'))
 assert.match(order,/className="table order-table mynh-p1-semantic-table"/)
 assert.ok(account.includes('<colgroup>')&&order.includes('<colgroup>'))
 assert.ok(account.includes('--p1-account-panel-min-width'))
 assert.ok(order.includes('--p1-order-panel-min-width'))
}],
['Tracking sentinel is cancelled without guessing other missing values',()=>{
 assert.equal(trackingNumberMeansCancelled('  KHÔNG   CÓ  '),true)
 assert.equal(trackingNumberMeansCancelled('SPXVN123'),false)
 assert.equal(trackingNumberMeansCancelled(null),false)
 assert.equal(orderIsCancelled({order_status:'PROCESSING',shipments:[{tracking_number:'KHÔNG CÓ',is_active:true,current_tracking_status:'READY_TO_SHIP'}]}),true)
 assert.equal(orderIsCancelled({order_status:'PROCESSING',shipments:[{tracking_number:null,is_active:true}]}),false)
 const order=fs.readFileSync('components/purchase-order-table.tsx','utf8')
 assert.ok(order.includes("tracking:'Vận chuyển'"))
 assert.ok(!order.includes("carrier:'ĐVVC'"))
 assert.ok(order.includes('M:')&&order.includes('B:'))
 const core=fs.readFileSync('lib/actions/core.ts','utf8')
 assert.ok(core.includes("const orderStatus=cancelledByMarker?'CANCELLED'"))
 assert.ok(core.includes("if(data&&trackingNumber&&!isExpress&&!cancelledByMarker)"))
}],
['Cancelled no-MVĐ cannot reach in-app alerts or carrier probe, retired Telegram endpoint',()=>{
 const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
 const dispatcher=fs.readFileSync('supabase/functions/tracking-dispatcher/index.ts','utf8')
 const telegram=fs.readFileSync('supabase/functions/telegram-alert-dispatcher/index.ts','utf8')
 const css=fs.readFileSync('app/styles/tracking-compact-actions-v1.css','utf8')
 assert.match(api,/cancelledCodes\.has\(notice\.order_code\)/)
 assert.match(api,/filter\(order=>!orderIsCancelled\(order\)\)/)
 assert.match(dispatcher,/if\(cancelledPlaceholder\(job\.tracking_number\)\)/)
 assert.match(dispatcher,/if\(cancelledPlaceholder\(body\.test_tracking_number\)\)/)
  assert.match(telegram,/status:410/)
  assert.ok(!telegram.includes('api.telegram.org')&&!telegram.includes('sendMessage('))
 assert.match(css,/\.brand-shell-v1\.desktop-sidebar-collapsed \.tracking-success-toast-stack/)
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
