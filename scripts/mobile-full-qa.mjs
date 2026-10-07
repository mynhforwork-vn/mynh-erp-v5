import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing mobile QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const outDir='qa-mobile-full-artifacts'
fs.mkdirSync(outDir,{recursive:true})

const summary={
  preview:PREVIEW_URL,
  viewport:{width:390,height:844},
  routes:[],
  checks:[],
  failures:[],
  warnings:[],
}

function check(module,name,pass,detail={}){
  const row={module,name,pass:Boolean(pass),...detail}
  summary.checks.push(row)
  if(!row.pass)summary.failures.push(module+' — '+name)
}
function warn(module,name,detail={}){
  summary.warnings.push({module,name,...detail})
}
async function settle(ms=220){await page.waitForTimeout(ms)}

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
if(error)throw new Error('Cannot serialize QA auth session: '+error.message)

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({
  viewport:{width:390,height:844},
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:2,
})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,
  value:c.value,
  url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),
  secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()

async function go(path){
  let last=null
  const delays=[500,800,1200,1800,2500]
  for(let attempt=1;attempt<=6;attempt++){
    try{
      const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
      await page.waitForTimeout(650)
      const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)
      last={status:res?.status()??0,url:page.url(),body,error:null}
      if(last.status>0&&last.status<500&&!/Internal Server Error|Application error|Something went wrong/i.test(body))return last
    }catch(e){
      last={status:0,url:page.url(),body:'',error:String(e)}
    }
    if(attempt<6)await page.waitForTimeout(delays[attempt-1]??2500)
  }
  return last??{status:0,url:page.url(),body:'',error:'unknown'}
}

async function routeAudit(module,path){
  const r=await go(path)
  const safe=(path.replaceAll('/','-').replace(/^-+/,'')||'home').replace(/[^a-z0-9-_]/gi,'_')
  const metrics=await page.evaluate(()=>{
    const html=document.documentElement
    const body=document.body
    const appBar=document.querySelector('.mobile-app-bar')
    const bottom=document.querySelector('.mobile-bottom-nav')
    const desktopSidebar=document.querySelector('.brand-shell-v1>.sidebar')
    const main=document.querySelector('.brand-shell-v1>.main')
    const visible=el=>{
      const s=getComputedStyle(el)
      const r=el.getBoundingClientRect()
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0
    }
    const clipped=[...document.querySelectorAll('button,a,input,select,textarea')]
      .filter(visible)
      .filter(el=>{
        const r=el.getBoundingClientRect()
        return r.right>innerWidth+2||r.left<-2
      })
      .slice(0,12)
      .map(el=>({tag:el.tagName,text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,50),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}))
    return {
      innerWidth,
      scrollWidth:Math.max(html.scrollWidth,body.scrollWidth),
      appBar:getComputedStyle(appBar).display,
      appBarPosition:getComputedStyle(appBar).position,
      bottom:getComputedStyle(bottom).display,
      bottomPosition:getComputedStyle(bottom).position,
      sidebar:getComputedStyle(desktopSidebar).display,
      mainWidth:Math.round(main?.getBoundingClientRect().width??0),
      clipped,
    }
  }).catch(()=>null)

  const rec={module,path,status:r.status,url:r.url,navigationError:r.error,metrics}
  summary.routes.push(rec)
  check(module,'Mở tab',Boolean(r.status>0&&r.status<500&&!r.url.includes('/login')),{status:r.status,url:r.url})
  if(metrics){
    check(module,'Không cuộn ngang toàn trang',metrics.scrollWidth<=metrics.innerWidth+2,{scrollWidth:metrics.scrollWidth,innerWidth:metrics.innerWidth})
    check(module,'App bar + bottom nav đúng mobile',metrics.sidebar==='none'&&metrics.appBar!=='none'&&metrics.appBarPosition==='fixed'&&metrics.bottom!=='none'&&metrics.bottomPosition==='fixed',metrics)
    check(module,'Không có control bị cắt khỏi viewport',metrics.clipped.length===0,{clipped:metrics.clipped})
  }
  await page.screenshot({path:outDir+'/'+safe+'.png',fullPage:true})
}

