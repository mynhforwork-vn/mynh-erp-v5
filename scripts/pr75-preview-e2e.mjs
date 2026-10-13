// E2E scoped to PR #75. Uses only unique QA fixtures and cleans them in finally.
// Never execute on the Production ERP URL.
import fs from 'node:fs'
import {randomUUID,randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'

const URL_BASE=String(process.env.PREVIEW_URL??'').replace(/\/$/,'')
const API_URL=process.env.SUPABASE_URL
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
const MANIFEST='qa-pr75-session.json'
const OUT='qa-pr75-results.json'
if(!URL_BASE.includes('pr75-cancel-mapping-qa-v1-')||!URL_BASE.endsWith('.workers.dev'))
  throw new Error('PR75 QA must run against the isolated PR75 Cloudflare Preview, never Production')
if(!API_URL||!SERVICE_KEY)throw new Error('Missing QA Supabase environment')
const db=createClient(API_URL,SERVICE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
const check=(flag,label,detail={})=>{
  const entry={label,pass:Boolean(flag),...detail}
  result.checks.push(entry)
  console.log('PR75_QA_CHECK '+JSON.stringify(entry))
  if(!flag)throw new Error('PR75 E2E failed: '+label)
}
const result={preview:URL_BASE,checks:[],http5xx:[],pageErrors:[],cleanup:null}
const read=()=>fs.existsSync(MANIFEST)?JSON.parse(fs.readFileSync(MANIFEST,'utf8')):null
const write=x=>fs.writeFileSync(MANIFEST,JSON.stringify(x),{mode:0o600})
async function must(promise,label){
  const {data,error}=await promise
  if(error)throw new Error(label+': '+error.message)
  return data
}
async function clean(){
  const q=read()
  if(!q)return
  if(!q.marker?.startsWith('QA-PR75-'))throw new Error('Invalid PR75 cleanup marker')
  const errors=[]
  async function del(label,then){try{const {error}=await then();if(error)throw error}
    catch(e){errors.push(label+': '+String(e?.message??e))}}
  try{
    if(q.orderIds?.length){
      const ids=q.orderIds
      // Delete only confirmed test orders; protect against manifest corruption.
      const {data:found,error}=await db.from('orders').select('id,shopee_order_id').in('id',ids)
      if(error)throw error
      if(found?.some(o=>!String(o.shopee_order_id??'').startsWith(q.marker)))
        throw new Error('Non-QA order in cleanup manifest')
      await del('QA alerts',()=>db.from('alert_events').delete().in('order_id',ids))
      await del('QA tracking events',()=>db.from('tracking_events').delete().in('shipment_id',q.shipmentIds?.length?q.shipmentIds:[randomUUID()]))
      await del('QA shipments',()=>db.from('shipments').delete().in('order_id',ids))
      await del('QA order audit',()=>db.from('audit_logs').delete().in('entity_id',ids))
      await del('QA orders',()=>db.from('orders').delete().in('id',ids))
    }
    if(q.mappingId){
      // Refuse to remove a mapping unless the QA-only raw code and id still match.
      const {data:m,error}=await db.from('carrier_status_mappings').select('id,raw_code').eq('id',q.mappingId).maybeSingle()
      if(error)throw error
      if(m&&m.raw_code!==q.mappingCode)throw new Error('QA mapping ownership guard failed')
      if(m)await del('QA mapping',()=>db.from('carrier_status_mappings').delete().eq('id',q.mappingId).eq('raw_code',q.mappingCode))
    }
    if(q.authId){
      const {data,error}=await db.auth.admin.getUserById(q.authId)
      if(error)throw error
      if(data?.user?.user_metadata?.purpose!=='pr75-preview-e2e')throw new Error('QA auth ownership guard failed')
      const {error:deleteError}=await db.auth.admin.deleteUser(q.authId)
      if(deleteError)errors.push('QA auth: '+deleteError.message)
    }
    const ids=q.orderIds??[]
    const [o,s,m,u]=await Promise.all([
      ids.length?db.from('orders').select('id',{count:'exact',head:true}).in('id',ids):Promise.resolve({count:0,error:null}),
      ids.length?db.from('shipments').select('id',{count:'exact',head:true}).in('order_id',ids):Promise.resolve({count:0,error:null}),
      q.mappingId?db.from('carrier_status_mappings').select('id',{count:'exact',head:true}).eq('id',q.mappingId):Promise.resolve({count:0,error:null}),
      q.authId?db.auth.admin.getUserById(q.authId):Promise.resolve({data:{user:null},error:null}),
    ])
    if(o.error||s.error||m.error)errors.push('QA cleanup verification query failed')
    if((o.count??0)!==0||(s.count??0)!==0||(m.count??0)!==0||u.data?.user)
      errors.push('QA leftover orders='+o.count+' shipments='+s.count+' mapping='+m.count+' auth='+Boolean(u.data?.user))
    result.cleanup={passed:errors.length===0,errors}
    console.log('PR75_QA_CLEANUP '+JSON.stringify(result.cleanup))
    if(errors.length)throw new Error(errors.join('; '))
    fs.unlinkSync(MANIFEST)
  }catch(e){result.cleanup={passed:false,errors:[...errors,String(e?.message??e)]};throw e}
}
if(process.argv.includes('--cleanup')){await clean();process.exit(0)}

let browser=null,thrown=null
try{
  const suffix=randomBytes(4).toString('hex').toUpperCase()
  const marker='QA-PR75-'+suffix
  const q={marker,orderIds:[],shipmentIds:[],mappingId:null,mappingCode:'QA75'+suffix,authId:null}
  write(q)
  const password='QAa!'+randomBytes(12).toString('base64url')+'9'
  const email='qa-pr75-'+suffix.toLowerCase()+'@mynh-v5.internal'
  const user=await must(db.auth.admin.createUser({
    email,password,email_confirm:true,
    app_metadata:{role:'admin'},user_metadata:{purpose:'pr75-preview-e2e'},
  }),'create QA-only admin account')
  q.authId=user.user.id;write(q)
  const code1=marker+'-QUICK',code2=marker+'-REPLACE'
  const order1=randomUUID(),order2=randomUUID(),shipment2=randomUUID(),mapId=randomUUID()
  q.orderIds=[order1,order2];q.shipmentIds=[shipment2];q.mappingId=mapId;write(q)
  await must(db.from('orders').insert([
    {id:order1,shopee_order_id:code1,recipient_name:'QA PR75 quick',order_status:'PENDING',shipping_service:'STANDARD'},
    {id:order2,shopee_order_id:code2,recipient_name:'QA PR75 replacement',order_status:'PROCESSING',shipping_service:'STANDARD'},
  ]),'create QA orders')
  await must(db.from('shipments').insert({
    id:shipment2,order_id:order2,tracking_number:marker+'-OLD',
    carrier:'SPX Express',is_active:true,tracking_enabled:false,
    current_tracking_status:'UNKNOWN',next_track_at:null,
  }),'create QA existing shipment')
  await must(db.from('carrier_status_mappings').insert({
    id:mapId,carrier:'SPX',raw_code:q.mappingCode,raw_name:'PR75 E2E QA only',
    canonical_status:'IN_TRANSIT',is_active:true,
  }),'create QA-only status mapping')

  browser=await chromium.launch({
    headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
  })
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  const page=await context.newPage()
  page.on('pageerror',e=>result.pageErrors.push(String(e)))
  page.on('response',r=>{if(r.status()>=500)result.http5xx.push({path:new URL(r.url()).pathname,status:r.status()})})
  const goto=async path=>{
    const res=await page.goto(URL_BASE+path,{waitUntil:'domcontentloaded',timeout:45000})
    await page.waitForTimeout(750)
    check((res?.status()??0)<500&&!(await page.locator('body').innerText()).includes('Application error'),'HTTP & app page '+path,{status:res?.status(),finalPath:new URL(page.url()).pathname})
  }
  async function until(label,fn){
    for(let i=0;i<25;i++){if(await fn())return;await page.waitForTimeout(400)}
    throw new Error('DB persistence timeout: '+label)
  }
  await goto('/purchase/orders?range=all')
  check(new URL(page.url()).pathname==='/login','Protected ERP route redirects unauthenticated visitors')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button',{name:'Đăng nhập'}).click()
  await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:35000})
  check(!page.url().includes('/login'),'QA admin signed in through UI')

  await goto('/purchase/orders?range=all&q='+encodeURIComponent(code1))
  const add=page.locator('.quick-tracking-trigger').first()
  check(await add.count()>0,'Quick add tracking button appears for QA order')
  await add.click()
  await page.locator('.quick-tracking-form input[name=tracking_number]').fill('KHÔNG CÓ')
  check(await page.locator('.quick-tracking-form select[name=carrier_config_id]').count()===0,'Cancellation marker needs no carrier')
  check(await page.locator('.quick-tracking-form button[type=submit]').innerText()==='Huỷ đơn','Quick action is labelled Huỷ đơn')
  await page.locator('.quick-tracking-form button[type=submit]').click()
  await until('quick cancel',async()=>{
    const {data}=await db.from('orders').select('order_status,shipments(tracking_number,current_tracking_status,tracking_enabled,next_track_at)').eq('id',order1).single()
    const s=data?.shipments?.[0]
    return data?.order_status==='CANCELLED'&&s?.tracking_number==='KHÔNG CÓ'&&s?.current_tracking_status==='CANCELLED'&&s?.tracking_enabled===false&&s?.next_track_at===null
  })
  check(true,'Quick KHÔNG CÓ persisted CANCELLED, tracking disabled')
  await goto('/purchase/orders?range=all&q='+encodeURIComponent(code1))
  check((await page.locator('body').innerText()).includes('Đơn bị huỷ'),'Cancelled order displayed correctly after reload')

  await goto('/purchase/orders?range=all&order='+order2+'&tab=tracking')
  const form=page.locator('form.replace-form')
  check(await form.count()>0,'Order slidebar contains replacement tracking form')
  await form.locator('input[name=tracking_number]').fill('KHÔNG CÓ')
  await form.locator('input[name=carrier]').fill('')
  await form.getByRole('button',{name:'Lưu MVĐ mới'}).click()
  await until('replace cancellation',async()=>{
    const {data}=await db.from('orders').select('order_status,shipments(tracking_number,current_tracking_status,tracking_enabled,next_track_at,is_active)').eq('id',order2).single()
    const s=data?.shipments?.find(x=>x.is_active)
    return data?.order_status==='CANCELLED'&&s?.tracking_number==='KHÔNG CÓ'&&s?.current_tracking_status==='CANCELLED'&&s?.tracking_enabled===false&&s?.next_track_at===null
  })
  check(true,'Replace KHÔNG CÓ persisted CANCELLED, tracking disabled')
  await goto('/purchase/orders?range=all&order='+order2+'&tab=info')
  check((await page.locator('body').innerText()).includes('Đơn bị huỷ'),'Cancelled replacement displayed after reload')

  await goto('/settings?section=tracking')
  await page.getByRole('button',{name:/Mapping SPX/}).click()
  check(await page.locator('#tracking-mapping-content-v9').getAttribute('aria-hidden')==='false','Mapping tab expanded after click')
  const row=page.locator('.tracking-mapping-row-v7').filter({hasText:q.mappingCode})
  check(await row.count()===1,'QA mapping visible in Mapping tab')
  await row.getByRole('button',{name:'Sửa'}).click()
  const edit=page.locator('form.tracking-mapping-row-v7.editing').filter({hasText:q.mappingCode})
  await edit.locator('select[name=canonical_status]').selectOption('PICKED_UP')
  await edit.getByRole('button',{name:'Lưu'}).click()
  await page.waitForURL(u=>u.searchParams.get('tracking_tab')==='mapping'&&u.searchParams.get('mapped')==='1',{timeout:35000})
  await until('mapping save',async()=>{
    const {data}=await db.from('carrier_status_mappings').select('canonical_status').eq('id',mapId).single()
    return data?.canonical_status==='PICKED_UP'
  })
  check(await page.locator('#tracking-mapping-content-v9').getAttribute('aria-hidden')==='false','Mapping tab remains open after save')
  check((await page.locator('body').innerText()).includes('Đã lưu mapping'),'Mapping displays confirmation')
  await page.reload({waitUntil:'domcontentloaded'})
  check(await page.locator('#tracking-mapping-content-v9').getAttribute('aria-hidden')==='false','Mapping remains open after reload')
  check(await page.locator('.tracking-mapping-row-v7').filter({hasText:q.mappingCode}).count()===1,'Saved mapping remains visible after reload')

  for(const vp of [{width:1440,height:900},{width:768,height:1024},{width:360,height:800}]){
    await page.setViewportSize(vp)
    await page.waitForTimeout(350)
    const geometry=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}))
    const pass=geometry.width<=geometry.viewport+3
    // Preserve failures in QA reports; a layout regression is a failed E2E.
    check(pass,'Tracking Mapping responsive '+vp.width+'x'+vp.height,geometry)
  }

  check(result.http5xx.length===0,'No HTTP 5xx during scoped E2E',{count:result.http5xx.length})
  check(result.pageErrors.length===0,'No uncaught browser page errors',{count:result.pageErrors.length})
}catch(e){
  thrown=e
  console.error('PR75_QA_FAILURE '+String(e?.stack??e))
}finally{
  if(browser)await browser.close().catch(()=>{})
  try{await clean()}catch(e){console.error('PR75_QA_CLEANUP_FAILURE '+String(e?.message??e));thrown??=e}
  fs.writeFileSync(OUT,JSON.stringify(result,null,2))
}
if(thrown)process.exit(1)
console.log('PR75_PREVIEW_E2E_PASS checks='+result.checks.length+' cleanup='+result.cleanup?.passed)
