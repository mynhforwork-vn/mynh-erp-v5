import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const src=read('lib/actions/core.ts')
const phase1=read('scripts/sql/order-direct-delete-operator-lock-20261014.sql')
const phase2=read('scripts/sql/order-direct-delete-full-lock-after-production-release-20261014.sql')
const part=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)))
const purge=part('export async function purgeEligibleArchivedOrders(', 'function normalizeRoutingKeyword(')
const order=part('export async function deleteOrderPermanent(', 'function bulkOrderIds(')
const bulk=part('export async function deleteOrdersBulkPermanent(', 'export async function purgeEligibleArchivedOrders(')
const user=part('export async function deleteERPUserPermanent(', 'export async function updateSystemUserRole(')
let passed=0
const check=(k,v)=>{assert.ok(v,k);passed++}
check('Admin only SETTINGS purge',purge.includes('requireAdmin(role)'))
check('SETTINGS purge uses safe RPC',purge.includes("supabase.rpc('delete_orders_permanent_safe'"))
check('SETTINGS purge preserves reason',purge.includes("p_reason:'Dọn đơn lưu trữ từ Cài đặt'"))
check('SETTINGS purge limits batch to 200',purge.includes('.slice(0,200)'))
check('SETTINGS purge never raw deletes',!purge.includes(".from('orders').delete()"))
check('SETTINGS purge audits count from RPC',purge.includes('deleted_count:deletedCount'))
check('SETTINGS purge detects unexpected result',purge.includes('deletedCount!==eligibleIds.length'))
check('single order safe RPC',order.includes("rpc('delete_orders_permanent_safe'"))
check('bulk order safe RPC',bulk.includes("rpc('delete_orders_permanent_safe'"))
check('single User safe RPC',user.includes("rpc('delete_erp_user_permanent'"))
for(const table of ['orders','erp_users']){
  check(table+' phase1 no Operator raw delete',phase1.includes('ALTER POLICY '+table+'_delete ON public.'+table))
  check(table+' phase2 revoke',phase2.includes('REVOKE DELETE ON TABLE public.'+table))
  check(table+' phase2 drop policy',phase2.includes('DROP POLICY '+table+'_delete ON public.'+table))
}
check('phase1 does not revoke Admin delete before release',!phase1.includes('REVOKE DELETE'))
check('phase2 not automatically executed',!read('.github/workflows/qa-cancel-mapping-contract.yml').includes('psql'))
console.log('HARD_DELETE_GATE_QA_SUMMARY '+JSON.stringify({passed,failed:0}))
