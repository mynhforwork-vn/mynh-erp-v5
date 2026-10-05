import { chromium } from 'playwright'
import crypto from 'node:crypto'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing QA environment')

const suffix=Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex')
const email=`qa-preview-${suffix}@example.com`
const password=crypto.randomBytes(24).toString('base64url')+'Aa1!'

async function authFetch(path,body){
  const res=await fetch(SUPABASE_URL+path,{
    method:'POST',
    headers:{'content-type':'application/json','apikey':SUPABASE_KEY,'authorization':'Bearer '+SUPABASE_KEY},
    body:JSON.stringify(body),
  })
  const text=await res.text()
  let json={}; try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,json,text}
}

const signup=await authFetch('/auth/v1/signup',{
  email,password,
  data:{purpose:'cloudflare-preview-ui-qa',preview_commit:process.env.GITHUB_SHA||null},
})
if(!signup.ok)throw new Error(`QA signup failed ${signup.status}: ${signup.text.slice(0,500)}`)
const qaUserId=signup.json?.user?.id
if(!qaUserId)throw new Error('QA signup did not return user id')
console.log(`QA_AUTH_CREATED email=${email} id=${qaUserId}`)
console.log('QA_AUTH_WAITING_FOR_OPERATOR_ROLE')

let token=null
for(let i=0;i<36;i++){
  const login=await authFetch('/auth/v1/token?grant_type=password',{email,password})
  if(login.ok&&login.json?.access_token){
    const payload=JSON.parse(Buffer.from(login.json.access_token.split('.')[1],'base64url').toString())
    const role=payload?.app_metadata?.role
    if(role==='operator'||role==='admin'){
      token=login.json
      console.log(`QA_AUTH_READY role=${role}`)
      break
    }
  }
  await new Promise(r=>setTimeout(r,5000))
}
if(!token)throw new Error('QA auth was not confirmed/promoted to operator within 180 seconds')

const outDir='qa-browser-artifacts'
fs.mkdirSync(outDir,{recursive:true})
const summary={
  preview:PREVIEW_URL,
  qaUserId,
  public:{},
  desktop:[],
  mobile:[],
  interactions:[],
  consoleErrors:[],
  pageErrors:[],
  network5xx:[],
}

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:900}})
const page=await context.newPage()
page.on('console',m=>{if(m.type()==='error')summary.consoleErrors.push({url:page.url(),text:m.text()})})
page.on('pageerror',e=>summary.pageErrors.push({url:page.url(),text:String(e)}))
page.on('response',r=>{if(r.status()>=500)summary.network5xx.push({url:r.url(),status:r.status()})})

async function go(path){
  const res=await page.goto(PREVIEW_URL+path,{waitUntil:'networkidle',timeout:60000})
  return {status:res?.status()??0,url:page.url(),body:(await page.locator('body').innerText()).slice(0,4000)}
}

const loginPage=await go('/login')
summary.public.login={
  status:loginPage.status,
  finalUrl:loginPage.url,
  hasBrand:loginPage.body.includes('MYNH ERP'),
  emailInputs:await page.locator('input[type=email]').count(),
  passwordInputs:await page.locator('input[type=password]').count(),
  submitButtons:await page.getByRole('button',{name:/Đăng nhập/}).count(),
}
await page.screenshot({path:`${outDir}/login-desktop.png`,fullPage:true})

const protectedCheck=await go('/sales/pos')
summary.public.protectedRedirect={
  requested:'/sales/pos',
  finalUrl:protectedCheck.url,
  redirectedToLogin:protectedCheck.url.includes('/login'),
}

// UI login with the generated credentials.
await page.goto(PREVIEW_URL+'/login',{waitUntil:'networkidle'})
await page.getByLabel('Thư điện tử').fill(email)
await page.getByLabel('Mật khẩu').fill(password)
await page.getByRole('button',{name:'Đăng nhập'}).click()
await page.waitForURL(url=>!url.pathname.endsWith('/login'),{timeout:30000})
await page.waitForLoadState('networkidle')

const routes=[
  '/','/purchase','/purchase/accounts','/purchase/orders','/purchase/tracking',
  '/warehouse','/warehouse/inventory','/warehouse/history',
  '/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt',
  '/finance','/finance/cashflow','/finance/shipper-payments','/finance/customer-payments','/finance/reports',
  '/settings','/account'
]

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
  const body=r.body
  const rec={
    path,status:r.status,finalUrl:r.url,
    authenticated:!r.url.includes('/login'),
    hasBrand:body.includes('MYNH ERP'),
    hasServerError:/Internal Server Error|Application error|Something went wrong/i.test(body),
    horizontalOverflow:Math.max(metrics.scrollWidth,metrics.bodyScrollWidth)>metrics.innerWidth+2,
    ...metrics,
  }
  summary.desktop.push(rec)
  const safe=path==='/'?'home':path.replaceAll('/','-').replace(/^-+/,'')
  if(['/purchase/orders','/purchase/tracking','/warehouse','/sales','/sales/pos','/sales/history','/sales/customers','/sales/debt','/finance','/settings'].includes(path)){
    await page.screenshot({path:`${outDir}/desktop-${safe}.png`,fullPage:true})
  }
}

// Non-mutating interaction checks.
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

// Mobile smoke.
await page.setViewportSize({width:390,height:844})
for(const path of ['/purchase/orders','/purchase/tracking','/warehouse','/sales/pos','/sales/history','/sales/customers','/sales/debt']){
  const r=await go(path)
  const metrics=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
  }))
  const rec={
    path,status:r.status,finalUrl:r.url,
    horizontalOverflow:Math.max(metrics.scrollWidth,metrics.bodyScrollWidth)>metrics.innerWidth+2,
    ...metrics,
  }
  summary.mobile.push(rec)
  const safe=path.replaceAll('/','-').replace(/^-+/,'')
  await page.screenshot({path:`${outDir}/mobile-${safe}.png`,fullPage:true})
}

await browser.close()

summary.failures=[]
if(!summary.public.login.hasBrand||summary.public.login.emailInputs!==1||summary.public.login.passwordInputs!==1)summary.failures.push('Login UI')
if(!summary.public.protectedRedirect.redirectedToLogin)summary.failures.push('Protected route redirect')
for(const r of summary.desktop){
  if(!r.authenticated||r.status>=500||r.hasServerError)summary.failures.push(`Desktop route ${r.path}`)
}
for(const r of summary.mobile){
  if(r.status>=500||r.finalUrl.includes('/login'))summary.failures.push(`Mobile route ${r.path}`)
}
if(summary.consoleErrors.length)summary.failures.push(`Console errors: ${summary.consoleErrors.length}`)
if(summary.pageErrors.length)summary.failures.push(`Page errors: ${summary.pageErrors.length}`)
if(summary.network5xx.length)summary.failures.push(`5xx responses: ${summary.network5xx.length}`)

fs.writeFileSync(`${outDir}/summary.json`,JSON.stringify(summary,null,2))
console.log('QA_BROWSER_SUMMARY_START')
console.log(JSON.stringify(summary,null,2))
console.log('QA_BROWSER_SUMMARY_END')
console.log(`QA_AUTH_CLEANUP id=${qaUserId} email=${email}`)
process.exit(summary.failures.length?1:0)
