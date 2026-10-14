import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'
const BASE=process.env.PREVIEW_URL,URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_KEY
if(!BASE||!URL||!KEY)throw Error('Missing Preview QA environment')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const jar=new Map()
const supabase=createBrowserClient(URL,KEY,{cookies:{
  getAll(){return [...jar.values()].map(x=>({name:x.name,value:x.value}))},
  setAll(items){items.forEach(x=>jar.set(x.name,x))},
}})
const login=await supabase.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(login.error)throw login.error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const dir='qa-pr79-notification-artifacts'
fs.mkdirSync(dir,{recursive:true})
const results=[]
try{
 const sizes=[[320,568],[390,844],[768,1024],[1440,900],[1920,1080]]
 for(const [width,height] of sizes){
  const ctx=await browser.newContext({viewport:{width,height}})
  await ctx.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:BASE,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  const errors=[],alerts=[]
  page.on('pageerror',e=>errors.push('runtime:'+String(e.message)))
  page.on('response',response=>{
    if(response.url().includes('/api/alerts/in-app?'))alerts.push({status:response.status()})
    if(response.status()>=500)errors.push('http:'+response.status()+':'+new URL(response.url()).pathname)
  })
  try{
   const navigation=await page.goto(BASE+'/purchase/orders?range=all',{waitUntil:'domcontentloaded',timeout:40000})
   const bell=page.locator('.sidebar-alert-trigger')
   await bell.waitFor({state:'visible',timeout:25000})
   await bell.click()
   const panel=page.locator('.app-alert-panel-v2')
   await panel.waitFor({state:'visible',timeout:12000})
   await page.locator('#neo-soft-category-select').waitFor({state:'visible',timeout:12000})
   // Authenticated polling starts during hydration, before the drawer opens.
   // Inspect response events captured since page.goto, not a late waitForResponse.
   await page.waitForTimeout(1700)
   const before=page.url()
   const categories=page.locator('#neo-soft-category-select')
   await categories.selectOption('system')
   await categories.selectOption('tracking')
   await categories.selectOption('all')
   await page.locator('.app-alert-tabs-v2 button').nth(2).click()
   await page.locator('.app-alert-tabs-v2 button').first().click()
   const data=await page.evaluate(()=>{
    const panel=document.querySelector('.app-alert-panel-v2')
    const filters=[...panel.querySelectorAll('.neo-soft-hub-line select')]
    const rect=panel.getBoundingClientRect()
    const fit=filters.every(x=>{const r=x.getBoundingClientRect();return r.left>=rect.left-2&&r.right<=rect.right+2})
    const body=document.documentElement
    return {panelLeft:rect.left,panelRight:rect.right,panelWidth:rect.width,
      filtersFit:fit,selectedCategory:document.querySelector('#neo-soft-category-select')?.value,
      warningVisible:Boolean(panel.querySelector('[role="status"]')),
      wideBody:body.scrollWidth>body.clientWidth+8,
      hasWorkPanel:!!panel.querySelector('.app-alert-list-v2'),
    }
   })
   const pass=navigation?.ok()&&page.url()===before&&data.filtersFit&&
     data.selectedCategory==='all'&&data.panelWidth<=width+3&&
     data.panelRight<=width+3&&data.panelLeft>=-3&&data.hasWorkPanel&&
     errors.length===0&&alerts.some(r=>r.status===200)
   results.push({width,height,pass,apiStatus:alerts.map(x=>x.status),...data,errors})
   console.log((pass?'PASS ':'FAIL ')+width+'x'+height+' '+JSON.stringify(results.at(-1)))
   await page.screenshot({path:dir+'/notification-'+width+'x'+height+'.png',fullPage:true})
  }catch(e){results.push({width,height,pass:false,error:String(e),errors});console.error('FAIL '+width+'x'+height+' '+String(e))}
  finally{await ctx.close()}
 }
}finally{await browser.close()}
fs.writeFileSync(dir+'/results.json',JSON.stringify(results,null,2))
assert.equal(results.length,5)
assert.ok(results.every(x=>x.pass),'Notification UI responsive regression failed')
console.log('NOTIFICATION_PR79_BROWSER_QA_SUMMARY '+JSON.stringify({passed:5,failed:0}))
