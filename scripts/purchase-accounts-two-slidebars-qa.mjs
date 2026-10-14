/**
 * Read-only QA for the real Account → User → Orders → Order detail → Tracking
 * → Back → close sequence. Enforces at most ONE slidebar in all states.
 * No writes: data read using QA operator; URL changes and localStorage only.
 */
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'
const base=process.env.PREVIEW_URL,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_KEY
if(!base?.includes('preview-production-v227-baseline-20261013-mynh-erp-v5.mynh-forwork.workers.dev')||!url||!key)throw Error('Wrong QA environment')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const cookies=new Map()
const db=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...cookies.values()].map(x=>({name:x.name,value:x.value})),
  setAll:xs=>xs.forEach(x=>cookies.set(x.name,x)),
}})
const {error}=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})
if(error)throw error
const candidate=await db.from('orders').select('erp_user_id').not('erp_user_id','is',null).is('archived_at',null).limit(300)
if(candidate.error)throw candidate.error
const users=[...new Set((candidate.data??[]).map(x=>x.erp_user_id).filter(Boolean))]
if(!users.length)throw Error('No existing account with orders available for read-only QA')
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
const folder='qa-accounts-two-slidebars-artifacts'
fs.mkdirSync(folder,{recursive:true})
let passed=0,failed=0
function check(name,ok,details={}){console.log('ACCOUNT_STACK_QA '+JSON.stringify({name,pass:Boolean(ok),...details}));if(ok)passed++;else failed++}
const contexts=[
  {width:320,height:568},{width:390,height:844},{width:768,height:1024},
  {width:1024,height:768},{width:1280,height:800},
  {width:1440,height:900},{width:1920,height:1080},
]
async function metrics(page){
  // Next.js can swap the route content before its responsive stylesheet finishes
  // loading. Assert only settled geometry (bounded wait), never a transient
  // half-hydrated grid, and still FAIL if the correct layout never appears.
  try{
    await page.waitForFunction(()=>{
      const workspace=document.querySelector('.account-workspace')
      const card=workspace?.querySelector('.account-table-card')
      if(!workspace||!card)return false
      const rect=card.getBoundingClientRect()
      const vw=document.documentElement.clientWidth
      const horizontal=/auto|scroll/.test(getComputedStyle(card).overflowX)
      const withinViewport=rect.left>=-2&&rect.right<=vw+5
        &&document.documentElement.scrollWidth<=vw+5
      if(!horizontal||!withinViewport)return false
      if(innerWidth<=900&&workspace.classList.contains('with-panel')){
        return getComputedStyle(workspace).display==='block'
          &&rect.width>=Math.max(190,innerWidth-110)
      }
      return rect.width>=Math.min(180,innerWidth-110)
    },null,{timeout:12000})
  }catch{
    // Return the failed geometry below for diagnostics instead of hiding it.
  }
  await page.waitForTimeout(180)
  return page.evaluate(()=>{
    const workspace=document.querySelector('.account-workspace')
    const card=workspace?.querySelector('.account-table-card')
    const table=card?.querySelector('table.user-table')
    if(!workspace||!card||!table)return null
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}
    const user=workspace.querySelector(':scope > aside.account-detail-panel')
    const order=workspace.querySelector(':scope > aside.context-order-panel')
    const heads=[...table.querySelectorAll('thead th')]
    const cols=[...table.querySelectorAll('colgroup col')]
    const widths=Object.fromEntries(heads.map(el=>[el.dataset.accountCol??'select',Math.round(rect(el).width)]))
    const aligned=cols.length===heads.length&&cols.every((col,i)=>Math.abs(rect(col).width-rect(heads[i]).width)<=8)
    const tab=order?.querySelector('.context-order-tabs a.active')?.textContent?.trim()||null
    return {
      count:Number(Boolean(user))+Number(Boolean(order)),
      domCount:workspace.querySelectorAll('[data-system-slidebar="true"]').length,
      panelClass:workspace.classList.contains('with-two-panels'),
      viewport:innerWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth+5,
      lane:rect(card),table:rect(table),user:rect(user),order:rect(order),
      panelVisible:user?getComputedStyle(user).visibility!=='hidden':null,
      orderStack:order?parseInt(getComputedStyle(order).zIndex)||0:0,
      userStack:user?parseInt(getComputedStyle(user).zIndex)||0:0,
      localScroll:/auto|scroll/.test(getComputedStyle(card).overflowX),
      noHorizontalScroll:card.scrollWidth<=card.clientWidth+4,
      tableWithinScroll:card.scrollWidth>=card.clientWidth-1,
      fitted:rect(table).width>=card.clientWidth-8,
      aligned,
      widths,tab,
    }
  })
}
function fit(m){return !!(m&&!m.bodyOverflow&&m.aligned&&m.localScroll
  &&m.fitted&&m.noHorizontalScroll&&m.table.width<=m.lane.width+4
  &&m.tableWithinScroll&&m.widths.username>=56
  &&(m.widths.voucher===undefined||m.widths.voucher>=24)
  &&(m.widths.number===undefined||m.widths.number<=48)
  &&(m.widths.orders===undefined||m.widths.orders<=85)
  &&m.lane.right<=m.viewport+4
  &&(m.viewport>900||m.lane.width>=Math.max(190,m.viewport-110)))}
