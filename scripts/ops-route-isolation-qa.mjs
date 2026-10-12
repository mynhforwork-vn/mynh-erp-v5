import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!KEY)throw Error('Missing QA environment')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const client=createBrowserClient(SUPABASE_URL,KEY,{cookies:{
  getAll(){return [...cookies.values()].map(v=>({name:v.name,value:v.value}))},
  setAll(items){for(const v of items)cookies.set(v.name,v)},
}})
const {error}=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const results=[]
const cases=[
  {route:'/finance/cashflow',label:'Thu Chi',selector:'.finance-ledger'},
  {route:'/sales/debt',label:'Cong no',selector:'.debt-demo-list'},
  {route:'/finance/reports',label:'Bao cao',selector:'.finance-report-table-card'},
  {route:'/settings?section=notifications',label:'Thong bao noi bo',selector:'.notification-in-app-only-v1'},
]
fs.mkdirSync('qa-route-isolation-artifacts',{recursive:true})
try{
  for(const test of cases){
    const context=await browser.newContext({viewport:{width:1440,height:900}})
    await context.addCookies([...cookies.values()].map(v=>({
      name:v.name,value:v.value,url:PREVIEW_URL,httpOnly:Boolean(v.options?.httpOnly),
      secure:v.options?.secure!==false,
      sameSite:v.options?.sameSite==='strict'?'Strict':v.options?.sameSite==='none'?'None':'Lax'
    })))
    const page=await context.newPage()
    const network=[]
    const consoles=[]
    page.on('response',r=>{if(r.status()>=400)network.push({status:r.status(),type:r.request().resourceType(),url:r.url().split('?')[0]})})
    page.on('console',m=>{if(m.type()==='error')consoles.push(m.text().slice(0,200))})
    page.on('pageerror',e=>consoles.push('pageerror: '+String(e.message).slice(0,200)))
    let response=null,goError=null
    try{response=await page.goto(PREVIEW_URL+test.route,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1000)}
    catch(e){goError=String(e).slice(0,300)}
    const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,1200)
    const marker=await page.locator(test.selector).count()
    const status=response?.status()||0
    const okay=status===200&&!page.url().includes('/login')&&marker>0&&!/Application error|Internal Server Error|Something went wrong/i.test(body)
    const result={route:test.route,label:test.label,status,okay,marker,goError,network:network.slice(0,20),network_errors:network.length,console_errors:consoles.slice(0,12),body_excerpt:okay?'':body.slice(0,160)}
    results.push(result)
    console.log((okay?'PASS ':'FAIL ')+test.label+' '+JSON.stringify(result))
    await page.screenshot({path:'qa-route-isolation-artifacts/'+test.label.replace(/\s+/g,'-')+'.png',fullPage:false})
    await context.close()
  }
}finally{await browser.close()}
fs.writeFileSync('qa-route-isolation-artifacts/results.json',JSON.stringify(results,null,2))
console.log('OPS_ROUTE_ISOLATION_QA '+JSON.stringify({passed:results.filter(x=>x.okay).length,failed:results.filter(x=>!x.okay).length}))
if(results.some(x=>!x.okay))process.exit(2)
