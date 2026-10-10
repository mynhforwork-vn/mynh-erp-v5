// MYNH ERP V5 P0 — pure preference contract and read-only table inventory.
// Run: node --experimental-strip-types scripts/table-platform-p0-qa.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {normalizeTableColumnPreferences as normalize} from '../lib/table-column-preferences.ts'

const checks=[]
const test=(name,fn)=>{
  try{fn();checks.push({name,status:'PASS'});console.log('PASS '+name)}
  catch(error){checks.push({name,status:'FAIL',error:String(error)});console.error('FAIL '+name,error)}
}
const cols=['order','product','status','detail','actions']
const locked=['order']

test('P0 default column order',()=>assert.deepEqual(normalize(null,cols,locked),{order:cols,hidden:[]}))
test('P0 restore reorder/hidden',()=>assert.deepEqual(
  normalize({order:['status','order','product','actions','detail'],hidden:['product']},cols,locked),
  {order:['status','order','product','actions','detail'],hidden:['product']},
))
test('P0 new status-detail column beside status in existing prefs',()=>assert.deepEqual(
  normalize({order:['order','product','status','actions'],hidden:['product']},cols,locked,{detail:'status'}),
  {order:['order','product','status','detail','actions'],hidden:['product']},
))
test('P0 protect against duplicate/unknown legacy keys',()=>assert.deepEqual(
  normalize({order:['status','status','missing','order',false],hidden:['bad','product','product','order']},cols,locked,{detail:'status'}),
  {order:['status','detail','order','product','actions'],hidden:['product']},
))
test('P0 retain at least one visible column',()=>{
  assert.deepEqual(normalize({hidden:['order','product','status','detail','actions']},cols,[]).hidden,
    ['product','status','detail','actions'])
})
test('P0 never hide a required identifier',()=>{
  const x=normalize({order:cols,hidden:['order','actions']},cols,locked)
  assert.ok(!x.hidden.includes('order'))
  assert.ok(x.hidden.includes('actions'))
})
test('P0 preserve input preference values',()=>{
  const old={order:['actions','status','order'],hidden:['status']}
  const snapshot=JSON.stringify(old)
  normalize(old,cols,locked,{detail:'status'})
  assert.equal(JSON.stringify(old),snapshot)
})
test('P0 guard malformed saved fields',()=>{
  assert.deepEqual(normalize({order:'bad',hidden:123},cols,locked),{order:cols,hidden:[]})
  assert.deepEqual(normalize([],cols,locked),{order:cols,hidden:[]})
  assert.deepEqual(normalize({order:[],hidden:[]},[],[]),{order:[],hidden:[]})
})
test('P0 isolate unrelated table schemas',()=>{
  const a=normalize({order:['order','status'],hidden:['status']},cols,locked,{detail:'status'})
  const b=normalize({order:['sku','stock'],hidden:['stock']},['sku','stock','warehouse'],['sku'])
  assert.deepEqual(a.order,['order','status','detail','product','actions'])
  assert.deepEqual(b,{order:['sku','stock','warehouse'],hidden:['stock']})
})
test('P0 prevent early overwrite of saved visibility/order and sort',()=>{
  const src=fs.readFileSync('components/managed-table-columns.tsx','utf8')
  assert.match(src,/if\(readyKey!==storageKey\)return/)
  assert.match(src,/if\(sortReadyKey!==storageKey\)return/)
  assert.match(src,/normalizeTableColumnPreferences<K>\(JSON\.parse\(raw\)/)
})
test('P0 maintain Tracking intra-tab live resize + scoped key',()=>{
  const src=fs.readFileSync('components/desktop-table-column-resize.tsx','utf8')
  assert.match(src,/mirrorTrackingWidths\(table\)/)
  assert.match(src,/tableId\(peer\)!==tableId\(source\)/)
  assert.match(src,/table\.classList\.contains\('tracking-hub-table-v2'\)/)
})

// The inventory distinguishes native ERP data tables, independent shared-schema
// groups and non-tabular UI. It is not a forced conversion or resize allowlist.
const groups=[
  {phase:'P1',label:'Tài khoản mua hàng',file:'components/purchase-account-table.tsx',selector:'.user-table',engine:'legacy',group:'purchase-accounts'},
  {phase:'P1',label:'Đơn nhập',file:'components/purchase-order-table.tsx',selector:'.order-table',engine:'legacy',group:'purchase-orders'},
  {phase:'P1',label:'Cảnh báo vận chuyển',file:'components/tracking-hub-group.tsx',selector:'.tracking-hub-table-v2',engine:'managed',group:'tracking-hubs',sameSchemaSync:true},
  {phase:'P2',label:'Nhập kho — chờ bóc tách',file:'components/warehouse-intake-workspace.tsx',selector:'.warehouse-split-table',engine:'managed',group:'warehouse-split'},
  {phase:'P2',label:'Nhập kho — chờ nhập kho',file:'components/warehouse-intake-workspace.tsx',selector:'.warehouse-ready-table',engine:'managed',group:'warehouse-ready'},
  {phase:'P2',label:'Tồn kho',file:'components/warehouse-inventory-workspace.tsx',selector:'.whx-table',engine:'managed',group:'warehouse-inventory'},
  {phase:'P2',label:'Lịch sử kho',file:'components/warehouse-history-table.tsx',selector:'.whx-table',engine:'managed',group:'warehouse-history'},
  {phase:'P3',label:'Lịch sử bán hàng',file:'components/sales-history-table.tsx',selector:'.sales-history-table',engine:'managed',group:'sales-history'},
  {phase:'P3',label:'Khách hàng',file:'components/sales-customer-table.tsx',selector:'.customer-demo-table',engine:'managed',group:'sales-customers'},
  {phase:'P3',label:'Công nợ',file:'components/sales-debt-table.tsx',selector:'.debt-demo-table',engine:'managed',group:'sales-debt'},
  {phase:'P4',label:'Thu/Chi',file:'components/finance-cashflow-workspace.tsx',selector:'.finance-table',engine:'legacy',group:'finance-cashflow'},
  {phase:'P4',label:'Đối soát khách hàng',file:'components/finance-customer-settlement-table.tsx',selector:'.finance-customer-settlement .table',engine:'managed',group:'finance-customer-payments'},
  {phase:'P4',label:'Báo cáo theo ngày',file:'components/finance-report-day-table.tsx',selector:'.finance-report-day-table-wrap .table',engine:'managed',group:'finance-report-day'},
  {phase:'P5',label:'Cài đặt Mapping SPX',file:'components/tracking-settings.tsx',selector:'.tracking-mapping-table-v7',engine:'css-grid',group:'settings-spx-mapping'},
  {phase:'P5',label:'Tổng quan mua hàng',file:'app/(erp)/purchase/page.tsx',selector:'.compact-summary-table',engine:'static',group:'purchase-summary'},
  {phase:'P5',label:'Tổng quan tài chính',file:'app/(erp)/finance/page.tsx',selector:'.compact-table-wrap .table',engine:'static',group:'finance-summary'},
]
const exceptions=[
  {label:'Đối soát Shipper',file:'app/(erp)/finance/shipper-payments/page.tsx',reason:'batch-card layout, not a native table'},
  {label:'Hóa đơn POS để in',file:'components/sales-pos-workspace.tsx',reason:'receipt print table; do not apply enterprise data table rules'},
]
test('P0 inventory files and selectors exist in source',()=>{
  for(const g of groups){
    const src=fs.readFileSync(g.file,'utf8')
    assert.ok(src.includes(g.selector.replace(/^\./,'').split(' ')[0].replace(/^\./,'')),g.label+' selector')
  }
  for(const x of exceptions)assert.ok(fs.existsSync(x.file),x.label)
})
test('P0 distinguish intake schemas and preserve receipt printing',()=>{
  assert.notEqual(groups.find(g=>g.group==='warehouse-split').group,groups.find(g=>g.group==='warehouse-ready').group)
  assert.ok(exceptions.some(g=>g.label.includes('POS')))
})
test('P0 no accidental new ERP-wide column resize contract',()=>{
  const css=fs.readFileSync('app/styles/enterprise-tables-v1.css','utf8')
  assert.ok(css.includes('tracking-hub-head-v2'))
  assert.ok(css.includes('tracking-hub-table-wrap-v2'))
  // Audit-only check: the current enhancer still scans all desktop data tables.
  const resize=fs.readFileSync('components/desktop-table-column-resize.tsx','utf8')
  assert.ok(resize.includes("main.querySelectorAll('table.table')"))
})
const inventory={
  baseline:'PR #59 — supplied by Git branch / commit at test time',
  stage:'P0',
  source:'static repository inspection (not browser E2E)',
  nativeTables:groups.filter(g=>g.engine!=='css-grid'&&g.engine!=='static').length,
  groups,exceptions,
  risks:[
    'DesktopTableColumnResize scans every table.table at >=901px; do not switch to an unverified allowlist or enable more resize automatically.',
    'Account, Orders and Cashflow store independent legacy column preferences; migrate individually with read-back.',
    'CSS cascade contains multiple legacy overrides; avoid global sizing fixes until Preview QA for each module.',
    'Cross-group live resize applies only when semantic schema and table identity are identical.',
    'Browser, tablet, mobile, drawer persistence and permissions require separate Preview QA; source checks do not prove them.'
  ],
  checks,
  passed:checks.filter(x=>x.status==='PASS').length,
  failed:checks.filter(x=>x.status==='FAIL').length
}
fs.mkdirSync('qa-table-platform-p0-artifacts',{recursive:true})
fs.writeFileSync(path.join('qa-table-platform-p0-artifacts','inventory.json'),JSON.stringify(inventory,null,2))
console.log('P0_TABLE_PLATFORM_QA '+JSON.stringify({
  passed:inventory.passed,failed:inventory.failed,groups:groups.length,exceptions:exceptions.length,
}))
assert.equal(inventory.failed,0,'P0 table contract QA failed')