async function panelFits(module,selector){
  const found=await page.locator(selector).count()
  if(!found){check(module,'Panel mobile hiển thị',false,{selector});return}
  const m=await page.locator(selector).first().evaluate(el=>{
    const r=el.getBoundingClientRect()
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewportW:innerWidth,viewportH:innerHeight,position:getComputedStyle(el).position}
  })
  check(module,'Panel mobile không tràn viewport',m.left>=-1&&m.right<=m.viewportW+1&&m.top>=0&&m.bottom<=m.viewportH+1,m)
}

async function followLink(locator){
  const href=await locator.getAttribute('href').catch(()=>null)
  if(href){
    const url=new URL(href,PREVIEW_URL)
    const path=url.pathname+url.search+url.hash
    return go(path)
  }
  await locator.click()
  await page.waitForLoadState('domcontentloaded').catch(()=>{})
  await settle(450)
  return {status:200,url:page.url(),body:'',error:null}
}

async function openLinkByName(module,name,selector){
  const link=page.getByRole('link',{name}).first()
  if(!await link.count()){warn(module,'Không tìm thấy link '+String(name));return false}
  const nav=await followLink(link)
  await settle(300)
  const ok=Boolean(nav.status>0&&nav.status<500)&&await page.locator(selector).count()>0
  check(module,'Mở '+String(name),ok,{selector,url:page.url(),status:nav.status,error:nav.error})
  if(ok)await panelFits(module,selector)
  return ok
}

// 0. App navigation shell.
await routeAudit('App shell','/')
let navCount=await page.locator('.mobile-bottom-nav>a,.mobile-bottom-nav>button').count()
check('App shell','Bottom navigation đủ 5 mục',navCount===5,{count:navCount})
const more=page.locator('.mobile-bottom-nav>button').last()
if(await more.count()){
  await more.click();await settle()
  const sheet=page.locator('.mobile-more-sheet')
  check('App shell','Menu Thêm mở',await sheet.count()>0)
  const labels=await sheet.locator('a').allTextContents().catch(()=>[])
  for(const expected of ['Tài khoản mua hàng','Cảnh báo vận chuyển','Nhập kho','Tồn kho','Lịch sử kho','Lịch sử bán','Khách hàng','Công nợ','Thu / Chi','Đối soát','Báo cáo','Cài đặt']){
    check('App shell','Menu Thêm có '+expected,labels.some(x=>x.includes(expected)),{labels})
  }
  await page.keyboard.press('Escape');await settle()
  check('App shell','Menu Thêm đóng bằng Esc',await page.locator('.mobile-more-sheet').count()===0)
}

// 1. Tổng quan hệ thống.
await routeAudit('Tổng quan hệ thống','/')
check('Tổng quan hệ thống','Có nội dung dashboard',await page.locator('.card,.kpi-card,.system-kpi,.dashboard-ops-grid').count()>0)

// 2. Tổng quan mua hàng.
await routeAudit('Tổng quan mua hàng','/purchase')
check('Tổng quan mua hàng','Có KPI/khối vận hành',await page.locator('.kpi-card,.system-kpi,.card').count()>0)

// 3. Tài khoản mua hàng.
await routeAudit('Tài khoản mua hàng','/purchase/accounts')
const accountKpi=await page.locator('.account-kpi-grid .account-kpi').count()
check('Tài khoản mua hàng','Đủ 5 KPI trạng thái',accountKpi===5,{count:accountKpi})
const accountKpiFit=await page.locator('.account-kpi-grid .account-kpi').evaluateAll(nodes=>nodes.every(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})).catch(()=>false)
check('Tài khoản mua hàng','KPI không tràn ngang',accountKpiFit)
check('Tài khoản mua hàng','Có tìm kiếm',await page.locator('input[name=q]').count()>0)
check('Tài khoản mua hàng','Có card mobile',await page.locator('.mobile-account-list .mobile-entity-card').count()>0)

