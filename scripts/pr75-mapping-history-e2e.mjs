// Run manually after the additive Admin RPC migration has been approved and applied.
// Isolated Cloudflare Preview only. All QA fixtures are deleted in finally.
import fs from 'node:fs'
import {randomBytes,randomUUID} from 'node:crypto'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'

const root=String(process.env.PREVIEW_URL??'').replace(/\/$/,'')
if(!root.startsWith('https://pr75-cancel-mapping-qa-v1-')||!root.endsWith('.workers.dev'))
  throw new Error('Refusing to run against non-PR75 Preview')
if(process.env.MAPPING_HISTORY_RPC_READY!=='yes')throw new Error('BLOCKED: Mapping-history migration not approved/applied')
const url=process.env.SUPABASE_URL
const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key)throw new Error('Missing QA Supabase configuration')
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const stateFile='qa-mapping-history-session.json'
const report={checks:[],cleanup:null,preview:root}
const state={code:'QA75H'+randomBytes(6).toString('hex').toUpperCase(),
  orderId:randomUUID(),shipmentId:randomUUID(),eventIds:[randomUUID(),randomUUID(),randomUUID()],
  authId:null,mappingId:null}
const write=()=>fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600})
write()
async function requireData(promise,label){
  const {data,error}=await promise
  if(error)throw new Error(label+': '+error.message)
  return data
}
function check(ok,label,extra={}){
  const v={label,pass:Boolean(ok),...extra}
  report.checks.push(v);console.log('MAPPING_HISTORY_QA '+JSON.stringify(v))
  if(!ok)throw new Error('E2E failed: '+label)
}
async function cleanup(){
  const errors=[]
  async function drop(label,q){try{await requireData(q,label)}catch(e){errors.push(String(e))}}
  try{
    // Always verify ownership before touching an order, user or mapping.
    const {data:order}=await db.from('orders').select('shopee_order_id').eq('id',state.orderId).maybeSingle()
    if(order&&!String(order.shopee_order_id).startsWith(state.code))throw new Error('Refuse cleanup non-QA order')
    await drop('QA events',db.from('tracking_events').delete().in('id',state.eventIds))
    await drop('QA shipments',db.from('shipments').delete().eq('id',state.shipmentId).eq('order_id',state.orderId))
    await drop('QA order audit',db.from('audit_logs').delete().eq('entity_id',state.orderId))
    await drop('QA orders',db.from('orders').delete().eq('id',state.orderId).like('shopee_order_id',state.code+'%'))
    const {data:mapping}=await db.from('carrier_status_mappings').select('id,raw_code').eq('carrier','SPX').eq('raw_code',state.code).maybeSingle()
    if(mapping)await drop('QA mapping',db.from('carrier_status_mappings').delete().eq('id',mapping.id).eq('raw_code',state.code))
    if(state.authId){
      const {data:user}=await db.auth.admin.getUserById(state.authId)
      if(user?.user?.user_metadata?.purpose!=='pr75-mapping-history-e2e')throw new Error('Refuse cleanup non-QA user')
      const {error}=await db.auth.admin.deleteUser(state.authId)
      if(error)errors.push('QA user: '+error.message)
    }
    const [ev,or,sh,map]=await Promise.all([
      db.from('tracking_events').select('id',{count:'exact',head:true}).in('id',state.eventIds),
      db.from('orders').select('id',{count:'exact',head:true}).eq('id',state.orderId),
      db.from('shipments').select('id',{count:'exact',head:true}).eq('id',state.shipmentId),
      db.from('carrier_status_mappings').select('id',{count:'exact',head:true}).eq('carrier','SPX').eq('raw_code',state.code),
    ])
    if([ev,or,sh,map].some(x=>x.error||x.count!==0))errors.push('QA leftovers detected')
    report.cleanup={pass:errors.length===0,errors}
    if(!errors.length)fs.unlinkSync(stateFile)
  }catch(e){errors.push(String(e));report.cleanup={pass:false,errors}}
  console.log('MAPPING_HISTORY_CLEANUP '+JSON.stringify(report.cleanup))
  if(errors.length)throw new Error(errors.join('; '))
}
let browser=null,failure=null
try{
  const mail='qa-map-'+state.code.toLowerCase()+'@mynh-v5.internal'
  const password='QA!'+randomBytes(12).toString('base64url')+'a9'
  const created=await requireData(db.auth.admin.createUser({
    email:mail,password,email_confirm:true,
    app_metadata:{role:'admin'},user_metadata:{purpose:'pr75-mapping-history-e2e'},
  }),'QA auth')
  state.authId=created.user.id;write()
  await requireData(db.from('orders').insert({
    id:state.orderId,shopee_order_id:state.code+'-ORDER',
    recipient_name:'QA mapping history',order_status:'PROCESSING',shipping_service:'STANDARD',
  }),'QA order')
  await requireData(db.from('shipments').insert({
    id:state.shipmentId,order_id:state.orderId,tracking_number:state.code+'-TRACK',
    carrier:'SPX Express',is_active:true,tracking_enabled:false,
    current_tracking_status:'READY_TO_SHIP',next_track_at:null,
  }),'QA shipment')
  await requireData(db.from('tracking_events').insert([
    {id:state.eventIds[0],shipment_id:state.shipmentId,event_time:new Date().toISOString(),
      raw_status_code:state.code,raw_status_name:'QA unknown',normalized_status:'UNKNOWN',source:'QA_E2E',
      fingerprint:state.code+'-UNKNOWN'},
    {id:state.eventIds[1],shipment_id:state.shipmentId,event_time:new Date().toISOString(),
      raw_status_code:state.code,raw_status_name:'QA already known',normalized_status:'PICKED_UP',source:'QA_E2E',
      fingerprint:state.code+'-KNOWN'},
    {id:state.eventIds[2],shipment_id:state.shipmentId,event_time:new Date().toISOString(),
      raw_status_code:state.code+'OTHER',raw_status_name:'QA different code',normalized_status:'UNKNOWN',source:'QA_E2E',
      fingerprint:state.code+'-OTHER'},
  ]),'QA historical events')
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  let res=await page.goto(root+'/login',{waitUntil:'domcontentloaded'})
  check(res?.status()===200,'Login route')
  await page.locator('input[type=email]').fill(mail)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button',{name:'Đăng nhập'}).click()
  await page.waitForURL(u=>!u.pathname.includes('login'))
  res=await page.goto(root+'/settings?section=tracking&tracking_tab=mapping',{waitUntil:'domcontentloaded'})
  check(res?.status()===200,'Open Tracking Mapping')
  const form=page.locator('form.tracking-unknown-row-v7').filter({has:page.locator('input[name="raw_code"][value="'+state.code+'"]')})
  check(await form.count()===1,'New UNKNOWN code shown in raw list')
  await form.locator('select[name=canonical_status]').selectOption('IN_TRANSIT')
  await form.getByRole('button',{name:'Tạo mapping'}).click()
  await page.getByRole('status').filter({hasText:'Đã phân loại lại 1 sự kiện'}).waitFor({timeout:15000})
  check(new URL(page.url()).origin===new URL(root).origin,'Mapping stays on same Preview origin')
  const rows=await requireData(db.from('tracking_events').select('id,normalized_status').in('id',state.eventIds),'Read history')
  const byId=new Map(rows.map(x=>[x.id,x.normalized_status]))
  check(byId.get(state.eventIds[0])==='IN_TRANSIT','Matching UNKNOWN backfilled')
  check(byId.get(state.eventIds[1])==='PICKED_UP','Already known status preserved')
  check(byId.get(state.eventIds[2])==='UNKNOWN','Unrelated raw code preserved')
  const mapped=await requireData(db.from('carrier_status_mappings').select('carrier,canonical_status,is_active').eq('carrier','SPX').eq('raw_code',state.code).single(),'Read mapping')
  check(mapped.canonical_status==='IN_TRANSIT'&&mapped.is_active,'New mapping persisted')
  const ship=await requireData(db.from('shipments').select('current_tracking_status,tracking_enabled').eq('id',state.shipmentId).single(),'Read shipment')
  check(ship.current_tracking_status==='READY_TO_SHIP'&&!ship.tracking_enabled,'Live shipment not modified')
  const {count:alerts}=await db.from('alert_events').select('id',{count:'exact',head:true}).eq('shipment_id',state.shipmentId)
  check(alerts===0,'No alerts from historical backfill')
  await page.reload({waitUntil:'domcontentloaded'})
  check(await page.locator('.tracking-mapping-row-v7').filter({hasText:state.code}).count()>=1,'Mapping visible after reload')
  await page.locator('.tracking-mapping-row-v7').filter({hasText:state.code}).getByRole('button',{name:'Sửa'}).click()
  const edit=page.locator('form.tracking-mapping-row-v7.editing').filter({hasText:state.code})
  await edit.locator('select[name=canonical_status]').selectOption('PICKED_UP')
  await edit.getByRole('button',{name:'Lưu'}).click()
  await page.getByRole('status').filter({hasText:'Đã phân loại lại 0 sự kiện'}).waitFor({timeout:15000})
  const old=await requireData(db.from('tracking_events').select('normalized_status').eq('id',state.eventIds[0]).single(),'Read previous historical status')
  check(old.normalized_status==='IN_TRANSIT','Mapping edit does not overwrite previously known events')
}catch(e){failure=e;console.error('MAPPING_HISTORY_E2E_FAIL '+String(e?.stack??e))}
finally{
  if(browser)await browser.close().catch(()=>{})
  try{await cleanup()}catch(e){failure??=e}
  fs.writeFileSync('qa-mapping-history-result.json',JSON.stringify(report,null,2))
}
if(failure)process.exit(1)
console.log('MAPPING_HISTORY_E2E_PASS '+report.checks.length)
