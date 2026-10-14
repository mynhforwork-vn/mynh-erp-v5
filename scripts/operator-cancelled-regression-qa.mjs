import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const core=read('lib/actions/core.ts'),editor=read('components/order-editor-form.tsx'),orders=read('app/(erp)/orders/page.tsx'),users=read('app/(erp)/users/page.tsx')
const sql=read('scripts/sql/operator-direct-delete-20261014.sql')
let passed=0;const check=(label,v)=>{assert.ok(v,label);passed++}
for(const fn of ['deleteOrderPermanent','deleteOrdersBulkPermanent','deleteERPUserPermanent']){
  const i=core.indexOf('export async function '+fn+'('),s=core.slice(i,core.indexOf('\n}',i)+2)
  check(fn+' for operator',s.includes('await actor()')&&!s.includes('requireAdmin(role)'))
}
check('admin reset stays restricted',core.slice(core.indexOf('export async function resetERPSystemData'),core.indexOf('export async function createSystemUserAccount')).includes('requireAdmin(role)'))
check('order UI delete',orders.includes('Xóa vĩnh viễn'))
check('user UI delete',users.includes('<DeleteERPUserConfirmForm'))
check('SQL RPC guard ready',sql.includes('private.assert_operator()'))
check('cancelled retains shipment number',core.includes('const effectiveTrackingNumber=trackingNumber'))
check('cancelled retains COD',!core.includes('p_cod:cancelledByShopee?0'))
check('cancelled switches off Tracking',core.includes("current_tracking_status:'CANCELLED',tracking_enabled:false"))
check('cancelled does not clear form',!editor.includes("if(e.target.checked){setCod(0)"))
check('cancelled retains payment inputs',!editor.includes('disabled={shopeeCancelled}'))
console.log('OPERATOR_CANCELLED_REGRESSION_SUMMARY '+JSON.stringify({passed,failed:0}))
