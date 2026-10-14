/** Kiểm tra hợp đồng thao tác User/Auto Fit, không truy cập hoặc ghi dữ liệu thật. */
import fs from 'node:fs'
import assert from 'node:assert/strict'

const read=path=>fs.readFileSync(path,'utf8')
const server=read('lib/actions/core.ts')
const inline=read('components/erp-user-inline-form.tsx')
const accounts=read('app/(erp)/users/page.tsx')
const linkedUser=read('components/order-account-detail-panel.tsx')
const accountTable=read('components/purchase-account-table.tsx')
const manager=read('components/desktop-table-column-resize.tsx')
const qa=read('scripts/purchase-accounts-real-autofit-qa.mjs')
const filter=read('components/erp-account-filter-form.tsx')
const bulkImport=read('components/user-bulk-import.tsx')
const tests=[
 ['All User mutations preserve direct server actions and RBAC',()=>{
   for(const name of ['createERPUser','updateERPUser','archiveERPUser','restoreERPUser','archiveERPUsersBulk','restoreERPUsersBulk'])
     assert.match(server,new RegExp('export async function '+name+'\\(formData:FormData\\)'))
   assert.match(server,/async function actor\(\)/)
   assert.match(server,/\['admin','operator'\]/)
 }],
 ['Client inline mutation covers all User actions without document navigation',()=>{
   for(const action of ['create','update','archive','restore','archiveBulk','restoreBulk'])
     assert.ok(inline.includes("'"+action+"'"))
   assert.match(inline,/useActionState\(submitERPUserInline,initial\)/)
   assert.match(inline,/router\.replace\(state\.href,\{scroll:false\}\)/)
   assert.doesNotMatch(inline,/(?:window\.|location\.)reload\(/)
   assert.match(server,/formData\.set\('inline_submit','1'\)/)
 }],
 ['Account, order-context, bulk forms all use inline',()=>{
   for(const action of ['create','update','archive','restore'])
     assert.ok(accounts.includes('<ERPUserInlineForm operation="'+action+'"'))
   assert.ok(linkedUser.includes('<ERPUserInlineForm operation="update"'))
   for(const action of ['archiveBulk','restoreBulk'])
     assert.ok(accountTable.includes('<ERPUserInlineForm operation="'+action+'"'))
 }],
 ['Preserve data validation and return path for update',()=>{
   assert.match(server,/if\(!userId\)throw new Error\('Thiếu tài khoản cần cập nhật'\)/)
   assert.match(server,/rpc\('update_erp_user_full'/)
   assert.match(server,/returnToOrders/)
   assert.match(server,/revalidatePath\('\/purchase\/accounts'\)/)
 }],
 ['Account lane fit is remeasured after hydration and when panes are replaced',()=>{
   assert.match(accountTable,/ResizeObserver\(measure\)/)
   assert.match(accountTable,/mynh-account-fit-changed/)
   assert.match(manager,/observedPanes=new WeakSet<Element>\(\)/)
   assert.match(manager,/paneResize\.observe\(pane\)/)
   assert.match(manager,/trackingLayout\.delete\(table as HTMLTableElement\)/)
   assert.match(manager,/window\.addEventListener\('mynh-account-fit-changed',refitAccount\)/)
 }],
 ['Account Auto Fit follows Purchase Orders semantic lane and safe width profile',()=>{
   assert.match(manager,/const orderFit=\(table:HTMLTableElement,ths:HTMLTableCellElement\[\],saved:Record<string,number>\)=>/)
   assert.match(manager,/const accountFit=\(\)=>/)
   assert.match(manager,/const compact=withPanel\|\|lane<1200/)
   assert.match(manager,/const target=Math\.max\(minimum,lane-2\)/)
   assert.match(manager,/if\(i<0\|\|customized\[i\]\|\|spare>=0\)continue/)
   assert.match(manager,/if\(i<0\|\|customized\[i\]\|\|spare<=0\)continue/)
   assert.match(manager,/const assigned = isOrder\?orderFit\(table,ths,overrides\)/)
   assert.match(manager,/isAccount \? accountFit\(\)/)
   assert.match(manager,/col\.style\.setProperty\('width',width\+'px','important'\)/)
   assert.match(manager,/table\.style\.setProperty\('width', total\+'px', 'important'\)/)
 }],
 ['Account filters and TSV imports never reload the document',()=>{
   assert.match(accounts,/<ERPAccountFilterForm/)
   assert.match(filter,/event\.preventDefault\(\)/)
   assert.match(filter,/router\.push\('\/purchase\/accounts'/)
   assert.match(filter,/scroll:false/)
   assert.doesNotMatch(bulkImport,/router\.refresh\(/)
   assert.doesNotMatch(bulkImport,/(?:window\.|location\.)reload\(/)
 }],
 ['Auto Fit QA checks 0 and 1 slidebar and both left sidebar states',()=>{
   assert.doesNotMatch(qa,/2 right panels opened|with-two-panels/)
   assert.match(qa,/order replaces User in one right panel/)
   assert.match(qa,/left collapsed/)
   assert.match(qa,/left expanded/)
   assert.match(qa,/s\.table>=s\.lane-8/)
 }]
]
let failures=0
for(const [name,fn] of tests){
  try{fn();console.log('PASS '+name)}
  catch(e){failures++;console.error('FAIL '+name, String(e))}
}
console.log('ACCOUNT_INLINE_FIT_QA_SUMMARY '+JSON.stringify({passed:tests.length-failures,failed:failures}))
assert.equal(failures,0)
