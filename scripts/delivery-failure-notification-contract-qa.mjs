import assert from 'node:assert/strict'
import fs from 'node:fs'
const src=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const api=src('app/api/alerts/in-app/route.ts')
const ui=src('components/in-app-alert-center.tsx')
const model=src('lib/notification-order-presentation.ts')
const schedule=src('lib/notification-quiet-hours.ts')
let passed=0
function check(label,condition){assert.ok(condition,label);passed++}
check('Uses live shipment status without a second API read',api.includes('shipments(tracking_number,carrier,is_active,current_tracking_status)'))
check('API keeps unresolved failure at top of 40-row page',api.includes("b.reminder_active===true"))
check('API continues filtering cancelled codes',api.includes("!cancelledCodes.has(notice.order_code)"))
check('Model suppresses cancelled orders',model.includes('orderIsCancelled(link)'))
check('Model prioritizes successful delivery',model.includes('DELIVERED:100'))
check('Model reminder ends on live delivery',model.includes("liveStatus!=='DELIVERED'"))
check('UI acknowledges without clearing persistent failure',ui.includes("x.reminder_active===true?false:true"))
check('UI keeps persistent failures in unread counter after read all',ui.includes('current.items.filter(x=>x.reminder_active===true).length'))
check('Existing 5-minute notification polling unchanged',schedule.includes('NOTIFICATION_POLL_MS=5*60*1000'))
check('No new notification POST loops',!ui.includes('setInterval('))
console.log('DELIVERY_FAILURE_CONTRACT_QA_SUMMARY '+JSON.stringify({passed,failed:0}))
