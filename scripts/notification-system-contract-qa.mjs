import assert from 'node:assert/strict'
import fs from 'node:fs'
const r=p=>fs.readFileSync(p,'utf8')
const sql=r('supabase/migrations/0071_operational_system_notifications.sql')
const ui=r('components/in-app-alert-center.tsx')
const api=r('app/api/alerts/in-app/route.ts')
const css=r('app/styles/notification-neo-soft-a.css')
let passed=0
function check(label,condition){assert.ok(condition,label);console.log('PASS '+label);passed++}
check('Failed carrier sync source',sql.includes("'TRACKING_SYNC_FAILED'")&&sql.includes("l.result='FAILED'"))
check('Unmapped last status source',sql.includes("'TRACKING_UNMAPPED_STATUS'")&&sql.includes("e.normalized_status::text='UNKNOWN'"))
check('Latest active cron failure',sql.includes("'TRACKING_CRON_FAILED'")&&sql.includes("c.status='failed'")&&sql.includes('j.active=true'))
check('Recovered delivery or cancellation excluded',sql.includes("not in ('DELIVERED','CANCELLED','RETURNED')")&&sql.includes("'KHÔNG CÓ'"))
check('System feed RPC implemented',sql.includes('public.get_notification_feed('))
check('Read one/all and resolve RPCs implemented', ['mark_system_notification_read','mark_all_system_notifications_read','resolve_system_notification'].every(v=>sql.includes('public.'+v+'(')))
check('Role gate and read RLS',sql.includes("coalesce(public.current_erp_role(),'') not in ('admin','operator')")&&sql.includes('user_id=(select auth.uid())'))
const rpcOnly=sql.includes('revoke all on public.system_notification_reads from public,anon,authenticated')&&
  !/\bgrant\s+(?:all|select|insert|update|delete)\b[^;]*\bon\s+public\.system_notification_reads\b/i.test(sql)
check('Read and resolve state is RPC-only, without direct authenticated table grant',rpcOnly)
check('No public/anonymous execute on system procedures',sql.includes('revoke all on function public.get_notification_feed(integer,integer,text,text) from public,anon'))
check('Current operational incident cannot be falsely resolved',sql.includes('Lỗi vẫn tồn tại; cần xử lý nguồn lỗi trước'))
check('All API-backed system handlers present', ['get_notification_feed','mark_system_notification_read','mark_all_system_notifications_read','resolve_system_notification'].every(v=>api.includes("'"+v+"'")))
check('Status/category filters are local state, no extra fetch',ui.includes("row.category===categoryFilter")&&ui.includes('neo-soft-category-select')&&(ui.match(/\bfetch\(/g)||[]).length===4)
check('System details, explicit migration warning',ui.includes("row.source==='system'")&&ui.includes('feed.migration_pending')&&ui.includes('chờ cập nhật SQL 0071'))
check('Only PGRST202 indicates the optional system RPC is not yet deployed',
  api.includes("migration_pending:newer.error?.code==='PGRST202'")&&
  api.includes("system_feed_error:Boolean(newer.error)&&newer.error.code!=='PGRST202'")&&
  ui.includes('feed.system_feed_error'))
check('Responsive wrapped filter layout',css.includes('max-width:390px')&&css.includes('flex-wrap:wrap'))
check('System alert toggles use existing rule UI and cannot enable Telegram',sql.includes('insert into public.alert_rule_configs')&&sql.includes('on conflict(alert_type) do nothing')&&sql.includes('cfg.enabled and cfg.in_app_enabled')&&sql.includes('true,true,false,0,60'))
check('No new cron/provider/Telegram writes',!sql.includes('cron.schedule(')&&!sql.includes('http_post(')&&!sql.includes('api.telegram.org'))
console.log('NOTIFICATION_SYSTEM_CONTRACT_QA_SUMMARY '+JSON.stringify({passed,failed:0}))
