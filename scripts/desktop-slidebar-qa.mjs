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
async function openLink(locator,waitSelector){
  if(!await locator.count())return false
  const href=await locator.first().getAttribute('href')
  if(href){
    const target=href.startsWith('http')?href:PREVIEW_URL+href
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000})
  }else{
    await locator.first().click()
  }
  if(waitSelector)await page.locator(waitSelector).first().waitFor({state:'visible',timeout:10000}).catch(()=>{})
  await page.waitForTimeout(350)
  return true
}
async function checkPanel(name,selector,file){
  const m=await metric(selector)
  push(name,vertical(m),m??{})
  if(m&&file)await shot(file)
}

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



/* 5. Tài khoản mua hàng — detail + create */
await go('/purchase/accounts')
let userLink=page.locator('.account-table-card a.table-link').first()
if(await openLink(userLink,'aside.account-detail-panel')){
  await checkPanel('Tài khoản — chi tiết slidebar dọc bên phải','aside.account-detail-panel','05-account-detail')
}else push('Tài khoản — có dữ liệu mở chi tiết',true,{}, {skipped:true,reason:'No account row'})
await go('/purchase/accounts')
const addAccount=page.getByRole('link',{name:/Thêm tài khoản/}).first()
if(await openLink(addAccount,'aside.account-detail-panel')){
  await checkPanel('Tài khoản — tạo mới slidebar dọc bên phải','aside.account-detail-panel','06-account-create')
}else push('Tài khoản — có nút Thêm tài khoản',false)

/* 6. Đơn nhập — detail + create */
await go('/purchase/orders')
let orderLink=page.locator('.order-table-card a.table-link').first()
if(await openLink(orderLink,'aside.detail-panel')){
  await checkPanel('Đơn nhập — chi tiết slidebar dọc bên phải','aside.detail-panel','07-order-detail')
}else push('Đơn nhập — có dữ liệu mở chi tiết',true,{}, {skipped:true,reason:'No order row'})
await go('/purchase/orders')
const createOrder=page.getByRole('link',{name:/Tạo đơn nhập/}).first()
if(await openLink(createOrder,'aside.order-panel')){
  await checkPanel('Đơn nhập — tạo mới slidebar dọc bên phải','aside.order-panel','08-order-create')
}else push('Đơn nhập — có nút Tạo đơn nhập',false)

/* 7. Cảnh báo vận chuyển — contextual order */
await go('/purchase/tracking')
const trackingLink=page.locator('.tracking-hub-table a.table-link').first()
if(await openLink(trackingLink,'aside.context-order-panel')){
  await checkPanel('Cảnh báo vận chuyển — chi tiết đơn slidebar dọc bên phải','aside.context-order-panel','09-tracking-order')
}else push('Cảnh báo vận chuyển — có đơn mở chi tiết',true,{}, {skipped:true,reason:'No tracking order row'})

/* 8. Lịch sử kho */
await go('/warehouse/history')
const tx=page.locator('.whx-table a.whx-reference-link').first()
if(await openLink(tx,'aside.whx-history-reference-panel')){
  await checkPanel('Lịch sử kho — chứng từ slidebar dọc bên phải','aside.whx-history-reference-panel','10-warehouse-history')
}else push('Lịch sử kho — có chứng từ mở chi tiết',true,{}, {skipped:true,reason:'No warehouse transaction'})

/* 9. Lịch sử bán */
await go('/sales/history')
const saleLink=page.locator('.sales-history-table .table-link').first()
if(await openLink(saleLink,'.sales-history-panel')){
  await checkPanel('Lịch sử bán — hóa đơn slidebar dọc bên phải','.sales-history-panel','11-sales-history')
}else push('Lịch sử bán — có hóa đơn mở chi tiết',true,{}, {skipped:true,reason:'No sales invoice'})

/* 10. Khách hàng */
await go('/sales/customers')
const customerLink=page.locator('.customer-demo-table a.table-link').first()
if(await openLink(customerLink,'aside.customer-demo-panel')){
  await checkPanel('Khách hàng — chi tiết slidebar dọc bên phải','aside.customer-demo-panel','12-customer')
}else push('Khách hàng — có dữ liệu mở chi tiết',true,{}, {skipped:true,reason:'No customer row'})

/* 11. Công nợ */
await go('/sales/debt')
const debtLink=page.locator('.debt-demo-table a.table-link').first()
if(await openLink(debtLink,'aside.debt-demo-panel')){
  await checkPanel('Công nợ — chi tiết slidebar dọc bên phải','aside.debt-demo-panel','13-debt')
}else push('Công nợ — có dữ liệu mở chi tiết',true,{}, {skipped:true,reason:'No debt row'})

const pass=results.every(x=>x.pass)
const summary={preview:PREVIEW_URL,viewport:{width:1440,height:900},pass,results}
fs.writeFileSync(outDir+'/summary.json',JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))

await browser.close()
if(!pass)process.exit(1)
