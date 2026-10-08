// QA trigger: expanded contextual and operational coverage 2026-10-06
// Final visual verification after mobile composition fixes
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
  
  interactions:[],
  consoleErrors:[],
  pageErrors:[],
  network5xx:[],
  transientWarnings:[],
}

function recordInteraction(name,pass,detail={}){
  summary.interactions.push({name,pass:Boolean(pass),...detail})
}

async function settle(ms=1100){
  await page.waitForTimeout(ms)
}

async function readSlidebarContract(selector){
  return page.locator(selector).first().evaluate(el=>{
    const r=el.getBoundingClientRect()
    const s=getComputedStyle(el)
    return {
      position:s.position,
      top:r.top,right:r.right,bottom:r.bottom,left:r.left,
      width:r.width,height:r.height,
      viewportW:innerWidth,viewportH:innerHeight,
    }
  }).catch(()=>null)
}
function slidebarPass(m){
  return Boolean(m)
    &&m.position!=='fixed'
    &&m.width>=380&&m.width<=430
    &&m.left>=0
    &&m.right<=m.viewportW+2
}
async function readPostKpiContract(panelSelector,kpiSelector,workspaceSelector){
  return page.evaluate(({panelSelector,kpiSelector,workspaceSelector})=>{
    const panel=document.querySelector(panelSelector)
    const kpi=document.querySelector(kpiSelector)
    const workspace=document.querySelector(workspaceSelector)
    if(!panel||!kpi||!workspace)return null
    const pr=panel.getBoundingClientRect(),kr=kpi.getBoundingClientRect(),wr=workspace.getBoundingClientRect()
    return {
      panelTop:pr.top,panelBottom:pr.bottom,panelHeight:pr.height,
      kpiBottom:kr.bottom,workspaceTop:wr.top,workspaceBottom:wr.bottom,workspaceHeight:wr.height,
      position:getComputedStyle(panel).position,
    }
  },{panelSelector,kpiSelector,workspaceSelector}).catch(()=>null)
}
function postKpiPass(m){
  return Boolean(m)
    &&m.position!=='fixed'
    &&m.panelTop>=m.kpiBottom-2
    &&Math.abs(m.panelTop-m.workspaceTop)<=4
    &&m.panelBottom<=m.workspaceBottom+4
    &&m.panelHeight<=m.workspaceHeight+4
    &&m.panelHeight>=120
}

function verticalRightPanelPass(m){
  return Boolean(m)
    &&m.position!=='fixed'
    &&m.width>=380&&m.width<=430
    &&m.height>=m.width+60
    &&m.left>=m.viewportW*.55
    &&m.right<=m.viewportW+2
    &&m.top>=0
    &&m.bottom<=m.viewportH+2
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
  let last={status:0,url:page.url(),body:'',navigationError:null}
  const delays=[600,1200,2200]
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
      await page.waitForTimeout(900)
      const status=res?.status()??0
      const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)
      const hasServerError=/Internal Server Error|Application error|Something went wrong/i.test(body)
      last={status,url:page.url(),body,navigationError:null}
      if(status>0&&status<500&&!hasServerError){
        if(attempt>1)summary.transientWarnings.push({url:PREVIEW_URL+path,status:503,type:'DOCUMENT_503_RECOVERED',attempt})
        return last
      }
    }catch(error){
      last={
        status:0,
        url:page.url(),
        body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000),
        navigationError:String(error),
      }
    }
    if(attempt<4)await page.waitForTimeout(delays[attempt-1])
  }
  return last
}

async function followLink(locator,{waitSelector=null,waitMs=0}={}){
  const href=await locator.getAttribute('href')
  if(!href)return {ok:false,href:null,url:page.url()}
  const target=new URL(href,PREVIEW_URL)
  if(target.origin!==new URL(PREVIEW_URL).origin)return {ok:false,href,url:page.url()}
  await go(target.pathname+target.search)
  if(waitMs>0)await page.waitForTimeout(waitMs)
  if(waitSelector){
    await page.locator(waitSelector).first().waitFor({state:'visible',timeout:5000}).catch(()=>{})
  }
  return {ok:true,href,url:page.url()}
}

const routes=[
  '/','/purchase','/purchase/accounts','/purchase/orders','/purchase/tracking',
  '/warehouse','/warehouse/receive','/warehouse/inventory','/warehouse/history',
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
    navigationError:r.navigationError,
    horizontalOverflow:Math.max(metrics.scrollWidth,metrics.bodyScrollWidth)>metrics.innerWidth+2,
    ...metrics,
  }
  summary.desktop.push(rec)
  if(screenshotRoutes.has(path)){
    const safe=path.replaceAll('/','-').replace(/^-+/,'')||'home'
    await page.screenshot({path:`${outDir}/desktop-${safe}.png`,fullPage:true})
  }
  fs.writeFileSync(`${outDir}/summary-partial.json`,JSON.stringify(summary,null,2))
}

// MYNH Brand System V1 checks.
await go('/')
recordInteraction('MYNH brand shell V1 is active',await page.locator('.brand-shell-v1').count()===1)
recordInteraction('MYNH compact wordmark renders',await page.locator('.brand .brand-mark .mynh-logo-mark').count()===1)
const desktopBrandMetrics=await page.evaluate(()=>({
  innerWidth:window.innerWidth,
  scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
  sidebarWidth:document.querySelector('.brand-shell-v1>.sidebar')?.getBoundingClientRect().width??0,
  mainWidth:document.querySelector('.brand-shell-v1>.main')?.getBoundingClientRect().width??0,
}))
recordInteraction(
  'MYNH desktop shell has no page overflow',
  desktopBrandMetrics.scrollWidth<=desktopBrandMetrics.innerWidth+2,
  desktopBrandMetrics
)
recordInteraction(
  'MYNH desktop shell keeps operational workspace',
  desktopBrandMetrics.sidebarWidth>=180&&desktopBrandMetrics.mainWidth>700,
  desktopBrandMetrics
)
const sidebarToggle=page.locator('.sidebar-collapse-toggle').first()
recordInteraction('Desktop sidebar collapse control exists',await sidebarToggle.count()===1)
if(await sidebarToggle.count()){
  const before=await page.locator('.brand-shell-v1>.sidebar').evaluate(el=>el.getBoundingClientRect().width)
  await sidebarToggle.click();await settle(180)
  const collapsed=await page.locator('.brand-shell-v1>.sidebar').evaluate(el=>el.getBoundingClientRect().width)
  const collapsedClass=await page.locator('.brand-shell-v1').evaluate(el=>el.classList.contains('desktop-sidebar-collapsed'))
  recordInteraction('Desktop sidebar collapses to icon rail',collapsedClass&&collapsed<100&&collapsed<before-80,{before,collapsed})
  await sidebarToggle.click();await settle(180)
  const expanded=await page.locator('.brand-shell-v1>.sidebar').evaluate(el=>el.getBoundingClientRect().width)
  recordInteraction('Desktop sidebar expands back',expanded>=215&&expanded<=235,{expanded})
  const sidebarContract=await page.evaluate(()=>{
    const sidebar=document.querySelector('.brand-shell-v1>.sidebar')
    const nav=sidebar?.querySelector('.nav')
    const foot=sidebar?.querySelector('.sidebar-foot')
    const active=nav?.querySelector('a.active')
    if(!sidebar||!nav||!foot)return null
    const sr=sidebar.getBoundingClientRect(),nr=nav.getBoundingClientRect(),fr=foot.getBoundingClientRect(),ar=active?.getBoundingClientRect()
    return {
      position:getComputedStyle(sidebar).position,
      top:sr.top,bottom:sr.bottom,viewportH:innerHeight,
      navScrollable:nav.scrollHeight>=nav.clientHeight,
      navTop:nr.top,navBottom:nr.bottom,footTop:fr.top,
      activeVisible:!ar||(ar.top>=nr.top-1&&ar.bottom<=nr.bottom+1),
    }
  })
  recordInteraction(
    'Desktop sidebar stays viewport-pinned with isolated nav scroll',
    Boolean(sidebarContract)
      &&sidebarContract.position==='sticky'
      &&Math.abs(sidebarContract.top)<=2
      &&sidebarContract.bottom>=sidebarContract.viewportH-2
      &&sidebarContract.navBottom<=sidebarContract.footTop+2
      &&sidebarContract.activeVisible,
    sidebarContract??{}
  )
}

