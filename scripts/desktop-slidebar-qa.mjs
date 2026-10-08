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

const browser=await chromium.launch({
  headless:true,
  ...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
})
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

const results=[]
function push(name,pass,metrics={},detail={}){
  results.push({name,pass:Boolean(pass),...metrics,...detail})
}
async function go(path){
  const target=path.startsWith('http')?path:PREVIEW_URL+path
  let lastStatus=0
  for(let attempt=1;attempt<=4;attempt++){
    const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null)
    lastStatus=res?.status()??0
    await page.waitForTimeout(attempt===1?700:1200*attempt)
    if(lastStatus>0&&lastStatus<500)return
  }
  throw new Error(path+' returned '+lastStatus+' after 4 attempts')
}
async function metric(selector){
  return page.locator(selector).first().evaluate(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el)
    return {
      position:s.position,
      display:s.display,
      left:Math.round(r.left),
      right:Math.round(r.right),
      top:Math.round(r.top),
      bottom:Math.round(r.bottom),
      width:Math.round(r.width),
      height:Math.round(r.height),
      viewportW:innerWidth,
      viewportH:innerHeight,
      overflowX:s.overflowX,
      overflowY:s.overflowY,
    }
  }).catch(()=>null)
}
function verticalRight(m){
  return Boolean(m)
    &&m.position!=='fixed'
    &&m.display!=='none'
    &&m.width>=380&&m.width<=430
    &&m.height>=m.width+60
    &&m.left>=m.viewportW*.65
    &&m.right>=m.viewportW-40
    &&m.right<=m.viewportW+2
    &&m.top>=0
    &&m.bottom<=m.viewportH+4
}
async function shot(name){
  await page.screenshot({path:outDir+'/'+name+'.png',fullPage:false})
}
async function openLink(locator,waitSelector){
  if(!await locator.count())return false
  const href=await locator.first().getAttribute('href')
  if(href){
    await go(href)
  }else{
    await locator.first().click()
    await page.waitForTimeout(350)
  }
  if(waitSelector){
    await page.locator(waitSelector).first().waitFor({state:'visible',timeout:10000}).catch(()=>{})
  }
  await page.waitForTimeout(250)
  return true
}
async function checkPanel(name,selector,file){
  const m=await metric(selector)
  push(name,verticalRight(m),m??{})
  if(m&&file)await shot(file)
}
async function skipped(name,reason){
  push(name,true,{}, {skipped:true,reason})
}

// 01 — Tài khoản mua hàng / detail
await go('/purchase/accounts')
const accountDetailLink=page.locator('.account-table-card a.table-link').first()
if(await openLink(accountDetailLink,'aside.account-detail-panel')){
  await checkPanel('Tài khoản mua hàng — chi tiết','aside.account-detail-panel','01-account-detail')
}else await skipped('Tài khoản mua hàng — chi tiết','No account row')

// 02 — Tài khoản mua hàng / create
await go('/purchase/accounts')
const accountCreateLink=page.getByRole('link',{name:/Thêm tài khoản/}).first()
if(await openLink(accountCreateLink,'aside.account-detail-panel')){
  await checkPanel('Tài khoản mua hàng — tạo mới','aside.account-detail-panel','02-account-create')
}else push('Tài khoản mua hàng — tạo mới',false,{}, {reason:'Create action missing'})

// 03 — Đơn nhập / detail
await go('/purchase/orders')
const orderDetailLink=page.locator('.order-table-card a.table-link').first()
if(await openLink(orderDetailLink,'aside.detail-panel')){
  await checkPanel('Đơn nhập — chi tiết','aside.detail-panel','03-order-detail')
}else await skipped('Đơn nhập — chi tiết','No order row')

// 04 — Đơn nhập / create
await go('/purchase/orders')
const orderCreateLink=page.getByRole('link',{name:/Tạo đơn nhập/}).first()
if(await openLink(orderCreateLink,'aside.order-panel')){
  await checkPanel('Đơn nhập — tạo mới','aside.order-panel','04-order-create')
}else push('Đơn nhập — tạo mới',false,{}, {reason:'Create action missing'})

// 05 — Cảnh báo vận chuyển
await go('/purchase/tracking')
const trackingDetailLink=page.locator('.tracking-hub-table a.table-link').first()
if(await openLink(trackingDetailLink,'aside.context-order-panel')){
  await checkPanel('Cảnh báo vận chuyển — chi tiết đơn','aside.context-order-panel','05-tracking')
}else await skipped('Cảnh báo vận chuyển — chi tiết đơn','No tracking row')