const importBtn=page.getByRole('button',{name:/Import TSV/}).first()
if(await importBtn.count()){
  await importBtn.click();await settle()
  check('Tài khoản mua hàng','Import TSV mở modal',await page.locator('[role=dialog]').count()>0)
  await page.keyboard.press('Escape');await settle()
  check('Tài khoản mua hàng','Import TSV đóng bằng Esc',await page.locator('[role=dialog]').count()===0)
}
if(await openLinkByName('Tài khoản mua hàng',/Thêm tài khoản/,'aside.account-detail-panel')){
  const close=page.locator('aside.account-detail-panel a.close,aside.account-detail-panel button.close').first()
  if(await close.count()){await close.click();await page.waitForLoadState('domcontentloaded').catch(()=>{});await settle()}
  check('Tài khoản mua hàng','Đóng panel thêm tài khoản',await page.locator('aside.account-detail-panel').count()===0)
}
await go('/purchase/accounts')
const firstAccount=page.locator('.mobile-account-list .mobile-card-open').first()
if(await firstAccount.count()){
  const nav=await followLink(firstAccount);await settle(300)
  check('Tài khoản mua hàng','Mở chi tiết User từ card',nav.status>0&&nav.status<500&&await page.locator('aside.account-detail-panel').count()>0,{status:nav.status,url:page.url()})
  if(await page.locator('aside.account-detail-panel').count())await panelFits('Tài khoản mua hàng','aside.account-detail-panel')
  for(const tab of ['Thông tin','Đơn hàng','Lịch sử']){
    const a=page.locator('aside.account-detail-panel .panel-tabs').getByRole('link',{name:new RegExp(tab)}).first()
    if(await a.count()){
      await a.click();await page.waitForLoadState('domcontentloaded').catch(()=>{});await settle()
      check('Tài khoản mua hàng','Tab chi tiết '+tab,await page.locator('aside.account-detail-panel').count()>0)
    }
  }
}

// 4. Đơn nhập hàng.
await routeAudit('Đơn nhập hàng','/purchase/orders')
check('Đơn nhập hàng','Đủ 8 KPI',await page.locator('.order-kpi-grid .kpi-card').count()===8,{count:await page.locator('.order-kpi-grid .kpi-card').count()})
const kpiHeight=await page.locator('.order-kpi-grid .kpi-card').evaluateAll(nodes=>Math.max(0,...nodes.map(el=>el.getBoundingClientRect().height))).catch(()=>999)
check('Đơn nhập hàng','KPI mobile đủ compact',kpiHeight<=64,{maxHeight:kpiHeight})
const dateDetails=page.locator('.mobile-date-picker').first()
check('Đơn nhập hàng','Có bộ lọc ngày mobile',await dateDetails.count()>0)
if(await dateDetails.count()){
  await dateDetails.locator('summary').click();await settle()
  check('Đơn nhập hàng','Mở khoảng ngày tùy chọn',await dateDetails.locator('input[type=date]').count()===2)
  await dateDetails.locator('summary').click();await settle()
}
if(await openLinkByName('Đơn nhập hàng',/Tạo đơn nhập/,'aside.order-panel')){
  const textArea=page.locator('aside.order-panel textarea').first()
  check('Đơn nhập hàng','Form tạo đơn có vùng nhận diện văn bản',await textArea.count()>0)
}
await go('/purchase/orders')
const orderCard=page.locator('.mobile-order-list .mobile-entity-card').first()
if(await orderCard.count()){
  const detail=orderCard.locator('.mobile-card-open').first()
  if(await detail.count()){
    const nav=await followLink(detail);await settle(300)
    check('Đơn nhập hàng','Mở chi tiết đơn từ card',nav.status>0&&nav.status<500&&await page.locator('aside.order-panel,aside.context-order-panel').count()>0,{status:nav.status,url:page.url()})
    const panel='aside.order-panel,aside.context-order-panel'
    if(await page.locator(panel).count())await panelFits('Đơn nhập hàng',panel)
  }
}