function panels(m,expected,kind=null){
  if(!m||m.count!==expected||m.domCount!==expected||m.panelClass)return false
  if(expected===0)return !m.user&&!m.order
  if(expected!==1||Boolean(m.user)===Boolean(m.order))return false
  if(kind==='user')return Boolean(m.user&&!m.order)
  if(kind==='order')return Boolean(m.order&&!m.user)
  return true
}

try{
 for(const viewport of contexts){
  const ctx=await browser.newContext({viewport})
  await ctx.addCookies([...cookies.values()].map(c=>({
    name:c.name,value:c.value,url:base,httpOnly:Boolean(c.options?.httpOnly),
    secure:c.options?.secure!==false,
    sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
  })))
  const page=await ctx.newPage()
  try{
  await page.goto(base+'/purchase/accounts',{waitUntil:'domcontentloaded',timeout:45000})
  const marker=page.locator('.account-table-card table[data-auto-fit-version="6"]')
  for(let i=0;i<12&&!(await marker.count());i++){
    await page.waitForTimeout(5000);await page.reload({waitUntil:'domcontentloaded',timeout:45000})
  }
  await marker.waitFor({timeout:25000})
  const initial=await metrics(page)
  check(viewport.width+' 0 slidebars: full-table Auto Fit',fit(initial)&&panels(initial,0),initial??{})
  const visibleIds=await page.locator('.account-table-card tbody tr[data-account-id]').evaluateAll(rows=>rows.map(x=>x.getAttribute('data-account-id')))
  const userId=users.find(u=>visibleIds.includes(u))
  if(!userId){check(viewport.width+' account fixture visible',false,{available:visibleIds.length});continue}
  const link=page.locator('.account-table-card tbody tr[data-account-id="'+userId+'"] td[data-account-col="username"] .table-link')
  await link.click()
  await page.locator('.account-workspace>.account-detail-panel').waitFor({timeout:20000})
  const one=await metrics(page)
  check(viewport.width+' 1 slidebar: User detail',fit(one)&&panels(one,1,'user')
    &&(viewport.width<=900||one.lane.width<initial.lane.width-80),one??{})
  if(viewport.width===1440){
    // Read-only navigation QA: never submit a real account form. Successful
    // persistence belongs to a separately approved isolated fixture test.
    const documentOrigin=await page.evaluate(()=>performance.timeOrigin)
    await page.locator('.account-workspace>.account-detail-panel .panel-action-row a')
      .filter({hasText:'Sửa tài khoản'}).click()
    const inlineForm=page.locator('.account-workspace>.account-detail-panel form')
    await inlineForm.locator('input[name="inline_operation"][value="update"]')
      .waitFor({state:'attached',timeout:15000})
    const softEdit=await page.evaluate(origin=>performance.timeOrigin===origin,documentOrigin)
    check('1440 edit form opens without document reload and uses inline Server Action',
      softEdit&&page.url().includes('mode=edit')
        &&await inlineForm.locator('input[name="user_id"]').count()===1,
      {documentPreserved:softEdit,urlContainsEdit:page.url().includes('mode=edit')})
    await inlineForm.locator('.form-actions a').click()
    await page.locator('.account-workspace>.account-detail-panel .user-panel-tabs')
      .waitFor({timeout:15000})
    check('1440 cancel edit returns to User detail without document reload',
      await page.evaluate(origin=>performance.timeOrigin===origin,documentOrigin),
      {documentPreserved:await page.evaluate(origin=>performance.timeOrigin===origin,documentOrigin)})
  }

  await page.locator('.account-workspace>.account-detail-panel .user-panel-tabs a').filter({hasText:'Đơn hàng'}).click()
  await page.locator('.account-workspace>.account-detail-panel .user-order-list a.user-order-card').first().waitFor({timeout:25000})
  const ordersTab=await metrics(page)
  check(viewport.width+' 1 slidebar: User orders tab',fit(ordersTab)&&panels(ordersTab,1,'user'),ordersTab??{})
  await page.locator('.account-workspace>.account-detail-panel .user-order-list a.user-order-card').first().click()
  await page.locator('.account-workspace>.context-order-panel').waitFor({timeout:20000})
  await page.locator('.account-workspace>.account-detail-panel').waitFor({state:'detached',timeout:20000})
  const orderDetail=await metrics(page)
  check(viewport.width+' 1 slidebar: Order detail replaces User',fit(orderDetail)&&panels(orderDetail,1,'order')
    &&(viewport.width<=900||Math.abs(orderDetail.lane.width-one.lane.width)<16),orderDetail??{})
  if([320,390,1280,1440,1920].includes(viewport.width)){
    await page.screenshot({path:folder+'/accounts-'+viewport.width+'-single-panel.png',fullPage:false})
  }
  const tracking=page.locator('.account-workspace>.context-order-panel .context-order-tabs a').filter({hasText:'Tracking'})
  if(await tracking.count()){
    const trackingHref=await tracking.first().getAttribute('href')
    await tracking.click()
    // Navigation could be delayed by RSC data. Keep collecting evidence for
    // subsequent Back/Close transitions even if Tracking tab never activates.
    let selectedTracking=true
    try{
      await page.locator('.account-workspace>.context-order-panel .context-order-tabs a.active')
        .filter({hasText:'Tracking'}).waitFor({state:'visible',timeout:12000})
    }catch{selectedTracking=false}
    const trackingOne=await metrics(page)
    check(viewport.width+' 1 slidebar: Tracking tab',fit(trackingOne)&&panels(trackingOne,1,'order')
      &&selectedTracking&&trackingOne.tab==='Tracking',
      {...(trackingOne??{}),url:page.url(),trackingHref,selectedTracking})
    if(selectedTracking){
      // Back #1 from Tracking returns to the Order's Info tab, not to User.
      await page.locator('.account-workspace>.context-order-panel .context-stack-back').click()
      await page.locator('.account-workspace>.context-order-panel .context-order-tabs a.active')
        .filter({hasText:'Thông tin'}).waitFor({state:'visible',timeout:20000})
      const orderInfo=await metrics(page)
      check(viewport.width+' Back Tracking to Order Info (1 slidebar)',
        fit(orderInfo)&&panels(orderInfo,1,'order')&&orderInfo.tab==='Thông tin',orderInfo??{})
    }
  }
  // Back #2 returns from Order Info to User Orders (1 slidebar), without overlay stacking.
  await page.locator('.account-workspace>.context-order-panel .context-stack-back').click()
  await page.locator('.account-workspace>.context-order-panel').waitFor({state:'detached',timeout:20000})
  const back=await metrics(page)
  check(viewport.width+' back to User (1 slidebar)',fit(back)&&panels(back,1,'user')
    &&(viewport.width<=900||Math.abs(back.lane.width-one.lane.width)<16),back??{})
  await page.locator('.account-workspace>.account-detail-panel a.close').click()
  await page.locator('.account-workspace>.account-detail-panel').waitFor({state:'detached',timeout:20000})
  const restored=await metrics(page)
  check(viewport.width+' close User (0 slidebars)',fit(restored)&&panels(restored,0)
    &&(viewport.width<=900||Math.abs(restored.lane.width-initial.lane.width)<16),restored??{})
  // Closing Order via X must also close the parent User and restore the table.
  await page.locator('.account-table-card tbody tr[data-account-id="'+userId+'"] td[data-account-col="username"] .table-link').click()
  await page.locator('.account-workspace>.account-detail-panel').waitFor()
  await page.locator('.account-workspace>.account-detail-panel .user-panel-tabs a').filter({hasText:'Đơn hàng'}).click()
  await page.locator('.account-workspace>.account-detail-panel .user-order-list a.user-order-card').first().click()
  await page.locator('.account-workspace>.context-order-panel').waitFor()
  await page.locator('.account-workspace>.context-order-panel a[aria-label="Đóng toàn bộ"]').click()
  await page.locator('.account-workspace>.context-order-panel').waitFor({state:'detached',timeout:20000})
  const allClosed=await metrics(page)
  check(viewport.width+' close Order slidebar restores table',fit(allClosed)&&panels(allClosed,0),allClosed??{})
  }catch(error){
    // A transient RSC request/error must not hide the remaining viewport QA.
    // Log a FAIL with its URL, then keep testing other sizes.
    check(viewport.width+' navigation/layout exception',false,{
      error:String(error?.message??error).slice(0,600),
      url:page.url(),
    })
  }finally{await ctx.close()}
 }
}finally{await browser.close()}
console.log('ACCOUNT_STACK_QA_SUMMARY '+JSON.stringify({passed,failed}))
if(failed)process.exitCode=1