// 06 — Nhập kho
await go('/warehouse/receive')
let intakeRow=page.locator('.warehouse-split-table tbody tr').filter({hasText:'QA Warehouse Intake Fixture'}).first()
if(!await intakeRow.count())intakeRow=page.locator('.warehouse-split-table tbody tr').first()
if(await intakeRow.count()){
  await intakeRow.click()
  await page.waitForTimeout(300)
  await checkPanel('Nhập kho — bóc tách','aside.warehouse-intake-panel','06-warehouse-intake')
}else push('Nhập kho — bóc tách',false,{}, {reason:'No intake row'})

// 07 — Tồn kho
await go('/warehouse/inventory')
const stockRow=page.locator('.whx-stock-main .whx-table tbody tr').filter({has:page.locator('.whx-link-text')}).first()
if(await stockRow.count()){
  await stockRow.click()
  await page.waitForTimeout(300)
  await checkPanel('Tồn kho — chi tiết SKU','aside.whx-detail-panel','07-inventory')
}else await skipped('Tồn kho — chi tiết SKU','No inventory row')

// 08 — Lịch sử kho
await go('/warehouse/history')
const warehouseHistoryLink=page.locator('.whx-table a.whx-reference-link').first()
if(await openLink(warehouseHistoryLink,'aside.whx-history-reference-panel')){
  await checkPanel('Lịch sử kho — chi tiết chứng từ','aside.whx-history-reference-panel','08-warehouse-history')
}else await skipped('Lịch sử kho — chi tiết chứng từ','No warehouse history row')

// 09 — Lịch sử bán
await go('/sales/history')
const saleHistoryLink=page.locator('.sales-history-table a.table-link').first()
if(await openLink(saleHistoryLink,'aside.sales-history-panel')){
  await checkPanel('Lịch sử bán — chi tiết hóa đơn','aside.sales-history-panel','09-sales-history')
}else await skipped('Lịch sử bán — chi tiết hóa đơn','No sales invoice row')

// 10 — Khách hàng
await go('/sales/customers')
const customerDetailLink=page.locator('.customer-demo-table a.table-link').first()
if(await openLink(customerDetailLink,'aside.customer-demo-panel')){
  await checkPanel('Khách hàng — chi tiết','aside.customer-demo-panel','10-customer')
}else await skipped('Khách hàng — chi tiết','No customer row')

// 11 — Công nợ
await go('/sales/debt')
const debtDetailLink=page.locator('.debt-demo-table a.table-link').first()
if(await openLink(debtDetailLink,'aside.debt-demo-panel')){
  await checkPanel('Công nợ — chi tiết','aside.debt-demo-panel','11-debt')
}else await skipped('Công nợ — chi tiết','No debt row')

// 12 — Thu / Chi
await go('/finance/cashflow')
const incomeButton=page.getByRole('button',{name:'+ Phiếu thu'}).first()
if(await incomeButton.count()&&await incomeButton.isEnabled()){
  await incomeButton.click()
  await page.waitForTimeout(300)
  await checkPanel('Thu-Chi — Phiếu thu','aside.finance-panel','12-cashflow')
}else push('Thu-Chi — Phiếu thu',false,{}, {reason:'Income action unavailable'})

// 13 — Đối soát & Thanh toán
await go('/finance/shipper-payments?view=hub')
const fixtureHub=String(session.fixtures?.shipper_hub??'')
let hubLink=fixtureHub
  ?page.locator('a.finance-hub-card').filter({hasText:fixtureHub}).first()
  :page.locator('a.finance-hub-card').first()
if(!await hubLink.count())hubLink=page.locator('a.finance-hub-card').first()
if(await openLink(hubLink,'aside.finance-hub-live-panel')){
  await checkPanel('Đối soát — chi tiết HUB','aside.finance-hub-live-panel','13-settlement')
}else push('Đối soát — chi tiết HUB',false,{}, {reason:'No HUB card'})

const verified=results.filter(x=>!x.skipped)
const failures=verified.filter(x=>!x.pass)
const summary={
  preview:PREVIEW_URL,
  viewport:{width:1440,height:900},
  pass:failures.length===0,
  totals:{
    checks:results.length,
    verified:verified.length,
    skipped:results.filter(x=>x.skipped).length,
    failed:failures.length,
  },
  results,
}
fs.writeFileSync(outDir+'/summary.json',JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))

await browser.close()
if(!summary.pass)process.exit(1)
