import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {createBrowserClient} from '@supabase/ssr'

const oldUrl=process.env.BASELINE_PREVIEW_URL
const fixedUrl=process.env.PREVIEW_URL
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(oldUrl&&fixedUrl&&url&&key&&service,'Stage C QA environment is required')
const qa=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
const changed=await admin.auth.admin.updateUserById(qa.user_id,{app_metadata:{role:'viewer'}})
if(changed.error)throw changed.error
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const seed=await client.auth.setSession({access_token:qa.access_token,refresh_token:qa.refresh_token})
if(seed.error)throw seed.error
const refresh=await client.auth.refreshSession()
if(refresh.error||!refresh.data.session)throw Error('Cannot refresh Viewer JWT')
const session=refresh.data.session
const jwt=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString())
assert.equal(jwt.app_metadata.role,'viewer')
const result=[]
function check(label,pass,extra={}){const o={label,pass:Boolean(pass),...extra};result.push(o);console.log('STAGE_C_HISTORY_PREFETCH_CHECK '+JSON.stringify(o))}
async function audit(base,mode){
  const cookies=new Map()
  const cookieClient=createBrowserClient(url,key,{cookies:{
    getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),
    setAll:items=>items.forEach(c=>cookies.set(c.name,c))
  }})
  const auth=await cookieClient.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
  if(auth.error)throw auth.error
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...cookies.values()].map(x=>({name:x.name,value:x.value,url:base,httpOnly:Boolean(x.options?.httpOnly),
    secure:x.options?.secure!==false,sameSite:'Lax'})))
  // Explicitly avoid triggering external QR/image services during a read-only test.
  await context.route('https://img.vietqr.io/**',route=>route.abort())
  const page=await context.newPage()
  const background=[],failures=[],responses=[]
  let clicked=false
  page.on('request',r=>{
    const u=new URL(r.url())
    if(u.origin!==new URL(base).origin||u.pathname!=='/sales/history'||!u.searchParams.has('_rsc'))return
    const row={mode,clicked,resourceType:r.resourceType(),
      nextRouterPrefetch:r.headers()['next-router-prefetch']||null,
      purpose:r.headers()['purpose']||null}
    if(!clicked)background.push(row)
  })
  page.on('response',async r=>{
    const u=new URL(r.url())
    if(u.origin!==new URL(base).origin)return
    if(r.status()>=500)failures.push({path:u.pathname,status:r.status(),resourceType:r.request().resourceType(),cfRay:r.headers()['cf-ray']||null,
      prefetchHeader:r.request().headers()['next-router-prefetch']||null})
    if(u.pathname==='/sales/history'&&u.searchParams.has('_rsc'))responses.push({clicked,status:r.status(),prefetchHeader:r.request().headers()['next-router-prefetch']||null})
  })
  try{
    const nav=await page.goto(base+'/sales/pos',{waitUntil:'domcontentloaded',timeout:35000})
    check(mode+' POS page loads',nav?.status()===200,{status:nav?.status()||0})
    const link=page.getByRole('link',{name:'Lịch sử bán',exact:true})
    check(mode+' visible Sales History link',await link.count()===1)
    await link.scrollIntoViewIfNeeded()
    await page.waitForTimeout(2000)
    console.log('STAGE_C_HISTORY_PREFETCH_TRAFFIC '+JSON.stringify({mode,background,preClickRSC:responses.filter(x=>!x.clicked)}))
    if(mode==='fixed')check('No idle Sales History RSC prefetch from POS',background.length===0,{backgroundCount:background.length})
    clicked=true
    await link.click()
    await page.waitForURL(u=>u.pathname==='/sales/history',{timeout:35000})
    await page.getByRole('heading',{name:'Lịch sử bán'}).waitFor({timeout:20000})
    check(mode+' Sales History remains reachable by user click',true)
    if(mode==='fixed'){
      check('Fixed POS -> History has no 5xx',failures.length===0,{errors:failures})
      await page.goto(base+'/sales',{waitUntil:'domcontentloaded',timeout:30000})
      clicked=false
      background.length=0
      const panelLink=page.getByRole('link',{name:'Lịch sử bán',exact:true}).first()
      await panelLink.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1600)
      check('No idle Sales History RSC prefetch from Dashboard',background.length===0,{backgroundCount:background.length})
      clicked=true
      await panelLink.click()
      await page.waitForURL(u=>u.pathname==='/sales/history',{timeout:35000})
      await page.getByRole('heading',{name:'Lịch sử bán'}).waitFor({timeout:20000})
      check('Dashboard -> History still navigates',true)
      check('Fixed history flows have zero 5xx',failures.length===0,{errors:failures})
    }
  }finally{await browser.close()}
  console.log('STAGE_C_HISTORY_PREFETCH_SUMMARY '+JSON.stringify({mode,background:background.length,errors:failures,historyResponses:responses.length}))
}
try{
  await audit(oldUrl,'baseline')
  await audit(fixedUrl,'fixed')
}finally{
  const rollback=await admin.auth.admin.updateUserById(qa.user_id,{app_metadata:{role:'operator'}})
  if(rollback.error)console.log('STAGE_C_AUTH_ROLE_RESTORE_FAILED')
}
const failed=result.filter(x=>!x.pass)
fs.mkdirSync('qa-history-prefetch-artifacts',{recursive:true})
fs.writeFileSync('qa-history-prefetch-artifacts/summary.json',JSON.stringify({total:result.length,failed:failed.length,checks:result},null,2))
console.log('STAGE_C_HISTORY_PREFETCH_GATE '+JSON.stringify({total:result.length,passed:result.length-failed.length,failed:failed.length}))
if(failed.length)process.exitCode=1
