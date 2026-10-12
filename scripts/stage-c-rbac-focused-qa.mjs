// Stage C: focused RBAC live backend + authenticated Preview UI.
// Mutates ONLY the workflow-owned erp_user fixture and the disposable QA auth role.
// Never invokes a valid data-reset, a tracking provider, or an external carrier.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {createBrowserClient} from '@supabase/ssr'

const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_KEY
const service=process.env.SUPABASE_SERVICE_ROLE_KEY,base=process.env.PREVIEW_URL
assert.ok(url&&key&&service&&base,'Isolated QA env required')
const qa=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
assert.ok(qa.user_id&&qa.fixtures?.erp_user_id&&qa.fixtures?.marker,'Disposable QA identifiers required')
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
const results=[]
const resourceErrors=[]
function check(label,ok,meta={}){const item={label,pass:Boolean(ok),...meta};results.push(item);console.log('STAGE_C_RBAC_CHECK '+JSON.stringify(item))}
let refreshToken=qa.refresh_token
async function sessionFor(role){
  const {error}=await admin.auth.admin.updateUserById(qa.user_id,{app_metadata:{role}})
  if(error)throw Error('QA role update failed: '+error.message)
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  let seed=await client.auth.setSession({access_token:qa.access_token,refresh_token:refreshToken})
  if(seed.error)throw seed.error
  const r=await client.auth.refreshSession()
  if(r.error||!r.data.session)throw Error('QA JWT refresh failed for '+role)
  qa.access_token=r.data.session.access_token
  qa.refresh_token=r.data.session.refresh_token
  refreshToken=qa.refresh_token
  const jwt=JSON.parse(Buffer.from(qa.access_token.split('.')[1],'base64url').toString())
  check(role+' refreshed JWT',jwt.app_metadata?.role===role)
  return r.data.session
}
async function rest(session,path,opt={}){
  const r=await fetch(url+path,{method:opt.method||'GET',headers:{
    apikey:key,authorization:'Bearer '+session.access_token,'content-type':'application/json',
    prefer:'return=representation'
  },body:opt.body===undefined?undefined:JSON.stringify(opt.body)})
  const txt=await r.text()
  return {ok:r.ok,status:r.status,text:txt}
}
async function adminNote(){
  const {data,error}=await admin.from('erp_users').select('note').eq('id',qa.fixtures.erp_user_id).single()
  if(error)throw error
  return String(data.note??'')
}
async function browserFor(session){
  const cookies=new Map()
  const cl=createBrowserClient(url,key,{cookies:{
    getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),
    setAll:xs=>xs.forEach(x=>cookies.set(x.name,x))
  }})
  const {error}=await cl.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
  if(error)throw error
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
  const ctx=await browser.newContext({viewport:{width:1440,height:900}})
  await ctx.addCookies([...cookies.values()].map(c=>({name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,sameSite:'Lax'})))
  const page=await ctx.newPage()
  page.on('response',response=>{
    if(response.status()<500)return
    const item={status:response.status(),path:new URL(response.url()).pathname,
      type:response.request().resourceType(),cf_ray:response.headers()['cf-ray']||null}
    resourceErrors.push(item)
    // No headers, cookies, response payload or credentials are logged.
    console.log('STAGE_C_PREVIEW_RESOURCE_ERROR '+JSON.stringify(item))
  })
  return {browser,page}
}
async function navigate(page,role,path){
  let response
  try{response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:25000})}
  catch(error){check(role+' '+path,false,{transport:'navigation-error',detail:String(error.message).slice(0,150)});return false}
  const status=response?.status()??0
  const ray=response?.headers()?.['cf-ray']??null
  const ok=status===200&&!new URL(page.url()).pathname.startsWith('/login')
  if(!ok){
    let marker='none'
    const body=await response?.text().catch(()=> '')||''
    if(/1102|exceeded resource limits/i.test(body))marker='CF_WORKER_1102'
    else if(/1027|daily request/i.test(body))marker='CF_REQUEST_LIMIT'
    else if(/Application error|Server Components render/i.test(body))marker='NEXT_SERVER_ERROR'
    check(role+' '+path,false,{status,cf_ray:ray,error_marker:marker})
    console.log('STAGE_C_PREVIEW_DIAGNOSTIC '+JSON.stringify({status,cf_ray:ray,error_marker:marker,path,role}))
  }else check(role+' '+path,true,{status})
  return ok
}
const initial=await adminNote()
let failed=false
try{
  for(const role of ['admin','operator','viewer']){
    const session=await sessionFor(role)
    const readable=await rest(session,'/rest/v1/orders?select=id&limit=1')
    check(role+' orders read',readable.ok,{status:readable.status})
    const text=qa.fixtures.marker+' StageC '+role
    const edit=await rest(session,'/rest/v1/erp_users?id=eq.'+encodeURIComponent(qa.fixtures.erp_user_id),
      {method:'PATCH',body:{note:text}})
    const persisted=(await adminNote())===text
    check(role+' direct RLS write',role==='viewer'?!persisted:(edit.ok&&persisted),{status:edit.status,persisted})
    if(persisted){
      const reset=await admin.from('erp_users').update({note:initial}).eq('id',qa.fixtures.erp_user_id)
      if(reset.error)throw reset.error
    }
    const userAdmin=await rest(session,'/rest/v1/rpc/admin_list_system_users',{method:'POST',body:{}})
    check(role+' admin user-list gate',role==='admin'?userAdmin.ok:(!userAdmin.ok&&userAdmin.text.includes('Admin role required')),
      {status:userAdmin.status})
    const reset=await rest(session,'/rest/v1/rpc/admin_reset_erp_data',
      {method:'POST',body:{p_scope:'DATA',p_confirm:'QA_INVALID_CONFIRMATION'}})
    check(role+' reset safety gate',role==='admin'
      ?(!reset.ok&&reset.text.includes('Chuỗi xác nhận chưa đúng'))
      :(!reset.ok&&reset.text.includes('Admin role required')),{status:reset.status})
    const {browser,page}=await browserFor(session)
    try{
      if(await navigate(page,role,'/purchase/orders?range=all')){
        const shell=await page.locator('.order-table-card').count()>0
        check(role+' Orders authenticated UI',shell)
      }
      await navigate(page,role,'/sales/pos')
      await navigate(page,role,'/sales/history')
      if(await navigate(page,role,'/settings?section=notifications')){
        const area=await page.locator('.notification-in-app-only-v1')
        const count=await area.locator('form.notification-rule-row-v9').count()
        const save=area.getByRole('button',{name:'Lưu',exact:true})
        const canSave=await save.count()>0&&await save.first().isEnabled()
        check(role+' notification UI role',role==='admin'?(count===5&&canSave):
          role==='operator'?(count===5&&!canSave):count===0,{count,canSave})
      }
    }finally{await browser.close()}
  }
}finally{
  const reset=await admin.from('erp_users').update({note:initial}).eq('id',qa.fixtures.erp_user_id)
  if(reset.error){console.log('STAGE_C_RBAC_CLEANUP_ERROR note not restored');failed=true}
  try{await sessionFor('operator');fs.writeFileSync('qa-session.json',JSON.stringify(qa))}
  catch{console.log('STAGE_C_RBAC_CLEANUP_ERROR role not restored');failed=true}
}
check('No background HTTP 5xx during three-role Preview browser',resourceErrors.length===0,{count:resourceErrors.length})
console.log('STAGE_C_PREVIEW_RESOURCE_SUMMARY '+JSON.stringify({errors:resourceErrors.length,items:resourceErrors.slice(0,10)}))
const bad=results.filter(x=>!x.pass)
fs.mkdirSync('qa-stage-c-artifacts',{recursive:true})
fs.writeFileSync('qa-stage-c-artifacts/rbac.json',JSON.stringify({checks:results.length,passed:results.length-bad.length,failed:bad.length,results},null,2))
console.log('STAGE_C_RBAC_SUMMARY '+JSON.stringify({checks:results.length,passed:results.length-bad.length,failed:bad.length}))
if(bad.length||failed)process.exitCode=1