// 5. Cảnh báo vận chuyển.
await routeAudit('Cảnh báo vận chuyển','/purchase/tracking?range=all')
check('Cảnh báo vận chuyển','Có KPI trạng thái',await page.locator('.tracking-status-strip-v2 .tracking-status-metric').count()>=5,{count:await page.locator('.tracking-status-strip-v2 .tracking-status-metric').count()})
check('Cảnh báo vận chuyển','Có lọc HUB',await page.locator('select[name=hub]').count()>0)
check('Cảnh báo vận chuyển','Có lọc ngày trạng thái',await page.locator('input[name=receiveDate]').count()>0)
const trackingOrderLink=page.locator('.tracking-hub-stack-v2 a[href*="order="]').first()
if(await trackingOrderLink.count()){
  const nav=await followLink(trackingOrderLink);await settle(300)
  check('Cảnh báo vận chuyển','Mở chi tiết đơn tại context',nav.status>0&&nav.status<500&&await page.locator('aside.context-order-panel').count()>0,{status:nav.status,url:page.url()})
  if(await page.locator('aside.context-order-panel').count())await panelFits('Cảnh báo vận chuyển','aside.context-order-panel')
}

// 6. Tổng quan kho.
await routeAudit('Tổng quan kho','/warehouse')
check('Tổng quan kho','Có nội dung vận hành kho',await page.locator('.card,.kpi-card,.whx-kpi-grid,.tracking-status-strip-v2').count()>0)

// 7. Nhập kho.
await routeAudit('Nhập kho','/warehouse/receive')
check('Nhập kho','Có KPI nhập kho',await page.locator('.tracking-status-strip-v2 .tracking-status-metric').count()>=4)
const intakeOpen=page.locator('.warehouse-intake-workspace button,.whx-intake-layout button').filter({hasText:/Chi tiết|Bóc tách|Xử lý/}).first()
if(await intakeOpen.count()){
  await intakeOpen.click();await settle()
  const panel=page.locator('aside.mynh-slide-panel')
  check('Nhập kho','Mở slidebar xử lý',await panel.count()>0)
  if(await panel.count())await panelFits('Nhập kho','aside.mynh-slide-panel')
}else warn('Nhập kho','Không có đơn QA chờ nhập phù hợp để mở panel')

// 8. Tồn kho.
await routeAudit('Tồn kho','/warehouse/inventory')
const invCard=page.locator('.mobile-inventory-list .mobile-inventory-card').first()
check('Tồn kho','Có card tồn kho mobile',await invCard.count()>0)
if(await invCard.count()){
  await invCard.click();await settle()
  check('Tồn kho','Mở chi tiết SKU',await page.locator('aside.whx-detail-panel-v2').count()>0)
  if(await page.locator('aside.whx-detail-panel-v2').count()){
    await panelFits('Tồn kho','aside.whx-detail-panel-v2')
    const hist=page.locator('aside.whx-detail-panel-v2').getByRole('button',{name:/Lịch sử/}).first()
    if(await hist.count()){await hist.click();await settle();check('Tồn kho','Tab lịch sử SKU',await hist.evaluate(el=>el.classList.contains('active')))}
  }
}

// 9. Lịch sử kho.
await routeAudit('Lịch sử kho','/warehouse/history')
check('Lịch sử kho','Có bộ lọc nghiệp vụ',await page.locator('.whx-history-tabs').count()>0)
const ref=page.locator('.mobile-warehouse-history-list .mobile-warehouse-history-card,.whx-table .whx-reference-link').first()
if(await ref.count()){
  const nav=await followLink(ref);await settle(300)
  check('Lịch sử kho','Mở chi tiết giao dịch',nav.status>0&&nav.status<500&&await page.locator('aside.whx-history-reference-panel').count()>0,{status:nav.status,url:page.url()})
  if(await page.locator('aside.whx-history-reference-panel').count())await panelFits('Lịch sử kho','aside.whx-history-reference-panel')
}

// 10. Tổng quan bán hàng.
await routeAudit('Tổng quan bán hàng','/sales')
check('Tổng quan bán hàng','Có dashboard bán hàng',await page.locator('.sales-dashboard-v2,.card,.sales-kpi').count()>0)

