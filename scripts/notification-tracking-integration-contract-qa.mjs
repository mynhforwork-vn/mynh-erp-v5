import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')
const toast=read('components/tracking-success-toast.tsx')
const css=read('app/styles/tracking-compact-actions-v1.css')
const fit=read('components/desktop-table-column-resize.tsx')
const ui=read('components/in-app-alert-center.tsx')
const api=read('app/api/alerts/in-app/route.ts')
const model=read('lib/notification-order-presentation.ts')
const sql70=read('supabase/migrations/0070_persistent_failed_delivery_reminders.sql')
const sql71=read('supabase/migrations/0071_operational_system_notifications.sql')
const ci=read('.github/workflows/notification-tracking-integration-qa.yml')
let passed=0
const check=(name,good)=>{assert.ok(good,name);passed++;console.log('PASS '+name)}
check('PR80 combines receive and ship payment with 30-second confirmation',toast.includes("received&&payment?['combined']")&&toast.includes('TOAST_DURATION_MS=30_000'))
check('PR80 toast is upper right on all viewports',css.includes('position:fixed;')&&css.includes('left:auto!important')&&css.includes('right:max(14px,env(safe-area-inset-right,0px))!important')&&css.includes('right:max(10px,env(safe-area-inset-right,0px))!important'))
check('PR80 table resizes on tracking drawer',fit.includes("'.order-table-card,.account-table-card,.tracking-hub-table-wrap-v2'")&&fit.includes('Math.floor(lane.clientWidth)'))
check('PR80 table overflow has constrained floor',css.includes('min-width:max(100%,var(--tracking-table-min-width,900px))')&&css.includes('min-width:max(100%,var(--tracking-table-panel-min-width,760px))'))
check('PR79 failure reminder resists marking read',model.includes('reminder_active:reminderActive')&&ui.includes('x.reminder_active===true?false:true'))
check('PR79 follows live transport stage and keeps failed attempt in history',
  model.includes('const matchingLive=ordered.find(x=>x.type===liveStatus)')&&
  model.includes("liveStatus==='DELIVERY_FAILED'")&&
  ui.includes('khi vận chuyển lại, đơn trở về luồng vận chuyển.'))
check('PR79 system alerts share bounded GET',api.includes("supabase.rpc('get_notification_feed'")&&api.includes('p_limit:40,p_offset:0')&&ui.includes("fetch('/api/alerts/in-app?view=all&category=all&limit=40&offset=0'"))
check('SQL 0070 stages persistent failure without rewriting events',sql70.includes("or (a.alert_type='DELIVERY_FAILED'")&&!/UPDATE\s+public\.alert_events/i.test(sql70)&&!/DELETE\s+FROM\s+public\.alert_events/i.test(sql70))
check('SQL 0071 stages per-user RLS and Admin/Operator authorization',sql71.includes('enable row level security')&&sql71.includes('user_id=(select auth.uid())')&&sql71.includes("not in ('admin','operator')"))
check('SQL 0071 revokes direct table Data API writes to prevent bypass of role/incident checks',
  sql71.includes('revoke all on public.system_notification_reads from public,anon,authenticated')&&
  !/\bgrant\s+(?:all|select|insert|update|delete)\b[^;]*\bon\s+public\.system_notification_reads\b/i.test(sql71))
check('SQL 0071 refuses resolving an active source failure',sql71.includes('Lỗi vẫn tồn tại; cần xử lý nguồn lỗi trước'))
check('CI uses Preview only, no Production DB auth admin or deploy',ci.includes('npx wrangler preview --name notification-tracking-integrated-qa')&&!ci.includes('SUPABASE_SERVICE_ROLE_KEY')&&!ci.includes('preview-auth-setup')&&!ci.includes('wrangler deploy')&&!ci.includes('apply_migration'))
console.log('PR79_PR80_INTEGRATION_STATIC_QA_SUMMARY '+JSON.stringify({passed,failed:0,scope:'static/build only; JWT/SQL E2E requires isolated DB'}))
