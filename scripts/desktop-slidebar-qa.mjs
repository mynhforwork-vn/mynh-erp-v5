import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const outDir='qa-desktop-slidebar-artifacts'
fs.mkdirSync(outDir,{recursive:true})

const cookieMap=new Map()
const cookieClient=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
  cookies:{
    getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
    setAll(items){for(const item of items)cookieMap.set(item.name,item)},
  },
})
const {error}=await cookieClient.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(error)throw error

const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,value:c.value,url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()

const results=[]
function push(name,pass,metrics={},detail={}){results.push({name,pass:Boolean(pass),...metrics,...detail})}
async function go(path){
  const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
  await page.waitForTimeout(900)
  if((res?.status()??0)>=500)throw new Error(path+' returned '+res.status())
}
async function metric(selector){
  return page.locator(selector).first().evaluate(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el)
    return {
      position:s.position,
      display:s.display,
      left:Math.round(r.left),right:Math.round(r.right),
      top:Math.round(r.top),bottom:Math.round(r.bottom),
      width:Math.round(r.width),height:Math.round(r.height),
      viewportW:innerWidth,viewportH:innerHeight,
      overflowY:s.overflowY,
    }
  }).catch(()=>null)
}
function vertical(m){
  return Boolean(m)
    &&m.width>=380&&m.width<=430
    &&m.height>=m.width+60
    &&m.left>=m.viewportW*.55
    &&m.right<=m.viewportW+2
    &&m.top>=0&&m.bottom<=m.viewportH+2
    &&m.position!=='fixed'
}
async function shot(name){await page.screenshot({path:outDir+'/'+name+'.png',fullPage:false})}

// 1. Nhập kho
await go('/warehouse/receive')
let intake=page.locator('.warehouse-split-table tbody tr').filter({hasText:'QA Warehouse Intake Fixture'}).first()
if(!await intake.count())intake=page.locator('.warehouse-split-table tbody tr').first()
if(await intake.count()){
  await intake.click();await page.waitForTimeout(300)
  const m=await metric('aside.warehouse-intake-panel')
  push('Nhập kho — slidebar dọc bên phải',vertical(m),m??{})
  await shot('01-warehouse-intake')
}else push('Nhập kho — có dữ liệu mở slidebar',false,{}, {reason:'No intake row'})

// 2. Tồn kho
await go('/warehouse/inventory')
const stock=page.locator('.whx-stock-main .whx-table tbody tr').filter({has:page.locator('.whx-link-text')}).first()
if(await stock.count()){
  await stock.click();await page.waitForTimeout(300)
  const m=await metric('aside.whx-detail-panel')
  push('Tồn kho — slidebar dọc bên phải',vertical(m),m??{})
  await shot('02-inventory')
}else push('Tồn kho — có dữ liệu mở slidebar',false,{}, {reason:'No inventory row'})

// 3. Thu / Chi
await go('/finance/cashflow')
const income=page.getByRole('button',{name:'+ Phiếu thu'}).first()
if(await income.count()&&await income.isEnabled()){
  await income.click();await page.waitForTimeout(300)
  const m=await metric('aside.finance-panel')
  push('Thu-Chi — slidebar dọc bên phải',vertical(m),m??{})
  await shot('03-cashflow')
}else push('Thu-Chi — mở được Phiếu thu',false,{}, {reason:'Button unavailable'})

// 4. Đối soát
await go('/finance/shipper-payments?view=hub')
const fixtureHub=String(session.fixtures?.shipper_hub??'')
let hub=fixtureHub?page.locator('a.finance-hub-card').filter({hasText:fixtureHub}).first():page.locator('a.finance-hub-card').first()
if(!await hub.count())hub=page.locator('a.finance-hub-card').first()
if(await hub.count()){
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(()=>{}),
    hub.click(),
  ])
  await page.waitForTimeout(700)
  const m=await metric('aside.finance-hub-live-panel')
  push('Đối soát — slidebar dọc bên phải',vertical(m),m??{}, {hub:fixtureHub||null})
  await shot('04-settlement')
}else push('Đối soát — có HUB mở slidebar',false,{}, {reason:'No HUB card'})

const pass=results.every(x=>x.pass)
const summary={preview:PREVIEW_URL,viewport:{width:1440,height:900},pass,results}
fs.writeFileSync(outDir+'/summary.json',JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))

await browser.close()
if(!pass)process.exit(1)