// 11. POS.
await routeAudit('POS','/sales/pos')
check('POS','Có chọn kho bán',await page.locator('.pos-warehouse-v2 select').count()>0)
check('POS','Có tìm SKU/barcode',await page.locator('.pos-search-v2 input').count()>0)
const productCards=page.locator('.pos-product-grid .pos-product-tile-final:not(:disabled)')
check('POS','Có sản phẩm bán được',await productCards.count()>0,{count:await productCards.count()})
if(await productCards.count()){
  const w=await productCards.first().evaluate(el=>el.getBoundingClientRect().width)
  check('POS','Thẻ sản phẩm full-width trên mobile',w>=300,{width:w})
  await productCards.first().click();await settle()
  check('POS','Thêm sản phẩm vào giỏ',await page.locator('.mobile-pos-cart-bar:not(:disabled)').count()>0)
  const cartBar=page.locator('.mobile-pos-cart-bar').first()
  await cartBar.click();await settle()
  check('POS','Mở giỏ hàng mobile',await page.locator('.pos-cart.mobile-open').count()>0)
  if(await page.locator('.pos-cart.mobile-open').count())await panelFits('POS','.pos-cart.mobile-open')
  const cash=page.getByRole('button',{name:'Tiền mặt'}).first()
  if(await cash.count()){await cash.click();await settle();check('POS','Mở thanh toán tiền mặt',await page.locator('.pos-checkout').count()>0)}
}
await go('/sales/pos')
const cat=page.getByRole('button',{name:/Phân loại/}).first()
if(await cat.count()){await cat.click();await settle();check('POS','Mở cài đặt phân loại',await page.locator('.pos-category-settings').count()>0)}
await go('/sales/pos')
const customer=page.getByRole('button',{name:/Khách lẻ|Gắn khách|Tạo khách/}).first()
if(await customer.count()){await customer.click();await settle();check('POS','Mở chọn/tạo khách',await page.locator('.pos-customer-popover').count()>0)}

// 12. Lịch sử bán.
await routeAudit('Lịch sử bán','/sales/history')
check('Lịch sử bán','Có card hóa đơn mobile hoặc trạng thái rỗng',await page.locator('.mobile-sales-history-list .mobile-entity-card,.mobile-sales-history-list .mobile-empty-state').count()>0)
const saleDetail=page.locator('.mobile-sales-history-list .mobile-card-open').first()
if(await saleDetail.count()){
  await saleDetail.click();await page.waitForLoadState('domcontentloaded').catch(()=>{});await settle()
  check('Lịch sử bán','Mở chi tiết hóa đơn',await page.locator('aside.sales-history-panel,aside.sales-detail-panel').count()>0)
}

// 13. Khách hàng.
await routeAudit('Khách hàng','/sales/customers')
check('Khách hàng','Có card khách mobile hoặc trạng thái rỗng',await page.locator('.mobile-customer-list .mobile-entity-card,.mobile-customer-list .mobile-empty-state').count()>0)
if(await openLinkByName('Khách hàng',/Thêm khách/ ,'.sales-live-create-card')){
  check('Khách hàng','Form thêm khách nằm trong viewport',await page.locator('.sales-live-create-card').count()>0)
}
await go('/sales/customers')
const customerDetail=page.locator('.mobile-customer-list .mobile-card-open').first()
if(await customerDetail.count()){
  await customerDetail.click();await page.waitForLoadState('domcontentloaded').catch(()=>{});await settle()
  check('Khách hàng','Mở chi tiết khách hàng',await page.locator('aside.customer-demo-panel').count()>0)
  if(await page.locator('aside.customer-demo-panel').count())await panelFits('Khách hàng','aside.customer-demo-panel')
}

// 14. Công nợ.
await routeAudit('Công nợ','/sales/debt')
check('Công nợ','Có card công nợ mobile hoặc trạng thái rỗng',await page.locator('.mobile-debt-list .mobile-entity-card,.mobile-debt-list .mobile-empty-state').count()>0)
const collect=page.locator('.mobile-debt-list').getByRole('link',{name:/Thu nợ/}).first()
if(await collect.count()){
  await collect.click();await page.waitForLoadState('domcontentloaded').catch(()=>{});await settle()
  check('Công nợ','Mở flow Thu nợ',await page.locator('aside.debt-demo-panel.collect-mode,aside.customer-collect-context').count()>0)
}

// 15. Tổng quan tài chính.
await routeAudit('Tổng quan tài chính','/finance')
check('Tổng quan tài chính','Có KPI tài chính',await page.locator('.finance-kpi,.finance-kpi-grid,.card').count()>0)

