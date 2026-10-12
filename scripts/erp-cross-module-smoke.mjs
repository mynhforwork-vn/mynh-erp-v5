import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const sbUrl=process.env.SUPABASE_URL
const sbKey=process.env.SUPABASE_KEY
if(!base||!sbUrl||!sbKey)throw Error('QA requires Preview and Supabase configuration')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookieMap=new Map()
const client=createBrowserClient(sbUrl,sbKey,{cookies:{
  getAll:()=>[...cookieMap.values()].map(c=>({name:c.name,value:c.value})),
  setAll:items=>items.forEach(c=>cookieMap.set(c.name,c)),
}})
const {error}=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const folder='qa-cross-module-artifacts'
fs.mkdirSync(folder,{recursive:true})
const cases=[
  ['/warehouse/receive','.whx-intake-main'],
  ['/warehouse/inventory','.whx-table-card'],
  ['/sales/pos','.pos-workspace'],
  ['/finance/cashflow','.finance-ledger'],
  ['/finance/shipper-payments?mode=customer','.finance-settlement-main'],
  ['/finance/reports','.finance-report-table-card'],
  ['/settings?section=notifications','.notification-in-app-only-v1'],
]
const viewports=[
  {width:320,height:568,name:'mobile-320'},
  {width:390,height:844,name:'mobile-390'},
  {width:768,height:1024,name:'tablet-768'},
  {width:1440,height:900,name:'desktop-1440'},
  {width:1920,height:1080,name:'desktop-1920'},
]
const report=[]
try{
  const anonymous=await browser.newContext()
  const ap=await anonymous.newPage()
  await ap.goto(base+'/sales/pos',{waitUntil:'domcontentloaded',timeout:30000})
  const redirected=ap.url().includes('/login')
  report.push({case:'unauthenticated POS guard',pass:redirected})
  console.log((redirected?'PASS ':'FAIL ')+'Anonymous POS login guard')
  await anonymous.close()
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}})
    await context.addCookies([...cookieMap.values()].map(c=>({
      name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
      secure:c.options?.secure!==false,sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
    })))
    const page=await context.newPage()
    for(const [path,selector] of cases){
      const errors=[]
      const pageError=e=>errors.push(String(e.message))
      page.on('pageerror',pageError)
      let status=0,visible=false,overflow=false,telegramControls=0,ruleCount=0,finalUrl=''
      try{
        const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:35000})
        status=response?.status()??0
        finalUrl=page.url()
        await page.locator(selector).first().waitFor({state:'visible',timeout:18000})
        visible=true
        await page.waitForTimeout(250)
        overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+6)
        if(path.includes('notifications')){
          telegramControls=await page.locator('[name="telegram_enabled"],[name="bot_token"],[name="chat_id"]').count()
          ruleCount=await page.locator('.notification-in-app-only-v1 form.notification-rule-row-v9').count()
        }
      }catch(e){errors.push(String(e.message||e).slice(0,350))}
      const pass=status===200&&visible&&!overflow&&!finalUrl.includes('/login')
        &&errors.length===0&&(!path.includes('notifications')||(telegramControls===0&&ruleCount===5))
      const item={viewport:viewport.name,path,pass,status,visible,overflow,telegramControls,ruleCount,errors}
      report.push(item)
      console.log((pass?'PASS ':'FAIL ')+viewport.name+' '+path+' '+JSON.stringify({status,visible,overflow,telegramControls,ruleCount,errors}))
      if(visible)await page.screenshot({path:folder+'/'+viewport.name+'-'+path.replace(/[^a-z0-9]+/gi,'-')+'.png',fullPage:false})
      page.off('pageerror',pageError)
    }
    await context.close()
  }
}finally{await browser.close()}
fs.writeFileSync(folder+'/summary.json',JSON.stringify(report,null,2))
const bad=report.filter(x=>!x.pass)
console.log('CROSS_MODULE_BROWSER_SMOKE '+JSON.stringify({passed:report.length-bad.length,failed:bad.length}))
if(bad.length)process.exit(1)