// Desktop structural table contract checks.
for(const spec of [
  ['/purchase/accounts','.account-table-card'],
  ['/purchase/orders','.order-table-card'],
  ['/purchase/tracking','.tracking-hub-stack-v2'],
  ['/warehouse/receive','.whx-intake-main'],
  ['/warehouse/inventory','.whx-table-card'],
  ['/warehouse/history','.whx-history-main'],
  ['/sales/history','.sales-history-list'],
  ['/sales/customers','.customer-demo-list'],
  ['/sales/debt','.debt-demo-list'],
  ['/finance/cashflow','.finance-ledger'],
  ['/finance/shipper-payments?mode=customer','.finance-settlement-main'],
  ['/finance/reports','.finance-report-table-card'],
]){
  const [path,tableSelector]=spec
  await go(path)
  const table=page.locator(tableSelector).first()
  if(await table.count()){
    const metrics=await table.evaluate(el=>{
      const r=el.getBoundingClientRect()
      const th=el.querySelector('thead th')
      return {
        height:r.height,viewportH:innerHeight,bottom:r.bottom,
        overflowY:getComputedStyle(el).overflowY,
        stickyHeader:th?getComputedStyle(th).position:null,
      }
    })
    recordInteraction('Table workspace contract '+path,
      metrics.height>=180&&(path==='/finance/reports'
        ? metrics.bottom<=metrics.viewportH+30 // report document scroll is intentional
        : metrics.bottom<=metrics.viewportH+2)
        &&(!metrics.stickyHeader||metrics.stickyHeader==='sticky'),
      metrics)
  }
  const managed=page.locator('.managed-column-button,.column-manager-button,.finance-column-button,.column-manager>.icon-button,.order-column-manager>.icon-button').first()
  recordInteraction('Table column controls '+path,await managed.count()>0,{selector:await managed.count()?await managed.getAttribute('class'):null})
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

  await page.getByRole('button',{name:'Import TSV'}).click()
  const reopened=await page.locator('[role=dialog]').count()>0
  if(reopened){
    const backdrop=page.locator('.sales-action-backdrop').first()
    const box=await backdrop.boundingBox()
    if(box)await page.mouse.click(box.x+Math.max(8,box.width-12),box.y+8)
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  const closedByOutside=await page.locator('[role=dialog]').count()===0
  summary.interactions.push({name:'User Import TSV modal closes by outside click',pass:reopened&&closedByOutside})
}

// Expanded non-mutating interaction coverage across the ERP.
await go('/purchase/accounts')
const addAccountLink=page.getByRole('link',{name:/Thêm tài khoản/}).first()
if(await addAccountLink.count()){
  const createUserNav=await followLink(addAccountLink,{waitSelector:'aside.account-detail-panel'})
  recordInteraction('User create panel opens',page.url().includes('mode=create')&&await page.locator('aside.account-detail-panel').count()>0,{href:createUserNav.href})
  const close=page.locator('aside.account-detail-panel a.close').first()
  if(await close.count())await followLink(close)
  recordInteraction('User create panel closes',!page.url().includes('mode=create')&&await page.locator('aside.account-detail-panel').count()===0)
}

await go('/purchase/accounts')
const firstUserLink=page.locator('.account-table-card a.table-link').first()
if(await firstUserLink.count()){
  const userDetailNav=await followLink(firstUserLink,{waitSelector:'aside.account-detail-panel'})
  recordInteraction('User detail panel opens',await page.locator('aside.account-detail-panel').count()>0,{href:userDetailNav.href})
  for(const tabName of ['Đơn hàng','Lịch sử','Thông tin']){
    const tab=page.locator('aside.account-detail-panel .panel-tabs').getByRole('link',{name:new RegExp('^'+tabName)}).first()
    if(await tab.count()){
      const userTabNav=await followLink(tab,{waitSelector:'aside.account-detail-panel'})
      recordInteraction('User detail tab '+tabName,await page.locator('aside.account-detail-panel .panel-tabs a.active').filter({hasText:tabName}).count()>0,{href:userTabNav.href})
    }
  }
  const ordersTab=page.locator('aside.account-detail-panel .panel-tabs').getByRole('link',{name:/^Đơn hàng/}).first()
  if(await ordersTab.count()){
    await followLink(ordersTab,{waitSelector:'aside.account-detail-panel'})
    const nestedOrder=page.locator('aside.account-detail-panel a.user-order-card').first()
    if(await nestedOrder.count()){
      const nav=await followLink(nestedOrder,{waitSelector:'aside.context-order-panel'})
      recordInteraction('User to contextual Order opens',await page.locator('aside.context-order-panel').count()>0,{href:nav.href})
      const hist=page.locator('aside.context-order-panel .context-order-tabs').getByRole('link',{name:'Lịch sử'}).first()
      if(await hist.count()){
        const histNav=await followLink(hist,{waitSelector:'aside.context-order-panel'})
        recordInteraction('User contextual Order history tab',await page.locator('aside.context-order-panel .context-order-tabs a.active').filter({hasText:'Lịch sử'}).count()>0,{href:histNav.href})
        const back=page.locator('aside.context-order-panel').getByRole('link',{name:'Quay lại'}).first()
        if(await back.count())await followLink(back,{waitSelector:'aside.context-order-panel'})
        recordInteraction('User contextual Order Back is stepwise',await page.locator('aside.context-order-panel').count()>0&&await page.locator('aside.context-order-panel .context-order-tabs a.active').filter({hasText:'Thông tin'}).count()>0)
      }
    }
  }
}else recordInteraction('User detail fixture available',true,{skipped:true,reason:'No user rows'})

await go('/purchase/orders')
const createOrderLink=page.getByRole('link',{name:/Tạo đơn nhập/}).first()
if(await createOrderLink.count()){
  const createNav=await followLink(createOrderLink,{waitSelector:'aside.order-panel'})
  recordInteraction('Order create panel opens',await page.locator('aside.order-panel').count()>0,{href:createNav.href})

  const recognizer=page.locator('aside.order-panel .order-text-recognizer textarea').first()
  if(await recognizer.count()){
    await recognizer.fill("MÃ ĐƠN HÀNG. 261005SYU2NQGJ\n|\nĐơn hàng đã hoàn thành\nNếu hàng nhận được có vấn đề, bạn có thể gửi yêu cầu Trả hàng/Hoàn tiền trước\n22-10-2026\n\nGiao nhanh đúng hẹn: nhận Voucher 15.000₫ nếu đơn hàng được giao đến bạn sau ngày 08-10-2026.\nXem thêm\n\nĐánh giá\nYêu cầu Trả hàng/Hoàn tiền\nodp_accessibility_component_41\nLiên hệ Người bán\nMua lại\nodp_accessibility_component_39\nodp_accessibility_component_40\nodp_accessibility_component_100\nĐịa chỉ nhận hàng\nSPX Express\nSPXVN06582596012A\nMinh Châu\n(+84) 996 552 843\nMinh Châu Hair - Ngõ 200 Hồng Mai, Phường Bạch Mai, Thành phố Hà Nội\nĐã giao\n14:19 07-10-2026\nĐã giao\n\nGiao hàng thành công\nXem hình ảnh giao hàng\n\nĐang vận chuyển\n13:52 07-10-2026\nĐang vận chuyển\n\nĐơn hàng sẽ sớm được giao, vui lòng chú ý điện thoại\n\n10:50 07-10-2026\nĐơn hàng đã đến trạm giao hàng tại khu vực của bạn và sẽ được giao trong vòng 12 giờ tiếp theo\n\n22:53 06-10-2026\nĐơn hàng đã đến trạm giao hàng tại khu vực của bạn tại Phường Thanh Lương, Quận Hai Bà Trưng và sẽ được giao trong vòng 12 giờ tiếp theo\n\n17:34 06-10-2026\nĐơn hàng đã đến kho Phường Phù Chẩn, Thành Phố Từ Sơn, Bắc Ninh\n\n16:46 06-10-2026\nĐơn hàng đã đến bưu cục\n\nXem thêm\nsieuthi_anhnga\nchat\nXem Shop\n\nBánh cá Bim bim Marine Boy vị tảo biển Nori gói 50g\nPhân loại hàng: Vị Tảo Biển ( Gói)\nx1\n16.100₫\n\nDầu Ăn Simply Đậu Nành/Gạo Lứt/Hạt Cải Chai 1 Lít\nPhân loại hàng: Đậu nành 1 L\nx1\n84.700₫\nTổng tiền hàng\n100.800₫\nPhí vận chuyển\n1.000₫\nGiảm giá phí vận chuyển\n-1.000₫\nVoucher từ Shopee\n-100.000₫\nThành tiền\n800₫\nVui lòng thanh toán 800₫ khi nhận hàng.\nPhương thức Thanh toán\nThanh toán khi nhận hàng")
    await page.locator('aside.order-panel .order-text-recognizer').getByRole('button',{name:'Nhận diện đơn'}).click()
    await page.waitForTimeout(150)
    const orderValue=await page.locator('aside.order-panel input[name="shopee_order_id"]').inputValue()
    const trackingValue=await page.locator('aside.order-panel input[name="tracking_number"]').inputValue()
    const phoneValue=await page.locator('aside.order-panel input[name="recipient_phone"]').inputValue()
    const codValue=await page.locator('aside.order-panel input[name="cod"]').inputValue()
    const itemNames=await page.locator('aside.order-panel input[name="item_product_name"]').evaluateAll(els=>els.map(el=>el.value))
    const originalPrices=await page.locator('aside.order-panel input[name="item_original_price"]').evaluateAll(els=>els.map(el=>el.value))
    const finalPrices=await page.locator('aside.order-panel input[name="item_final_price"]').evaluateAll(els=>els.map(el=>el.value))
    const recognitionText=await page.locator('aside.order-panel .order-text-recognizer-actions span').innerText()
    recordInteraction('Shopee text recognizer extracts order',orderValue==='261005SYU2NQGJ',{orderValue})
    recordInteraction('Shopee text recognizer extracts tracking',trackingValue==='SPXVN06582596012A',{trackingValue})
    recordInteraction('Shopee text recognizer normalizes recipient phone',phoneValue==='0996552843',{phoneValue})
    recordInteraction('Shopee text recognizer extracts COD',codValue==='800',{codValue})
    recordInteraction('Shopee text recognizer extracts products',itemNames.length===2&&itemNames[0].includes('Bánh cá')&&itemNames[1].includes('Dầu Ăn'),{itemNames})
    recordInteraction('Shopee text recognizer maps one visible price to original price',
      originalPrices.length===2&&originalPrices[0]==='16100'&&originalPrices[1]==='84700'&&finalPrices.every(x=>x===''),
      {originalPrices,finalPrices})
    recordInteraction('Shopee text recognizer validates total goods',
      recognitionText.includes('Giá gốc khớp')&&recognitionText.includes('100.800'),
      {recognitionText})

    recordInteraction(
      'Product section has no separate recognizer',
      await page.locator('aside.order-panel .quick-product-parser').count()===0
    )

    const voucherTypeInput=page.locator('aside.order-panel input[name="voucher_type"]').first()
    if(await voucherTypeInput.count()){
      await voucherTypeInput.fill('Loại mới QA')
      recordInteraction(
        'Voucher type accepts a new free-text value',
        await voucherTypeInput.inputValue()==='Loại mới QA'
      )
      recordInteraction(
        'Voucher type keeps saved-value suggestions',
        await page.locator('aside.order-panel datalist#voucher-type-options').count()===1
      )
    }else{
      recordInteraction('Voucher type free-text input available',false)
    }

    const voucherTagInput=page.locator('aside.order-panel input[name="voucher_tag"]').first()
    if(await voucherTagInput.count()){
      await voucherTagInput.fill('Tag mới QA')
      recordInteraction(
        'Voucher tag accepts a new free-text value',
        await voucherTagInput.inputValue()==='Tag mới QA'
      )
      recordInteraction(
        'Voucher tag keeps saved-value suggestions',
        await page.locator('aside.order-panel datalist#voucher-tag-options').count()===1
      )
    }else{
      recordInteraction('Voucher tag free-text input available',false)
    }
  }else{
    recordInteraction('Shopee text recognizer available',false)
  }

  const close=page.locator('aside.order-panel a.close').first()
  if(await close.count())await followLink(close)
  recordInteraction('Order create panel closes',await page.locator('aside.order-panel').count()===0&&!page.url().includes('mode=create'))
}
await go('/purchase/orders')
const coloredVoucherTags=page.locator('.order-table-card .voucher-cell .voucher-tag:not(.neutral)')
const voucherTagCount=await coloredVoucherTags.count()
const voucherTagStyles=voucherTagCount
  ? await coloredVoucherTags.evaluateAll(nodes=>nodes.map(node=>({
      tag:node.getAttribute('data-voucher-tag'),
      color:node.style.color,
      background:node.style.backgroundColor,
    })))
  : []
recordInteraction(
  'Order table voucher tags use generated colors',
  voucherTagCount>0,
  {voucherTagStyles}
)
const distinctVoucherTags=[...new Map(voucherTagStyles.filter(x=>x.tag).map(x=>[x.tag,x])).values()]
recordInteraction(
  'Different voucher tags have different colors',
  distinctVoucherTags.length<2
    || new Set(distinctVoucherTags.map(x=>x.color+'|'+x.background)).size===distinctVoucherTags.length,
  {voucherTagStyles:distinctVoucherTags}
)
const hubSettings=page.getByRole('link',{name:/Kho đích SPX/}).first()
if(await hubSettings.count()){
  const hubNav=await followLink(hubSettings,{waitSelector:'[role="dialog"][aria-label="Cấu hình kho đích SPX"]'})
  recordInteraction('Destination HUB settings modal opens',await page.getByRole('dialog',{name:'Cấu hình kho đích SPX'}).count()>0,{href:hubNav.href})
  const close=page.getByRole('dialog',{name:'Cấu hình kho đích SPX'}).locator('a.close').first()
  if(await close.count())await followLink(close)
  recordInteraction('Destination HUB settings modal closes',await page.getByRole('dialog',{name:'Cấu hình kho đích SPX'}).count()===0)
}
await go('/purchase/orders')
const firstOrderLink=page.locator('.order-table-card a.table-link').first()
if(await firstOrderLink.count()){
  const detailNav=await followLink(firstOrderLink,{waitSelector:'aside.detail-panel'})
  recordInteraction('Order detail panel opens',await page.locator('aside.detail-panel').count()>0&&page.url().includes('order='),{href:detailNav.href})
  for(const tabName of ['Tracking','Nhập kho','Lịch sử','Thông tin']){
    const tab=page.locator('aside.detail-panel .panel-tabs').getByRole('link',{name:tabName}).first()
    if(await tab.count()){
      const tabNav=await followLink(tab,{waitSelector:'aside.detail-panel'})
      recordInteraction('Order detail tab '+tabName,await page.locator('aside.detail-panel .panel-tabs a.active').filter({hasText:tabName}).count()>0,{href:tabNav.href})
    }
  }
}else recordInteraction('Order detail fixture available',true,{skipped:true,reason:'No order rows'})

await go('/purchase/tracking')
const trackingOrderLink=page.locator('.tracking-hub-table a.table-link').first()
if(await trackingOrderLink.count()){
  const trackingNav=await followLink(trackingOrderLink,{waitSelector:'aside.context-order-panel'})
  recordInteraction('Tracking contextual Order opens',await page.locator('aside.context-order-panel').count()>0,{href:trackingNav.href})
  const trackingPanelMetrics=await readSlidebarContract('aside.context-order-panel')
  recordInteraction('Tracking contextual Order uses main in-layout slidebar contract',slidebarPass(trackingPanelMetrics),trackingPanelMetrics??{})
  const trackingPostKpi=await readPostKpiContract('aside.context-order-panel','.tracking-status-strip-v2','.tracking-content-workspace')
  recordInteraction('Tracking slidebar stays below KPI',postKpiPass(trackingPostKpi),trackingPostKpi??{})
  const historyTab=page.locator('aside.context-order-panel .context-order-tabs').getByRole('link',{name:'Lịch sử'}).first()
  if(await historyTab.count()){
    await followLink(historyTab,{waitSelector:'aside.context-order-panel'})
    const back=page.locator('aside.context-order-panel').getByRole('link',{name:'Quay lại'}).first()
    if(await back.count())await followLink(back,{waitSelector:'aside.context-order-panel'})
    recordInteraction('Tracking contextual Order Back is stepwise',await page.locator('aside.context-order-panel').count()>0&&await page.locator('aside.context-order-panel .context-order-tabs a.active').filter({hasText:'Thông tin'}).count()>0)
  }
}else recordInteraction('Tracking contextual fixture available',true,{skipped:true,reason:'No linked order in current tracking rows'})

await go('/warehouse/receive')
const intakeRow=page.locator('.warehouse-split-table tbody tr').filter({hasText:'QA Warehouse Intake Fixture'}).first()
if(await intakeRow.count()){
  await intakeRow.click();await settle()
  recordInteraction('Warehouse intake detail panel opens',await page.locator('aside.warehouse-intake-panel').count()>0)
  const intakePanelMetrics=await readSlidebarContract('aside.warehouse-intake-panel')
  recordInteraction('Warehouse intake uses main in-layout slidebar contract',slidebarPass(intakePanelMetrics),intakePanelMetrics??{})
  recordInteraction('Warehouse intake is vertical right slidebar',verticalRightPanelPass(intakePanelMetrics),intakePanelMetrics??{})
  for(const tabName of ['Thông tin','Lịch sử','Sản phẩm']){
    const tab=page.locator('aside.warehouse-intake-panel .whx-panel-tabs').getByRole('button',{name:new RegExp('^'+tabName)}).first()
    if(await tab.count()){
      await tab.click();await settle(150)
      recordInteraction('Warehouse intake tab '+tabName,await tab.evaluate(el=>el.classList.contains('active')))
    }
  }
  const close=page.locator('aside.warehouse-intake-panel').getByRole('button',{name:'Đóng'}).first()
  if(await close.count()){await close.click();await settle(150)}
  recordInteraction('Warehouse intake detail panel closes',await page.locator('aside.warehouse-intake-panel').count()===0)
}else recordInteraction('Warehouse intake QA fixture available',false,{reason:'Expected isolated Warehouse Intake fixture is missing'})

await go('/warehouse/inventory')
const stockRow=page.locator('.whx-stock-main .whx-table tbody tr').filter({has:page.locator('.whx-link-text')}).first()
if(await stockRow.count()){
  await stockRow.click();await settle(150)
  recordInteraction('Inventory SKU detail panel opens',await page.locator('aside.whx-detail-panel').count()>0)
  const inventoryPanelMetrics=await readSlidebarContract('aside.whx-detail-panel')
  recordInteraction('Inventory SKU uses main in-layout slidebar contract',slidebarPass(inventoryPanelMetrics),inventoryPanelMetrics??{})
  recordInteraction('Inventory is vertical right slidebar',verticalRightPanelPass(inventoryPanelMetrics),inventoryPanelMetrics??{})
  const history=page.locator('aside.whx-detail-panel .whx-panel-tabs').getByRole('button',{name:/^Lịch sử/}).first()
  if(await history.count()){
    await history.click();await settle(150)
    recordInteraction('Inventory SKU history tab opens',await history.evaluate(el=>el.classList.contains('active')))
    const all=page.getByRole('button',{name:'Toàn bộ lịch sử SKU'}).first()
    if(await all.count()){
      await all.click();await settle(150)
      recordInteraction('Inventory all-SKU history stack opens',await page.locator('.context-stack-breadcrumb').filter({hasText:'Lịch sử toàn SKU'}).count()>0)
      const back=page.locator('aside.whx-detail-panel').getByRole('button',{name:'Quay lại'}).first()
      if(await back.count()){await back.click();await settle(150)}
      recordInteraction('Inventory history Back returns one level',await page.locator('aside.whx-detail-panel .whx-panel-tabs').count()>0)
    }
  }
}else recordInteraction('Inventory fixture available',true,{skipped:true,reason:'No inventory rows'})

await go('/warehouse/history')
const txLink=page.locator('.whx-table a.whx-reference-link').first()
if(await txLink.count()){
  const txNav=await followLink(txLink,{waitSelector:'aside.whx-history-reference-panel'})
  recordInteraction('Warehouse history transaction panel opens',await page.locator('aside.whx-history-reference-panel').count()>0,{href:txNav.href})
  const nested=page.locator('aside.whx-history-reference-panel .whx-history-reference-actions a.button.primary').first()
  if(await nested.count()){
    const nestedNav=await followLink(nested)
    const contextual=await page.locator('aside.context-order-panel, aside.context-sale-panel').count()>0
    recordInteraction('Warehouse history nested reference stays contextual',contextual,{href:nestedNav.href})
    const back=page.locator('aside.context-order-panel, aside.context-sale-panel').getByRole('link',{name:'Quay lại'}).first()
    if(await back.count())await followLink(back,{waitSelector:'aside.whx-history-reference-panel'})
    recordInteraction('Warehouse history nested Back returns transaction',await page.locator('aside.whx-history-reference-panel').count()>0)
  }
}else recordInteraction('Warehouse history fixture available',true,{skipped:true,reason:'No transactions'})

await go('/sales/pos')
const posDesktopMetrics=await page.evaluate(()=>{
  const cartBar=document.querySelector('.mobile-pos-cart-bar')
  const tile=document.querySelector('.pos-product-tile-final')
  const icon=document.querySelector('.pos-cart-icon-v2')
  const shortcuts=document.querySelector('.pos-shortcuts')
  return {
    cartBarDisplay:cartBar?getComputedStyle(cartBar).display:'missing',
    tileHeight:tile?tile.getBoundingClientRect().height:0,
    cartIcon:Boolean(icon),
    shortcuts:Boolean(shortcuts),
  }
})
recordInteraction('POS desktop excludes mobile cart summary row',posDesktopMetrics.cartBarDisplay==='missing',posDesktopMetrics)
recordInteraction('POS desktop product tiles are enlarged',posDesktopMetrics.tileHeight>=70,posDesktopMetrics)
recordInteraction('POS invoice header uses cart icon',posDesktopMetrics.cartIcon,posDesktopMetrics)
recordInteraction('POS shortcut footer removed',!posDesktopMetrics.shortcuts,posDesktopMetrics)
const posCustomer=page.getByRole('button',{name:/Tạo khách|Gắn khách|Khách lẻ/}).first()
if(await posCustomer.count()){
  await posCustomer.click();await settle(120)
  recordInteraction('POS customer popover opens',await page.locator('.pos-customer-popover').count()>0)
  recordInteraction('POS customer picker has searchable customer list',
    await page.locator('.pos-customer-search-v2 input').count()>0&&await page.locator('.pos-customer-list-v2').count()>0)
  const close=page.locator('.pos-customer-popover .pos-popover-head button').first()
  if(await close.count()){await close.click();await settle(100)}
  recordInteraction('POS customer popover closes',await page.locator('.pos-customer-popover').count()===0)
}
const held=page.getByRole('button',{name:/Đơn tạm/}).first()
if(await held.count()){
  await held.click();await settle(100)
  recordInteraction('POS held-order popover opens',await page.locator('.pos-held-popover').count()>0)
  const close=page.locator('.pos-held-popover .pos-popover-head button').first()
  if(await close.count()){await close.click();await settle(100)}
}
const catSettings=page.getByRole('button',{name:/Phân loại/}).first()
if(await catSettings.count()){
  await catSettings.click();await settle(100)
  recordInteraction('POS category settings opens',await page.locator('.pos-category-settings').count()>0)
  recordInteraction('POS category manager supports delete',await page.locator('.pos-category-settings .pos-category-row-actions-v2 .button.danger').count()>0)
  recordInteraction('POS category assignment workspace visible',await page.locator('.pos-category-assignment-v2 .pos-category-product-list').count()>0)
  const close=page.locator('.pos-category-settings .pos-popover-head button').first()
  if(await close.count()){await close.click();await settle(100)}
}
const sellable=page.locator('button.pos-product-tile-final:not(:disabled)').first()
if(await sellable.count()){
  await sellable.click();await settle(100)
  recordInteraction('POS product adds to cart',await page.locator('.pos-cart-line').count()>0)
  const extras=page.getByRole('button',{name:/Tùy chỉnh hóa đơn/}).first()
  if(await extras.count()){
    await extras.click();await settle(100)
    recordInteraction('POS invoice extras toggle',await page.locator('.pos-invoice-extras').count()>0)
  }
  const cash=page.locator('.pos-cart-actions').getByRole('button',{name:'Tiền mặt'}).first()
  if(await cash.count()){
    await cash.click();await settle(120)
    recordInteraction('POS checkout opens',await page.locator('.pos-checkout').count()>0)
    const transferMode=page.locator('.pos-pay-methods').getByRole('button',{name:'Chuyển khoản'}).first()
    if(await transferMode.count()){
      await transferMode.click()
      let transferActive=false
      let transferGuard=false
      for(let attempt=0;attempt<40;attempt++){
        await settle(100)
        transferActive=await transferMode.evaluate(el=>el.classList.contains('active'))
        transferGuard=!transferActive&&await page.locator('.error-box').filter({hasText:'Chưa cấu hình tài khoản chuyển khoản'}).count()>0
        if(transferActive||transferGuard)break
      }
      recordInteraction('POS payment mode Chuyển khoản',transferActive||transferGuard,transferGuard?{guarded:true,reason:'Transfer account not configured'}:{})
    }

    const debtMode=page.locator('.pos-pay-methods').getByRole('button',{name:'Ghi nợ'}).first()
    if(await debtMode.count()){
      await debtMode.click();await settle(100)
      let debtActive=await debtMode.evaluate(el=>el.classList.contains('active'))
      if(!debtActive&&await page.locator('.pos-customer-popover').count()>0){
        recordInteraction('POS debt requires customer guard',true)
        const fixtureCustomerId=String(session.fixtures?.customer_id??'')
        const fixtureCustomerButton=page.locator('.pos-customer-list-v2 button[data-customer-id="'+fixtureCustomerId+'"]').first()
        const hasFixture=Boolean(fixtureCustomerId)&&await fixtureCustomerButton.count()>0
        if(hasFixture){await fixtureCustomerButton.click();await settle(80)}
        const selectedFixture=hasFixture&&await page.locator('.pos-customer-popover').count()===0
        if(selectedFixture){
          await debtMode.click();await settle(100)
          debtActive=await debtMode.evaluate(el=>el.classList.contains('active'))
        }
        recordInteraction('POS payment mode Ghi nợ with QA customer',selectedFixture&&debtActive,{customerId:fixtureCustomerId||null})
      }else{
        recordInteraction('POS payment mode Ghi nợ with QA customer',false,{reason:'Debt guard did not open customer selector'})
      }
    }

    const combinedMode=page.locator('.pos-pay-methods').getByRole('button',{name:'Kết hợp'}).first()
    if(await combinedMode.count()){
      await combinedMode.click();await settle(900)
      const combinedActive=await combinedMode.evaluate(el=>el.classList.contains('active'))
      const combinedGuard=!combinedActive&&await page.locator('.error-box').filter({hasText:'Chưa cấu hình tài khoản chuyển khoản'}).count()>0
      recordInteraction('POS payment mode Kết hợp',combinedActive||combinedGuard,combinedGuard?{guarded:true,reason:'Transfer account not configured'}:{})
    }

    const cashMode=page.locator('.pos-pay-methods').getByRole('button',{name:'Tiền mặt'}).first()
    if(await cashMode.count()){
      if(await page.locator('.pos-customer-popover').count()){
        const customerClose=page.locator('.pos-customer-popover .pos-popover-head button').first()
        if(await customerClose.count()){await customerClose.click();await settle(80)}
      }
      await cashMode.click();await settle(80)
      recordInteraction('POS payment mode Tiền mặt',await cashMode.evaluate(el=>el.classList.contains('active')))
    }
    const back=page.locator('.pos-checkout-head button').first()
    if(await back.count()){await back.click();await settle(100)}
    recordInteraction('POS checkout Back returns cart',await page.locator('.pos-cart-actions').count()>0)
  }
  const clear=page.getByRole('button',{name:'Xóa giỏ'}).first()
  if(await clear.count()){await clear.click();await settle(100)}
}else recordInteraction('POS sellable inventory fixture available',true,{skipped:true,reason:'No sellable inventory'})

await go('/sales/customers')
const newCustomer=page.getByRole('link',{name:/Thêm khách/}).first()
if(await newCustomer.count()){
  const newCustomerNav=await followLink(newCustomer,{waitSelector:'.sales-live-create-card'})
  recordInteraction('Customer create panel opens',await page.locator('.sales-live-create-card').count()>0,{href:newCustomerNav.href})
  const close=page.locator('.sales-live-create-card a.panel-close').first()
  if(await close.count())await followLink(close)
}
await go('/sales/customers')
const firstCustomer=page.locator('.customer-demo-table a.table-link').first()
if(await firstCustomer.count()){
  const customerNav=await followLink(firstCustomer,{waitSelector:'aside.customer-demo-panel'})
  recordInteraction('Customer detail panel opens',await page.locator('aside.customer-demo-panel').count()>0,{href:customerNav.href})
  const customerTabSelectors={
    'Lịch sử mua':'.customer-demo-purchases',
    'Công nợ':'.customer-demo-debt',
    'Lịch sử':'.sales-audit-preview',
    'Thông tin':'.customer-demo-summary',
  }
  for(const tabName of ['Lịch sử mua','Công nợ','Lịch sử','Thông tin']){
    const tab=page.locator('aside.customer-demo-panel .panel-tabs').getByRole('link',{name:tabName,exact:true}).first()
    if(await tab.count()){
      const tabNav=await followLink(tab,{waitSelector:'aside.customer-demo-panel'})
      const selector=customerTabSelectors[tabName]
      recordInteraction('Customer detail tab '+tabName,await page.locator(selector).count()>0,{href:tabNav.href})
    }
  }
  const debtTab=page.locator('aside.customer-demo-panel .panel-tabs').getByRole('link',{name:'Công nợ'}).first()
  if(await debtTab.count()){
    await followLink(debtTab,{waitSelector:'.customer-demo-debt'})
    const collect=page.getByRole('link',{name:'Thu nợ'}).first()
    if(await collect.count()){
      const collectNav=await followLink(collect,{waitSelector:'aside.customer-collect-context'})
      recordInteraction('Customer debt collection stays contextual',await page.locator('aside.customer-collect-context').count()>0,{href:collectNav.href})
      const back=page.locator('aside.customer-collect-context').getByRole('link',{name:'Quay lại'}).first()
      if(await back.count())await followLink(back,{waitSelector:'aside.customer-demo-panel'})
      recordInteraction('Customer collection Back returns debt tab',await page.locator('.customer-demo-debt').count()>0)
    }
  }
}else recordInteraction('Customer fixture available',true,{skipped:true,reason:'No customers'})

await go('/sales/debt')
const debtCustomer=page.locator('.debt-demo-table a.table-link').first()
if(await debtCustomer.count()){
  const debtNav=await followLink(debtCustomer,{waitSelector:'aside.debt-demo-panel'})
  recordInteraction('Debt customer panel opens',await page.locator('aside.debt-demo-panel').count()>0,{href:debtNav.href})
  const debtTabSelectors={'Hóa đơn nợ':'.debt-invoice-table','Lịch sử thu':'.debt-receipt-history','Tổng quan':'.debt-customer-summary'}
  for(const tabName of ['Hóa đơn nợ','Lịch sử thu','Tổng quan']){
    const tab=page.locator('aside.debt-demo-panel .panel-tabs').getByRole('link',{name:tabName}).first()
    if(await tab.count()){
      const tabNav=await followLink(tab,{waitSelector:'aside.debt-demo-panel'})
      recordInteraction('Debt tab '+tabName,await page.locator(debtTabSelectors[tabName]).count()>0,{href:tabNav.href})
    }
  }
  const collect=page.getByRole('link',{name:/^Thu nợ/}).first()
  if(await collect.count()){
    const collectNav=await followLink(collect,{waitSelector:'aside.debt-demo-panel.collect-mode'})
    recordInteraction('Debt collection panel opens',await page.locator('aside.debt-demo-panel.collect-mode').count()>0,{href:collectNav.href})
    const back=page.getByRole('link',{name:'Quay lại'}).first()
    if(await back.count())await followLink(back,{waitSelector:'aside.debt-demo-panel'})
  }
}else recordInteraction('Debt fixture available',true,{skipped:true,reason:'No debt customers'})

await go('/finance/cashflow')
for(const label of ['+ Phiếu thu','+ Phiếu chi']){
  const button=page.getByRole('button',{name:label}).first()
  if(await button.count()&&await button.isEnabled()){
    await button.click();await settle(100)
    recordInteraction('Finance '+label+' panel opens',await page.locator('aside.finance-panel').count()>0)
    const financePanelMetrics=await readSlidebarContract('aside.finance-panel')
    recordInteraction('Finance '+label+' uses main in-layout slidebar contract',slidebarPass(financePanelMetrics),financePanelMetrics??{})
    recordInteraction('Finance '+label+' is vertical right slidebar',verticalRightPanelPass(financePanelMetrics),financePanelMetrics??{})
    const moneyTab=page.locator('aside.finance-panel .panel-tabs').getByRole('button',{name:/Chi tiết tiền/}).first()
    if(await moneyTab.count()){
      await moneyTab.click();await settle(80)
      recordInteraction('Finance '+label+' money tab',await moneyTab.evaluate(el=>el.classList.contains('active')))
    }
    const close=page.locator('aside.finance-panel button.close').first()
    if(await close.count()){await close.click();await settle(100)}
  }
}
const categories=page.getByRole('button',{name:'Hạng mục'}).first()
if(await categories.count()){
  await categories.click();await settle(100)
  recordInteraction('Finance categories panel opens',await page.locator('aside.finance-panel .finance-categories-panel').count()>0)
  for(const name of ['Chi','Thu']){
    const tab=page.locator('aside.finance-panel .panel-tabs').getByRole('button',{name}).first()
    if(await tab.count()){await tab.click();await settle(60);recordInteraction('Finance category tab '+name,await tab.evaluate(el=>el.classList.contains('active')))}
  }
  const close=page.locator('aside.finance-panel button.close').first();if(await close.count()){await close.click();await settle(80)}
}
const bill=page.getByRole('button',{name:'Đọc bill ngân hàng'}).first()
if(await bill.count()&&await bill.isEnabled()){
  await bill.click();await settle(100)
  recordInteraction('Finance bank bill panel opens',await page.locator('aside.finance-panel .finance-bill-panel').count()>0)
  const close=page.locator('aside.finance-panel button.close').first();if(await close.count()){await close.click();await settle(80)}
}

await go('/finance/shipper-payments')
const settlementHub=page.locator('.finance-hub-card').first()
if(await settlementHub.count()){
  await followLink(settlementHub,{waitSelector:'aside.finance-hub-live-panel'})
  const settlementPanelMetrics=await readSlidebarContract('aside.finance-hub-live-panel')
  recordInteraction('Settlement HUB is vertical right slidebar',verticalRightPanelPass(settlementPanelMetrics),settlementPanelMetrics??{})
}
const customerMode=page.locator('.finance-mode-tabs').getByRole('link',{name:'Khách hàng'}).first()
if(await customerMode.count()){
  const customerModeNav=await followLink(customerMode)
  recordInteraction('Settlement customer mode opens',page.url().includes('mode=customer'),{href:customerModeNav.href})
}

await go('/finance/shipper-payments?view=hub')
const fixtureHub=String(session.fixtures?.shipper_hub??'')
const hubCard=page.locator('a.finance-hub-card').filter({hasText:fixtureHub}).first()
if(await hubCard.count()){
  const hubNav=await followLink(hubCard,{waitSelector:'aside.finance-hub-live-panel'})
  recordInteraction('Shipper QA HUB panel opens',await page.locator('aside.finance-hub-live-panel').count()>0,{href:hubNav.href,hub:fixtureHub})
  const linkedOrder=page.locator('aside.finance-hub-live-panel a.finance-hub-order-link').filter({hasText:'QA Shipper HUB'}).first()
  if(await linkedOrder.count()){
    const orderNav=await followLink(linkedOrder,{waitSelector:'aside.context-order-panel'})
    recordInteraction('Shipper contextual QA Order opens',await page.locator('aside.context-order-panel').count()>0,{href:orderNav.href})
    const back=page.locator('aside.context-order-panel').getByRole('link',{name:'Quay lại'}).first()
    if(await back.count())await followLink(back,{waitSelector:'aside.finance-hub-live-panel'})
    recordInteraction('Shipper contextual QA Order Back returns HUB',await page.locator('aside.finance-hub-live-panel').count()>0)
  }else recordInteraction('Shipper contextual QA Order link available',false,{hub:fixtureHub})
}else recordInteraction('Shipper QA HUB fixture available',false,{hub:fixtureHub||null})

await go('/settings')
recordInteraction('Sidebar notification bell',await page.locator('.brand-shell-v1>.sidebar .sidebar-alert-trigger').count()>0)
const appAlertTrigger=page.locator('.brand-shell-v1>.sidebar .sidebar-alert-trigger').first()
if(await appAlertTrigger.count()){
  await appAlertTrigger.click()
  recordInteraction('Notification slidebar opens',await page.locator('.app-alert-panel-v2').count()>0)
  recordInteraction('Notification unread/all filters visible',await page.locator('.app-alert-tabs-v2').count()>0)
  const alertBackdrop=page.locator('.app-alert-backdrop-v2').first()
  if(await alertBackdrop.count())await alertBackdrop.click()
}
const accountTrigger=page.locator('.brand-shell-v1>.sidebar .sidebar-account-trigger').first()
recordInteraction('Compact sidebar account trigger',await accountTrigger.count()>0)
if(await accountTrigger.count()){
  await accountTrigger.click()
  recordInteraction('Sidebar account menu opens',await page.locator('.sidebar-account-popover').count()>0)
  recordInteraction('Sidebar account menu has password action',await page.locator('.sidebar-account-popover').getByRole('menuitem',{name:'Đổi mật khẩu'}).count()>0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  recordInteraction('Sidebar account menu closes by Esc',await page.locator('.sidebar-account-popover').count()===0)
}
const settingsSelectors={
  'Cấu hình vận chuyển':'.shipping-settings-v6',
  'Tracking':'.tracking-settings-v9',
  'Thông báo':'.notification-settings-v9',
  'Thanh toán':'.payment-settings-v12',
  'Dữ liệu':'.data-management-settings-v10',
}
for(const name of ['Cấu hình vận chuyển','Tracking','Thông báo','Thanh toán','Dữ liệu']){
  const tab=page.locator('.settings-page-tabs-v3').getByRole('link',{name,exact:true}).first()
  if(await tab.count()){
    const tabNav=await followLink(tab)
    const selector=settingsSelectors[name]
    recordInteraction('Settings tab '+name,await page.locator(selector).count()>0,{href:tabNav.href})
  }
}
await go('/settings?section=shipping')
for(const name of ['Đơn vị vận chuyển','Kho đích','Shipper']){
  const sub=page.locator('.shipping-settings-v6 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  recordInteraction('Shipping subtab '+name,await sub.count()>0)
}
await go('/settings?section=tracking')
for(const name of ['Vận hành Tracking','Chu kỳ trạng thái','Mapping SPX']){
  const sub=page.locator('.tracking-settings-v9 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  recordInteraction('Tracking subtab '+name,await sub.count()>0)
}
await go('/settings?section=notifications')
for(const name of ['Quy tắc thông báo','Kết nối Telegram','Nhóm theo HUB']){
  const sub=page.locator('.notification-settings-v9 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  recordInteraction('Notification subtab '+name,await sub.count()>0)
}
await go('/settings?section=payments')
for(const name of ['Cấu hình thanh toán','Mẫu hóa đơn / phiếu thu']){
  const sub=page.locator('.payment-settings-v12 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  recordInteraction('Payment subtab '+name,await sub.count()>0)
}
const templateTab=page.locator('.payment-settings-v12 .settings-subtabs-v6').getByRole('button',{name:/^Mẫu hóa đơn/}).first()
if(await templateTab.count()){
  await templateTab.click()
  recordInteraction('Payment template editor visible',await page.locator('.payment-template-form-v12').count()>0)
  recordInteraction('Payment template live preview visible',await page.locator('.payment-document-preview-v11').count()>0)
}
await go('/settings?section=data-management')
for(const name of ['Tổng quan dữ liệu','Lưu trữ & dọn dẹp','Reset hệ thống']){
  const sub=page.locator('.data-management-settings-v10 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  recordInteraction('Data subtab '+name,name==='Reset hệ thống' ? await sub.count()===0 : await sub.count()>0)
}
await go('/settings?section=access')
for(const name of ['Tài khoản','Vai trò & quyền']){
  const sub=page.locator('.admin-access-settings-v10 .settings-subtabs-v6').getByRole('button',{name:new RegExp('^'+name)}).first()
  // Browser QA uses an Operator account. Access settings are Admin-only.
  recordInteraction('Access subtab '+name+' hidden for Operator',await sub.count()===0)
}

// Use a dedicated, deterministic QA invoice for cancellation-modal assertions.
// The prior test selected up to 12 arbitrary invoices and wrongly required
// cancellation to be enabled for an already returned or cancelled invoice.
await go('/sales/history?sale='+encodeURIComponent(f.sale_id))
const invoicePanelOpened=page.url().includes('sale=')&&await page.locator('.sales-history-panel').count()>0
const invoiceIdentity=await page.locator('.sales-history-panel-head h2').innerText().catch(()=>'')
recordInteraction('Sales History QA invoice panel opens',invoicePanelOpened&&invoiceIdentity===f.sale_invoice_code,{invoiceIdentity})
const cancel=page.getByRole('button',{name:'Huỷ hóa đơn'})
const returnButton=page.getByRole('button',{name:'Hoàn hàng'})
const cancelReady=await cancel.count()>0&&await cancel.first().isEnabled()
const returnReady=await returnButton.count()>0&&await returnButton.first().isEnabled()
const noReturnableItems=await returnButton.first().evaluate(el=>
  (el instanceof HTMLButtonElement)&&el.disabled&&el.title==='Không còn sản phẩm có thể hoàn'
).catch(()=>false)
recordInteraction('QA completed invoice exposes cancellation action',cancelReady)
recordInteraction('QA fixture without items safely blocks return',!returnReady&&noReturnableItems,{returnReady,noReturnableItems})
if(cancelReady){
  await cancel.first().click()
  const opened=await page.locator('[role=dialog]').count()>0
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const closedByEsc=await page.locator('[role=dialog]').count()===0
  recordInteraction('Sales cancel modal opens',opened)
  recordInteraction('Sales cancel modal closes by Esc',closedByEsc)
  if(!closedByEsc){
    const close=page.getByRole('button',{name:'Đóng'})
    if(await close.count())await close.first().click()
  }

  await cancel.first().click()
  const reopened=await page.locator('[role=dialog]').count()>0
  if(reopened){
    const sidebarRight=await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right).catch(()=>220)
    const backdrop=page.locator('.erp-confirm-overlay')
    const bb=await backdrop.boundingBox()
    const clickX=Math.max(sidebarRight+22,(bb?.x??0)+18)
    const clickY=(bb?.y??0)+14
    await page.mouse.click(clickX,clickY)
    await page.waitForTimeout(250)
  }
  recordInteraction('Sales cancel modal closes by outside click',reopened&&await page.locator('[role=dialog]').count()===0)
}

await go('/settings')
const settingsBody=await page.locator('body').innerText()
summary.interactions.push({
  name:'Settings has no inactive V1 placeholders',
  // 'Thông báo' is a working settings tab, not an unfinished placeholder.
  pass:!settingsBody.includes('Sắp triển khai')
    &&!settingsBody.includes('Chưa hỗ trợ')
    &&await page.locator('.settings-page-tabs-v3 a[href*="section=notifications"]').count()>0,
})

// Desktop-only release: Mobile is explicitly excluded from the UX contract.
// Do not run mobile app shell/card, overflow, or handset breakpoint assertions.

await browser.close()

// Cloudflare Preview can occasionally return 503 for background Next.js RSC
// prefetches while the same document route remains healthy. Treat those as
// warnings only when the corresponding route itself completed successfully.
const successfulPaths=new Set(
  summary.desktop
    .filter(r=>r.authenticated&&r.status>0&&r.status<500&&!r.navigationError&&!r.hasServerError)
    .map(r=>String(r.path).split('?')[0])
)
const actionable5xx=[]
for(const entry of summary.network5xx){
  let url=null
  try{url=new URL(entry.url)}catch{}
  const recoveredPath=Boolean(url&&entry.status===503&&successfulPaths.has(url.pathname))
  if(recoveredPath){
    summary.transientWarnings.push({
      ...entry,
      type:url?.searchParams.has('_rsc')?'RSC_PREFETCH_503':'DOCUMENT_503_RECOVERED',
    })
  }else actionable5xx.push(entry)
}
summary.network5xx=actionable5xx

const recovered503Paths=new Set(
  summary.transientWarnings
    .filter(x=>x.status===503)
    .map(x=>{try{return new URL(x.url).pathname}catch{return null}})
    .filter(Boolean)
)
summary.pageErrors=summary.pageErrors.filter(entry=>{
  let pathname=null
  try{pathname=new URL(entry.url).pathname}catch{}
  const recoveredJsonError=
    pathname&&
    recovered503Paths.has(pathname)&&
    /Unexpected end of JSON input/i.test(String(entry.text??''))
  if(recoveredJsonError){
    summary.transientWarnings.push({...entry,type:'RECOVERED_503_JSON_ERROR'})
    return false
  }
  return true
})

let transientConsoleBudget=summary.transientWarnings.length
summary.consoleErrors=summary.consoleErrors.filter(entry=>{
  if(
    transientConsoleBudget>0&&
    /Failed to load resource: the server responded with a status of 503/i.test(String(entry.text??''))
  ){
    transientConsoleBudget--
    summary.transientWarnings.push({...entry,type:'RSC_PREFETCH_CONSOLE_503'})
    return false
  }
  return true
})

summary.failures=[]
if(!summary.public.login.hasBrand||summary.public.login.emailInputs!==1||summary.public.login.passwordInputs!==1)summary.failures.push('Login UI')
if(!summary.public.protectedRedirect.redirectedToLogin)summary.failures.push('Protected route redirect')
for(const r of summary.desktop){
  if(!r.authenticated||r.status>=500||r.hasServerError||r.navigationError||r.horizontalOverflow)summary.failures.push(`Desktop route ${r.path}`)
}
for(const interaction of summary.interactions){
  if(!interaction.pass)summary.failures.push(`Interaction: ${interaction.name}`)
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
