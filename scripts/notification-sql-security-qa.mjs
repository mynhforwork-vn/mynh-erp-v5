import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/0071_operational_system_notifications.sql')
const previous=read('supabase/migrations/0070_persistent_failed_delivery_reminders.sql')
const api=read('app/api/alerts/in-app/route.ts')
let passed=0
function check(label,ok){assert.ok(ok,label);passed++;console.log('PASS '+label)}
const revoke='revoke all on public.system_notification_reads from public,anon,authenticated'
const directGrant=/\bgrant\s+(?:all|select|insert|update|delete)\b[^;]*\bon\s+public\.system_notification_reads\b/i
check('No direct table grants to bypass RPC checks',sql.includes(revoke)&&!directGrant.test(sql))
check('Per-user RLS remains as defense-in-depth',sql.includes('alter table public.system_notification_reads enable row level security')&&sql.includes('user_id=(select auth.uid())'))
check('Private incident source is not executable by API users',sql.includes('revoke all on function private.active_system_notifications() from public,anon,authenticated'))
const names=['get_notification_feed','mark_system_notification_read','mark_all_system_notifications_read','resolve_system_notification']
for(let i=0;i<names.length;i++){
 const name=names[i]
 const start=sql.indexOf('create or replace function public.'+name+'(')
 const end=i+1<names.length?sql.indexOf('create or replace function public.'+names[i+1]+'('):sql.indexOf('\nrevoke all on function public.get_notification_feed(')
 const body=sql.slice(start,end)
 check('RPC auth.uid and Admin/Operator gate: '+name,start>=0&&end>start&&body.includes('auth.uid() is null')&&body.includes("not in ('admin','operator')"))
}
for(const fn of ['get_notification_feed(integer,integer,text,text)','mark_system_notification_read(uuid)','mark_all_system_notifications_read()','resolve_system_notification(uuid)']){
 check('RPC execute limited to authenticated: '+fn,sql.includes('revoke all on function public.'+fn+' from public,anon;')&&sql.includes('grant execute on function public.'+fn+' to authenticated;'))
}
check('Active incidents cannot be resolved manually',sql.includes('Lỗi vẫn tồn tại; cần xử lý nguồn lỗi trước'))
check('API has no direct table access',api.includes("supabase.rpc('get_notification_feed'")&&!api.includes(".from('system_notification_reads')"))
check('Persistent failure has a bounded RPC list',previous.includes('g.persistent_failure desc')&&previous.includes('limit greatest(1,least(coalesce(p_limit,30),100))'))
check('SQL does not add Cron, Telegram or provider requests',!/cron\.schedule\s*\(/i.test(sql)&&!/http_post\s*\(/i.test(sql)&&!/api\.telegram\.org/i.test(sql))
console.log('NOTIFICATION_SQL_SECURITY_QA_SUMMARY '+JSON.stringify({passed,failed:0,scope:'static only; no live JWT/SQL E2E'}))
