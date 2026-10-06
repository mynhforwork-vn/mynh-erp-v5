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
  mobile:[],
  interactions:[],
  consoleErrors:[],
  pageErrors:[],
  network5xx:[],
}

function recordInteraction(name,pass,detail={}){
  summary.interactions.push({name,pass:Boolean(pass),...detail})
}

async function settle(ms=1100){
  await page.waitForTimeout(ms)
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
    await page.locator('.sales-action-backdrop').click({position:{x:4,y:4}})
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
  const close=page.locator('aside.order-panel a.close').first()
  if(await close.count())await followLink(close)
  recordInteraction('Order create panel closes',await page.locator('aside.order-panel').count()===0&&!page.url().includes('mode=create'))
}
await go('/purchase/orders')
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
const posCustomer=page.getByRole('button',{name:/Tạo khách|Gắn khách/}).first()
if(await posCustomer.count()){
  await posCustomer.click();await settle(120)
  recordInteraction('POS customer popover opens',await page.locator('.pos-customer-popover').count()>0)
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
        const customerSelect=page.locator('.pos-customer-popover select').first()
        const fixtureCustomerId=String(session.fixtures?.customer_id??'')
        const hasFixture=fixtureCustomerId&&await customerSelect.locator('option[value="'+fixtureCustomerId+'"]').count()>0
        if(hasFixture)await customerSelect.selectOption(fixtureCustomerId)
        const selectedFixture=hasFixture&&await customerSelect.inputValue()===fixtureCustomerId
        const customerClose=page.locator('.pos-customer-popover .pos-popover-head button').first()
        if(await customerClose.count()){await customerClose.click();await settle(80)}
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
const settingsSelectors={
  'Đơn vị vận chuyển':'.carrier-settings',
  'SPX · Kho đích & Shipper':'.destination-master-detail',
  'Thanh toán & QR':'.bank-transfer-settings',
  'Quản lý dữ liệu':'.data-management-settings',
}
for(const name of ['Đơn vị vận chuyển','SPX · Kho đích & Shipper','Thanh toán & QR','Quản lý dữ liệu']){
  const tab=page.locator('.settings-page-tabs-v3').getByRole('link',{name}).first()
  if(await tab.count()){
    const tabNav=await followLink(tab)
    const selector=settingsSelectors[name]
    recordInteraction('Settings tab '+name,await page.locator(selector).count()>0,{href:tabNav.href})
  }
}

await go('/sales/history')
const invoiceLinks=page.locator('.sales-history-table .table-link')
const invoiceHrefs=[]
for(let i=0;i<Math.min(await invoiceLinks.count(),12);i++){
  const href=await invoiceLinks.nth(i).getAttribute('href')
  if(href)invoiceHrefs.push(href)
}

let invoicePanelOpened=false
let returnableInvoiceFound=false
for(const href of invoiceHrefs){
  await go(href)
  invoicePanelOpened=page.url().includes('sale=')&&await page.locator('.sales-history-panel').count()>0
  const candidate=page.getByRole('button',{name:'Hoàn hàng'})
  if(invoicePanelOpened&&await candidate.count()>0&&await candidate.first().isEnabled()){
    returnableInvoiceFound=true
    break
  }
}
summary.interactions.push({name:'Sales History invoice panel opens',pass:invoicePanelOpened})
summary.interactions.push({name:'Sales History returnable invoice found',pass:returnableInvoiceFound})

const cancel=page.getByRole('button',{name:'Huỷ hóa đơn'})
const returnButton=page.getByRole('button',{name:'Hoàn hàng'})
const cancelReady=await cancel.count()>0&&await cancel.first().isEnabled()
const returnReady=await returnButton.count()>0&&await returnButton.first().isEnabled()
summary.interactions.push({name:'Sales History cancellation action available',pass:cancelReady})
summary.interactions.push({name:'Sales History return action available',pass:returnReady})
if(cancelReady){
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

  await cancel.first().click()
  const reopened=await page.locator('[role=dialog]').count()>0
  if(reopened){
    await page.locator('.sales-action-backdrop').click({position:{x:4,y:4}})
    await page.waitForTimeout(250)
  }
  summary.interactions.push({
    name:'Sales cancel modal closes by outside click',
    pass:reopened&&await page.locator('[role=dialog]').count()===0,
  })
}
if(returnReady){
  await returnButton.first().click()
  const returnOpened=await page.locator('[role=dialog]').count()>0
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  summary.interactions.push({
    name:'Sales return modal opens and closes by Esc',
    pass:returnOpened&&await page.locator('[role=dialog]').count()===0,
  })
}

await go('/settings')
const settingsBody=await page.locator('body').innerText()
summary.interactions.push({
  name:'Settings has no inactive V1 placeholders',
  pass:!settingsBody.includes('Tài khoản & phân quyền')&&!settingsBody.includes('Tích hợp')&&!settingsBody.includes('Thông báo'),
})

await page.setViewportSize({width:390,height:844})
for(const path of ['/purchase/orders','/purchase/tracking','/warehouse','/warehouse/receive','/sales/pos','/sales/history','/sales/customers','/sales/debt']){
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
    navigationError:r.navigationError,
    ...metrics,
  })
  const safe=path.replaceAll('/','-').replace(/^-+/,'')
  await page.screenshot({path:`${outDir}/mobile-${safe}.png`,fullPage:true})
  fs.writeFileSync(`${outDir}/summary-partial.json`,JSON.stringify(summary,null,2))
}

await browser.close()

summary.failures=[]
if(!summary.public.login.hasBrand||summary.public.login.emailInputs!==1||summary.public.login.passwordInputs!==1)summary.failures.push('Login UI')
if(!summary.public.protectedRedirect.redirectedToLogin)summary.failures.push('Protected route redirect')
for(const r of summary.desktop){
  if(!r.authenticated||r.status>=500||r.hasServerError||r.navigationError||r.horizontalOverflow)summary.failures.push(`Desktop route ${r.path}`)
}
for(const r of summary.mobile){
  if(!r.authenticated||r.status>=500||r.navigationError||r.horizontalOverflow)summary.failures.push(`Mobile route ${r.path}`)
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
