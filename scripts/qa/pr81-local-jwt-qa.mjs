import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'

assert.equal(process.env.PR81_QA_LOCAL_ONLY,'1','Only local disposable Supabase allowed')
const url=process.env.API_URL
const anon=process.env.ANON_KEY
const service=process.env.SERVICE_ROLE_KEY
const db=process.env.PR81_QA_CONTAINER
assert.ok(url&&anon&&service&&db,'Missing local Supabase status environment')
const endpoint=new URL(url)
assert.ok(['localhost','127.0.0.1','::1'].includes(endpoint.hostname),'Refuse nonlocal Supabase URL')
assert.ok(/^supabase_db_/.test(db),'Refuse nonlocal DB container')
const cookie=crypto.randomBytes(5).toString('hex')
let passed=0
function pass(name){passed++;console.log('PASS '+name)}
async function api(path,{key=anon,token=key,body,method='POST'}={}){
 const res=await fetch(url+path,{method,headers:{
  apikey:key,Authorization:'Bearer '+token,
  'Content-Type':'application/json'
 },body:body===undefined?undefined:JSON.stringify(body)})
 const value=await res.json().catch(()=>null)
 return {status:res.status,ok:res.ok,value}
}
async function createUser(role){
 const email='pr81-'+role+'-'+cookie+'@example.invalid'
 const password=crypto.randomBytes(20).toString('hex')+'Ab1!'
 const created=await api('/auth/v1/admin/users',{key:service,body:{
  email,password,email_confirm:true,app_metadata:{role}
 }})
 assert.ok(created.ok,'Cannot create LOCAL '+role+' user: HTTP '+created.status)
 const login=await api('/auth/v1/token?grant_type=password',{body:{email,password}})
 assert.ok(login.ok&&login.value?.access_token,'Cannot get local signed JWT: '+role)
 return {id:created.value.id,token:login.value.access_token}
}
async function rpc(name,token,args={}){
 return api('/rest/v1/rpc/'+name,{token,body:args})
}
function psql(sql){
 // Local fixture-only commands, never use database connection strings.
 return execFileSync('docker',['exec',db,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-q','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
}
const users={}
for(const role of ['admin','operator','viewer'])users[role]=await createUser(role)
pass('Local Supabase Auth issues signed JWT for Admin/Operator/Viewer')
const a=await rpc('get_notification_feed',users.admin.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'system'})
assert.ok(a.ok,'admin feed HTTP '+a.status)
assert.ok(Array.isArray(a.value?.items),'Malformed feed payload')
const failure=a.value.items.find(x=>x.event_type==='TRACKING_SYNC_FAILED')
const unknown=a.value.items.find(x=>x.event_type==='TRACKING_UNMAPPED_STATUS')
assert.ok(failure&&unknown,'Missing failed sync and UNKNOWN notices')
pass('Admin can see active synchronization and mapping errors')
const v=await rpc('get_notification_feed',users.viewer.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'all'})
assert.ok(v.ok&&v.value?.total===0,'Viewer must see empty operational feed')
const readViewer=await rpc('mark_system_notification_read',users.viewer.token,{p_id:failure.notification_id})
assert.ok(!readViewer.ok,'Viewer must not mark a system notification')
pass('Viewer is blocked by RPC role gate')
const direct=await api('/rest/v1/system_notification_reads',{token:users.admin.token,body:{
 user_id:users.admin.id,notification_id:failure.notification_id,resolved_at:new Date().toISOString()
}})
assert.ok(!direct.ok,'Direct UPDATE/INSERT must not bypass protected RPC')
pass('Even Admin JWT cannot write directly to read/resolve table')
const m=await rpc('mark_system_notification_read',users.admin.token,{p_id:failure.notification_id})
assert.ok(m.ok,'Admin cannot mark read, HTTP '+m.status)
const adminAfter=await rpc('get_notification_feed',users.admin.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'system'})
const own=adminAfter.value?.items?.find(x=>x.notification_id===failure.notification_id)
assert.ok(own?.is_read===true,'Read state did not persist for Admin')
const operator=await rpc('get_notification_feed',users.operator.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'system'})
const other=operator.value?.items?.find(x=>x.notification_id===failure.notification_id)
assert.ok(other?.is_read===false,'Read state leaked across users')
pass('Read state persists for own user and is separate for Operator')
const early=await rpc('resolve_system_notification',users.admin.token,{p_id:failure.notification_id})
assert.ok(!early.ok,'Active failure must not be resolvable')
pass('Active system incident cannot be resolved prematurely')
const readAll=await rpc('mark_all_system_notifications_read',users.operator.token)
assert.ok(readAll.ok,'Operator mark all failed')
const opAfter=await rpc('get_notification_feed',users.operator.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'system'})
assert.ok(opAfter.value?.unread_total===0 && opAfter.value?.action_total>=2,
 'Read all must not resolve ongoing incidents')
pass('Operator read-all persists and active incidents still require action')
async function oldAlerts(){
 return rpc('get_in_app_alerts',users.admin.token,{p_limit:100})
}
const old=await oldAlerts()
assert.ok(old.ok&&old.value?.some(x=>x.alert_type==='DELIVERY_FAILED'),'40-day failure disappeared')
pass('Failure persists after 40 days while not delivered or cancelled')
psql("update public.shipments set current_tracking_status='DELIVERED' where id='22222222-2222-4222-8222-222222222222'")
const done=await oldAlerts()
assert.ok(done.ok&&!done.value?.some(x=>x.alert_type==='DELIVERY_FAILED'),'Delivered still shows aged failure')
pass('Delivered clears historical 40-day failure')
psql("update public.shipments set current_tracking_status='IN_TRANSIT' where id='22222222-2222-4222-8222-222222222222'")
psql("update public.orders set order_status='CANCELLED' where id='11111111-1111-4111-8111-111111111111'")
const cancelled=await oldAlerts()
assert.ok(cancelled.ok&&!cancelled.value?.some(x=>x.alert_type==='DELIVERY_FAILED'),'Cancelled still shows aged failure')
pass('Cancelled clears historical 40-day failure')
psql("update public.orders set order_status='PROCESSING' where id='11111111-1111-4111-8111-111111111111'")
psql("update public.tracking_sync_logs set result='SUCCESS' where id='44444444-4444-4444-8444-444444444444'")
psql("update public.tracking_events set normalized_status='IN_TRANSIT' where id='33333333-3333-4333-8333-333333333333'")
const restored=await rpc('get_notification_feed',users.admin.token,{p_limit:40,p_offset:0,p_view:'all',p_category:'system'})
assert.ok(restored.ok&&restored.value?.total===0,'Recovered sync/mapping errors still active')
pass('Latest successful sync and recognized status clear system incidents')
console.log('PR81_LOCAL_JWT_DB_QA_SUMMARY '+JSON.stringify({passed,failed:0,scope:'only local fixture and signed JWT; not production ERP E2E'}))