// 16. Thu / Chi.
await routeAudit('Thu / Chi','/finance/cashflow')
check('Thu / Chi','Có card giao dịch mobile hoặc trạng thái rỗng',await page.locator('.mobile-finance-list .mobile-finance-card,.mobile-finance-list .mobile-empty-state').count()>0)
for(const label of ['+ Phiếu thu','+ Phiếu chi']){
  await go('/finance/cashflow')
  const b=page.getByRole('button',{name:label}).first()
  if(await b.count()&&await b.isEnabled()){
    await b.click();await settle()
    check('Thu / Chi','Mở '+label,await page.locator('aside.finance-panel').count()>0)
    if(await page.locator('aside.finance-panel').count())await panelFits('Thu / Chi','aside.finance-panel')
  }
}
await go('/finance/cashflow')
const catFinance=page.getByRole('button',{name:'Hạng mục'}).first()
if(await catFinance.count()){await catFinance.click();await settle();check('Thu / Chi','Mở Hạng mục',await page.locator('aside.finance-panel').count()>0)}
await go('/finance/cashflow')
const bill=page.getByRole('button',{name:'Đọc bill ngân hàng'}).first()
if(await bill.count()&&await bill.isEnabled()){await bill.click();await settle();check('Thu / Chi','Mở Đọc bill ngân hàng',await page.locator('aside.finance-panel').count()>0)}

// 17. Đối soát & thanh toán.
await routeAudit('Đối soát & Thanh toán','/finance/shipper-payments')
check('Đối soát & Thanh toán','Có chuyển chế độ đối soát',await page.locator('.finance-mode-tabs').count()>0)
const customerMode=page.locator('.finance-mode-tabs').getByRole('link',{name:/Khách hàng/}).first()
if(await customerMode.count()){
  const nav=await followLink(customerMode);await settle(300)
  check('Đối soát & Thanh toán','Chuyển chế độ Khách hàng',nav.status>0&&nav.status<500&&page.url().includes('mode=customer'),{status:nav.status,url:page.url()})
}

// 18. Báo cáo tài chính.
await routeAudit('Báo cáo tài chính','/finance/reports')
check('Báo cáo tài chính','Có bộ lọc kỳ báo cáo',await page.locator('.finance-period-tabs').count()>0)
check('Báo cáo tài chính','Có KPI báo cáo',await page.locator('.finance-report-kpis .finance-kpi').count()>0)

// 19. Cài đặt.
await routeAudit('Cài đặt hệ thống','/settings')
const settingTabs=['Cấu hình vận chuyển','Tracking','Thông báo','Thanh toán','Dữ liệu']
for(const tabName of settingTabs){
  await go('/settings')
  const tab=page.getByRole('link',{name:tabName,exact:true}).first()
  check('Cài đặt hệ thống','Có tab '+tabName,await tab.count()>0)
  if(await tab.count()){
    const nav=await followLink(tab);await settle(300)
    check('Cài đặt hệ thống','Mở tab '+tabName,nav.status>0&&nav.status<500&&!page.url().includes('/login')&&await page.locator('.settings-workspace-v8').count()>0,{status:nav.status,url:page.url()})
  }
}
await go('/settings')
const adminAccessTab=page.getByRole('link',{name:'Tài khoản & quyền',exact:true}).first()
check('Cài đặt hệ thống','Operator không thấy tab admin-only',await adminAccessTab.count()===0,{count:await adminAccessTab.count()})

// 20. Tài khoản cá nhân.
await routeAudit('Tài khoản','/account')
check('Tài khoản','Trang tài khoản hiển thị',!page.url().includes('/login'))

fs.writeFileSync(outDir+'/summary.json',JSON.stringify(summary,null,2))
await browser.close()

if(summary.failures.length){
  console.error('MOBILE_FULL_QA_FAIL')
  console.error(summary.failures.join('\n'))
  const failedRows=summary.checks.filter(x=>!x.pass)
  console.error('MOBILE_FULL_QA_DETAILS '+JSON.stringify(failedRows))
  process.exit(1)
}
console.log('MOBILE_FULL_QA_PASS checks='+summary.checks.length+' warnings='+summary.warnings.length)
