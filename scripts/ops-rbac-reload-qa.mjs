import fs from 'node:fs'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {createBrowserClient} from '@supabase/ssr'

const BASE=process.env.PREVIEW_URL,DB=process.env.SUPABASE_URL
const PUB=process.env.SUPABASE_KEY,ADMIN=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!BASE||!DB||!PUB||!ADMIN)throw Error('Missing QA configuration')
const qa=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const f=qa.fixtures
if(!f?.warehouse_order_id||!f?.sale_id||!f?.history_customer_id)throw Error('Missing tagged QA fixtures')
const service=createClient(DB,ADMIN,{auth:{persistSession:false,autoRefreshToken:false}})
const actor=createClient(DB,PUB,{auth:{persistSession:false,autoRefreshToken:false}})
let access=qa.access_token,refresh=qa.refresh_token
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const dir='qa-rbac-reload-artifacts'
fs.mkdirSync(dir,{recursive:true})
const checks=[]
function record(name,pass,data={}){const v={name,pass:Boolean(pass),...data};checks.push(v);console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(data))}
async function setRole(role){
  const result=await service.auth.admin.updateUserById(qa.user_id,{app_metadata:{role}})
  if(result.error)throw Error('QA role update failed: '+result.error.message)
  const {error}=await actor.auth.setSession({access_token:access,refresh_token:refresh})
  if(error)throw error
  const next=await actor.auth.refreshSession()
  if(next.error||!next.data?.session)throw Error('QA JWT refresh failed for '+role)
  access=next.data.session.access_token
  refresh=next.data.session.refresh_token
  const decoded=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString('utf8'))
  if(decoded.app_metadata?.role!==role)throw Error('QA role mismatch for '+role)
}
async function contextForRole(){
  const jar=new Map()
  const client=createBrowserClient(DB,PUB,{cookies:{
    getAll(){return [...jar.values()].map(x=>({name:x.name,value:x.value}))},
    setAll(items){for(const x of items)jar.set(x.name,x)},
  }})
  const res=await client.auth.setSession({access_token:access,refresh_token:refresh})
  if(res.error)throw res.error
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...jar.values()].map(x=>({
    name:x.name,value:x.value,url:BASE,httpOnly:Boolean(x.options?.httpOnly),
    secure:x.options?.secure!==false,
    sameSite:x.options?.sameSite==='strict'?'Strict':x.options?.sameSite==='none'?'None':'Lax',
  })))
  return context
}
async function checkRoute(role,path,selector,marker,reload=true){
  const context=await contextForRole(),page=await context.newPage()
  const problems=[]
  page.on('response',r=>{if(r.status()>=500)problems.push({status:r.status(),type:r.request().resourceType()})})
  let status=0,body='',visible=false
  try{
    const first=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:30000})
    await page.waitForTimeout(350)
    const res=reload?await page.reload({waitUntil:'domcontentloaded',timeout:30000}):first
    await page.waitForTimeout(600)
    status=res?.status()??0
    body=(await page.locator('body').innerText()).slice(0,15000)
    visible=await page.locator(selector).count()>0
    const ok=status===200&&visible&&(!marker||body.includes(marker))&&problems.length===0
    record(role+' '+path+(reload?' after reload':''),ok,{status,visible,markerFound:!marker||body.includes(marker),serverErrors:problems.length})
    await page.screenshot({path:dir+'/'+role+'-'+path.replace(/[^a-z0-9]+/gi,'-').slice(0,65)+'.png',fullPage:false})
  }catch(e){
    record(role+' '+path+' navigation',false,{error:String(e).slice(0,240)})
  }finally{await context.close()}
}
async function rpcStatus(){
  const r=await fetch(DB+'/rest/v1/rpc/admin_list_system_users',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:PUB,Authorization:'Bearer '+access},body:'{}'
  })
  return r.status
}
try{
  await setRole('operator')
  const [order,sale,debt]=await Promise.all([
    service.from('orders').select('shopee_order_id').eq('id',f.warehouse_order_id).maybeSingle(),
    service.from('sales').select('invoice_code').eq('id',f.sale_id).maybeSingle(),
    service.from('debt_ledger').select('debit,credit').eq('customer_id',f.history_customer_id),
  ])
  record('QA order exists in Supabase',!order.error&&order.data?.shopee_order_id===f.warehouse_order_code)
  record('QA sale invoice exists in Supabase',!sale.error&&sale.data?.invoice_code===f.sale_invoice_code)
  record('QA unpaid debt exists in Supabase',!debt.error&&debt.data?.some(x=>Number(x.debit)>Number(x.credit)))
  await checkRoute('operator','/purchase/orders?range=all&q='+encodeURIComponent(f.warehouse_order_code),'.order-table',f.warehouse_order_code)
  await checkRoute('operator','/sales/history?sale='+encodeURIComponent(f.sale_id),'.sales-history-list',f.sale_invoice_code)
  await checkRoute('operator','/sales/debt','.debt-demo-list',f.history_customer_name)
  await checkRoute('operator','/finance/cashflow','.finance-ledger',null)
  for(const role of ['admin','operator','viewer']){
    await setRole(role)
    const status=await rpcStatus()
    record(role+' admin-only RPC access',role==='admin'?status===200:status===401||status===403,{status})
    const context=await contextForRole(),page=await context.newPage()
    try{
      const r=await page.goto(BASE+'/settings?section=notifications',{waitUntil:'domcontentloaded',timeout:30000})
      await page.waitForTimeout(650)
      const tab=await page.getByRole('link',{name:'Thông báo',exact:true}).count()>0
      const workspace=await page.locator('.notification-in-app-only-v1').count()>0
      const toggle=page.locator('.notification-in-app-only-v1 input[name="in_app_enabled"]').first()
      const editable=await toggle.count()>0&&!await toggle.isDisabled()
      const pass=r?.status()===200&&(role==='viewer'?(!tab&&!workspace):tab&&workspace&&(role==='admin'?editable:!editable))
      record(role+' notification UI permissions',pass,{status:r?.status(),tab,workspace,editable})
    }catch(e){record(role+' notification UI permissions',false,{error:String(e).slice(0,240)})}
    finally{await context.close()}
  }
}finally{
  await browser.close()
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2))
}
const failed=checks.filter(x=>!x.pass)
console.log('OPS_RBAC_RELOAD_QA '+JSON.stringify({checks:checks.length,passed:checks.length-failed.length,failed:failed.length,failedNames:failed.map(x=>x.name)}))
if(failed.length)process.exit(2)
