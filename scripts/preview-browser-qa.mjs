import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const outDir='qa-browser-artifacts'
fs.mkdirSync(outDir,{recursive:true})

const summary={
  preview:PREVIEW_URL,
  qaUserId:session.user_id,
  public:{},
  desktop:[],
  mobile:[],
  interactions:[],
  consoleErrors:[],
  pageErrors:[],
  network5xx:[],
}

const browser=await chromium.launch({headless:true})

// Public / unauthenticated checks.
const publicContext=await browser.newContext({viewport:{width:1440,height:900}})
const publicPage=await publicContext.newPage()
const loginRes=await publicPage.goto(PREVIEW_URL+'/login',{waitUntil:'domcontentloaded',timeout:30000})
await publicPage.waitForTimeout(800)
const loginBody=(await publicPage.locator('body').innerText()).slice(0,3000)
summary.public.login={
  status:loginRes?.status()??0,
  finalUrl:publicPage.url(),
  hasBrand:loginBody.includes('MYNH ERP'),
  emailInputs:await publicPage.locator('input[type=email]').count(),
  passwordInputs:await publicPage.locator('input[type=password]').count(),
  submitButtons:await publicPage.getByRole('button',{name:/Đăng nhập/}).count(),
}
await publicPage.screenshot({path:`${outDir}/login-desktop.png`,fullPage:true})
await publicPage.goto(PREVIEW_URL+'/sales/pos',{waitUntil:'domcontentloaded',timeout:30000})
await publicPage.waitForTimeout(800)
summary.public.protectedRedirect={
  requested:'/sales/pos',
  finalUrl:publicPage.url(),
  redirectedToLogin:publicPage.url().includes('/login'),
}
await publicContext.close()

// Produce the exact cookie representation used by @supabase/ssr.
const cookieMap=new Map()
const cookieClient=createBrowserClient(SUPABASE_URL,SUPABASE_KEY,{
  cookies:{
    getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
    setAll(items){for(const item of items)cookieMap.set(item.name,item)},
  },
})
const {error:setSessionError}=await cookieClient.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(setSessionError)throw new Error('Unable to serialize Supabase QA session: '+setSessionError.message)
if(!cookieMap.size)throw new Error('Supabase SSR did not emit auth cookies')

const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,
  value:c.value,
  url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),
  secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()
page.on('console',m=>{if(m.type()==='error')summary.consoleErrors.push({url:page.url(),text:m.text()})})
page.on('pageerror',e=>summary.pageErrors.push({url:page.url(),text:String(e)}))
page.on('response',r=>{if(r.status()>=500)summary.network5xx.push({url:r.url(),status:r.status()})})

async function go(path){
  try{
    const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
    await page.waitForTimeout(900)
    return {status:res?.status()??0,url:page.url(),body:(await page.locator('body').innerText()).slice(0,5000),navigationError:null}
  }catch(error){
    return {status:0,url:page.url(),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000),navigationError:String(error)}
  }
}

const routes=[
  '/','/purchase','/purchase/accounts','/purchase/orders','/purchase/tracking',
  '/warehouse','/warehouse/inventory','/warehouse/history',
  '/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt',
  '/finance','/finance/cashflow','/finance/shipper-payments','/finance/customer-payments','/finance/reports',
  '/settings','/account'
]
const screenshotRoutes=new Set(['/purchase/orders','/purchase/tracking','/warehouse','/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt','/finance','/settings'])

for(const path of routes){
  const r=await go(path)
  const metrics=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
    buttons:document.querySelectorAll('button').length,
    disabledButtons:document.querySelectorAll('button:disabled').length,
    links:document.querySelectorAll('a').length,
    dialogs:document.querySelectorAll('[role=dialog]').length,
  }))
  const rec={
    path,status:r.status,finalUrl:r.url,
    navigationError:r.navigationError,
    authenticated:!r.url.includes('/login'),
    hasBrand:r.body.includes('MYNH ERP'),
    hasServerError:/Internal Server Error|Application error|Something went wrong/i.test(r.body),
    navigationError:r.navigationError,
    horizontalOverflow:Math.max(metrics.scrollWidth,metrics.bodyScrollWidth)>metrics.innerWidth+2,
    ...metrics,
  }
  summary.desktop.push(rec)
  if(screenshotRoutes.has(path)){
    const safe=path.replaceAll('/','-').replace(/^-+/,'')||'home'
    await page.screenshot({path:`${outDir}/desktop-${safe}.png`,fullPage:true})
  }
}

