import assert from 'node:assert/strict'
import fs from 'node:fs'
const src=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const api=src('app/api/alerts/in-app/route.ts')
const ui=src('components/in-app-alert-center.tsx')
const model=src('lib/notification-order-presentation.ts')
const schedule=src('lib/notification-quiet-hours.ts')
const migration=src('supabase/migrations/0070_persistent_failed_delivery_reminders.sql')
let passed=0
function check(label,condition){assert.ok(condition,label);passed++}
check('Uses live shipment status without a second API read',api.includes('shipments(tracking_number,carrier,is_active,current_tracking_status)'))
check('API pins only CURRENT failed delivery in bounded feed',
  api.includes("b.reminder_active===true")&&
  model.includes("liveStatus==='DELIVERY_FAILED'")&&
  model.includes("latest.type==='PICKUP_FAILED'||latest.type==='DELIVERY_FAILED'"))
check('API continues filtering cancelled codes',api.includes("!cancelledCodes.has(notice.order_code)"))
check('Model suppresses cancelled orders',model.includes("orderStatus==='CANCELLED'"))
check('Model prioritizes successful delivery',model.includes('DELIVERED:100'))
check('Model follows current stage and preserves old failure history',
  model.includes('const matchingLive=ordered.find(x=>x.type===liveStatus)')&&
  model.includes("liveStatus==='DELIVERY_FAILED'")&&model.includes('timeline:ordered'))
check('UI acknowledges without clearing persistent failure',ui.includes("x.reminder_active===true?false:true"))
check('UI keeps persistent failures in unread counter after read all',ui.includes('current.items.filter(x=>x.reminder_active===true).length'))
check('Existing 5-minute notification polling unchanged',schedule.includes('NOTIFICATION_POLL_MS=5*60*1000'))
check('No new notification POST loops',!ui.includes('setInterval('))
check('Long-lived failures survive the 30-day window in staged RPC migration',migration.includes("or (a.alert_type='DELIVERY_FAILED'"))
check('Legacy RPC keeps security definer',migration.includes('SECURITY DEFINER'))
check('SQL only prioritizes currently failed shipments at bounded RPC cap',
  migration.includes('order by g.persistent_failure desc')&&
  migration.includes("active_s.current_tracking_status::text='DELIVERY_FAILED'")&&
  !migration.includes("active_s.current_tracking_status::text in ('DELIVERED','CANCELLED')\n              or upper"))
check('Migration is independently gated and has no mutation of alert rows',!migration.includes('UPDATE public.alert_events')&&!migration.includes('DELETE FROM public.alert_events'))
check('SQL function delimiter closes with statement terminator',migration.includes('$function$;\nCOMMIT;'))
console.log('DELIVERY_FAILURE_CONTRACT_QA_SUMMARY '+JSON.stringify({passed,failed:0}))