// Non-mutating interaction tests.
await go('/purchase/accounts')
if(await page.getByRole('button',{name:'Import TSV'}).count()){
  await page.getByRole('button',{name:'Import TSV'}).click()
  const opened=await page.locator('[role=dialog]').count()>0
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const closedByEsc=await page.locator('[role=dialog]').count()===0
  summary.interactions.push({name:'User Import TSV modal opens',pass:opened})
  summary.interactions.push({name:'User Import TSV modal closes by Esc',pass:closedByEsc})
  if(!closedByEsc){
    const close=page.getByRole('button',{name:'Đóng'})
    if(await close.count())await close.first().click()
  }
}

await go('/sales/history')
const cancel=page.getByRole('button',{name:'Huỷ hóa đơn'})
if(await cancel.count()&&await cancel.first().isEnabled()){
  await cancel.first().click()
  const opened=await page.locator('[role=dialog]').count()>0
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const closedByEsc=await page.locator('[role=dialog]').count()===0
  summary.interactions.push({name:'Sales cancel modal opens',pass:opened})
  summary.interactions.push({name:'Sales cancel modal closes by Esc',pass:closedByEsc})
  if(!closedByEsc){
    const close=page.getByRole('button',{name:'Đóng'})
    if(await close.count())await close.first().click()
  }
}

await go('/settings')
const settingsBody=await page.locator('body').innerText()
summary.interactions.push({
  name:'Settings has no inactive V1 placeholders',
  pass:!settingsBody.includes('Tài khoản & phân quyền')&&!settingsBody.includes('Tích hợp')&&!settingsBody.includes('Thông báo'),
})

await page.setViewportSize({width:390,height:844})
for(const path of ['/purchase/orders','/purchase/tracking','/warehouse','/sales/pos','/sales/history','/sales/customers','/sales/debt']){
  const r=await go(path)
  const metrics=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
  }))
  summary.mobile.push({
    path,status:r.status,finalUrl:r.url,
    authenticated:!r.url.includes('/login'),
    horizontalOverflow:Math.max(metrics.scrollWidth,metrics.bodyScrollWidth)>metrics.innerWidth+2,
    ...metrics,
  })
  const safe=path.replaceAll('/','-').replace(/^-+/,'')
  await page.screenshot({path:`${outDir}/mobile-${safe}.png`,fullPage:true})
}

await browser.close()

summary.failures=[]
if(!summary.public.login.hasBrand||summary.public.login.emailInputs!==1||summary.public.login.passwordInputs!==1)summary.failures.push('Login UI')
if(!summary.public.protectedRedirect.redirectedToLogin)summary.failures.push('Protected route redirect')
for(const r of summary.desktop){
  if(!r.authenticated||r.status>=500||r.hasServerError||r.navigationError)summary.failures.push(`Desktop route ${r.path}`)
}
for(const r of summary.mobile){
  if(!r.authenticated||r.status>=500||r.navigationError)summary.failures.push(`Mobile route ${r.path}`)
}
if(summary.consoleErrors.length)summary.failures.push(`Console errors: ${summary.consoleErrors.length}`)
if(summary.pageErrors.length)summary.failures.push(`Page errors: ${summary.pageErrors.length}`)
if(summary.network5xx.length)summary.failures.push(`5xx responses: ${summary.network5xx.length}`)

fs.writeFileSync(`${outDir}/summary.json`,JSON.stringify(summary,null,2))
console.log('QA_BROWSER_SUMMARY_START')
console.log(JSON.stringify(summary,null,2))
console.log('QA_BROWSER_SUMMARY_END')
console.log(`QA_AUTH_CLEANUP id=${session.user_id}`)
process.exit(summary.failures.length?1:0)
