// Verify real purchase-account filters and the order-column controls
// on an isolated Cloudflare Preview using a temporary QA login.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const url=process.env.SUPABASE_URL
const key=process.env.SUPABASE_KEY
assert.ok(base&&url&&key,'Thiếu cấu hình QA')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const jar=new Map()
const client=createBrowserClient(url,key,{cookies:{
  getAll:()=>[...jar.values()].map(x=>({name:x.name,value:x.value})),
  setAll:items=>items.forEach(x=>jar.set(x.name,x)),
}})
const {error}=await client.auth.setSession({
  access_token:session.access_token,refresh_token:session.refresh_token,
})
if(error)throw error
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})})
fs.mkdirSync('qa-purchase-filter-columns-artifacts',{recursive:true})
const results=[]
function check(name,pass,details={}){
  results.push({name,pass:Boolean(pass),...details})
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(details))
}
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,secure:c.options?.secure!==false,
    httpOnly:Boolean(c.options?.httpOnly),sameSite:'Lax',
  })))
  const page=await context.newPage()
  const go=async(route)=>{
    const r=await page.goto(base+route,{waitUntil:'load',timeout:45000})
    assert.equal(r?.status(),200,route+' HTTP '+r?.status())
    assert.ok(!new URL(page.url()).pathname.includes('/login'),'Auth required')
  }
  await go('/purchase/accounts?range=all')
  const filter=page.locator('form.account-filter-bar')
  await filter.locator('.p1-filter-trigger[aria-label^="Browser:"]').click()
  check('Browser dropdown opens on account filter bar',
    await filter.getByRole('listbox',{name:'Browser'}).isVisible())
  await filter.getByRole('option',{name:'Chrome',exact:true}).click()
  await page.waitForURL(u=>u.pathname==='/purchase/accounts'&&u.searchParams.get('browser')==='chrome',{timeout:20000})
  check('Browser filter applies immediately and URL persists selection',
    new URL(page.url()).searchParams.get('browser')==='chrome'
    &&await filter.locator('input[name="browser"]').inputValue()==='chrome')
  await filter.locator('.p1-filter-trigger[aria-label^="SPC:"]').click()
  await filter.getByRole('option',{name:'Có SPC_ST'}).click()
  await page.waitForURL(u=>u.searchParams.get('session')==='st',{timeout:20000})
  check('SPC selection preserves Browser selection',
    new URL(page.url()).searchParams.get('browser')==='chrome'
    &&new URL(page.url()).searchParams.get('session')==='st')
  await filter.locator('.p1-filter-trigger[aria-label^="SPC:"]').click()
  await page.keyboard.press('Escape')
  check('Account filter Escape closes the dropdown',
    await filter.getByRole('listbox',{name:'SPC'}).count()===0)
  await filter.locator('.p1-filter-trigger[aria-label^="Số đơn:"]').click()
  await filter.getByRole('option',{name:'0 đơn'}).click()
  await page.waitForURL(u=>u.searchParams.get('orders')==='0',{timeout:20000})
  check('Account order-count filter works and preserves other active filters',
    new URL(page.url()).searchParams.get('orders')==='0'
    &&new URL(page.url()).searchParams.get('session')==='st')
  await page.screenshot({path:'qa-purchase-filter-columns-artifacts/accounts-filter-1440.png',fullPage:false})
  // Reproduce the reported state: a User-scoped order list on the main Preview.
  const qaUser=session.fixtures?.erp_user_id
  assert.ok(qaUser,'Thiếu User QA cho kiểm thử URL lọc theo User')
  await go('/purchase/orders?range=all&user='+encodeURIComponent(qaUser))
  const button=page.getByRole('button',{name:'Sắp xếp cột đơn nhập'})
  check('Nút điều chỉnh cột có một bản duy nhất trong toolbar',
    await button.count()===1&&await page.locator('.order-toolbar .p1-order-column-manager').count()===1)
  const rightOffset=await button.evaluate(el=>{
    const b=el.getBoundingClientRect(),bar=el.closest('.order-toolbar')?.getBoundingClientRect()
    return bar?Math.round(bar.right-b.right):999
  })
  check('Nút điều chỉnh cột nằm sát mép phải toolbar',rightOffset>=0&&rightOffset<=12,{rightOffset})
  check('Nút cột có nhãn tiếng Việt dễ nhận biết', (await button.innerText()).includes('Cột'))
  await button.click()
  const menu=page.getByRole('dialog',{name:'Sắp xếp, ẩn và hiện cột đơn nhập'})
  check('Sắp xếp cột opens a real interactive dialog',await menu.isVisible())
  const hitTest=()=>menu.evaluate(el=>{
    const r=el.getBoundingClientRect()
    // Test a real menu row, not just Playwright's isVisible()
    const row=el.querySelector('.column-manager-row')||el
    const b=row.getBoundingClientRect()
    const x=Math.min(innerWidth-2,Math.max(2,b.left+b.width/2))
    const y=Math.min(innerHeight-2,Math.max(2,b.top+b.height/2))
    const hit=document.elementFromPoint(x,y)
    return {top:r.top,left:r.left,right:r.right,hitTag:hit?.tagName??'',
      clickable:!!hit&&(el===hit||el.contains(hit))}
  })
  const menuHit=await hitTest()
  check('Menu cột nổi trên mọi lớp và nhận click thật',menuHit.clickable,menuHit)
  const keys=()=>page.locator('.order-table thead th[data-order-col]').evaluateAll(rows=>rows.map(x=>x.getAttribute('data-order-col')))
  const original=await keys()
  const voucher=menu.locator('.column-manager-row[data-column-key="voucher"]')
  await voucher.getByRole('button',{name:'Chuyển Voucher lên'}).click()
  const changed=await keys()
  check('Up action changes actual order table column position',
    changed.indexOf('voucher')===original.indexOf('voucher')-1,
    {before:original,after:changed})
  await voucher.locator('input[type="checkbox"]').uncheck()
  check('Hide action removes column from header and table',!(await keys()).includes('voucher'))
  await voucher.locator('input[type="checkbox"]').check()
  check('Show action restores visible column', (await keys()).includes('voucher'))
  await page.reload({waitUntil:'load'})
  await page.locator('.order-table thead th[data-order-col]').first().waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('.order-table th[data-order-col="voucher"]').length>0)
  check('Column position persists across reload',
    (await keys()).indexOf('voucher')===original.indexOf('voucher')-1)
  await button.click()
  await menu.locator('.column-manager-head button').click()
  check('Reset restores default column position',
    (await keys()).indexOf('voucher')===original.indexOf('voucher'))
  await page.keyboard.press('Escape')
  check('Escape closes column manager',await menu.count()===0)
  // Open a detail slidebar, then use the column manager again on the new toolbar.
  // This is where a detached portal used to leave a dead control.
  const firstOrder=page.locator('.order-table tbody .p1-order-identity-cell a').first()
  if(await firstOrder.count()){
    await firstOrder.click()
    await page.waitForURL(u=>u.searchParams.has('order'),{timeout:25000})
    await page.locator('.order-panel').waitFor()
    await button.click()
    check('Nút cột hoạt động khi mở slidebar chi tiết đơn',await menu.isVisible())
    await page.keyboard.press('Escape')
    check('Esc đóng menu khi slidebar đang mở',await menu.count()===0)
    await page.reload({waitUntil:'load'})
    await button.click()
    check('Nút cột vẫn mở được sau reload có slidebar',await menu.isVisible())
    await page.keyboard.press('Escape')
    // On Mobile the detail slidebar intentionally covers its background list.
    // Close it before testing the toolbar at narrow viewports.
    await page.getByRole('link',{name:'Đóng chi tiết đơn'}).click()
    await page.waitForURL(u=>!u.searchParams.has('order'),{timeout:20000})
  }
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height})
    await button.click()
    const g=await menu.evaluate(el=>{
      const b=el.getBoundingClientRect()
      return {left:b.left,right:b.right,bottom:b.bottom,viewport:innerWidth}
    })
    const h=await hitTest()
    check('Column manager visible and bounded '+width,g.left>=-1&&g.right<=width+2&&h.clickable,
      {...g,clickable:h.clickable,hitTag:h.hitTag})
    if(width===390)await page.screenshot({path:'qa-purchase-filter-columns-artifacts/orders-columns-mobile-390.png',fullPage:false})
    await page.keyboard.press('Escape')
  }
  await context.close()
}finally{await browser.close()}
const errors=results.filter(x=>!x.pass)
const summary={checks:results.length,passed:results.length-errors.length,failed:errors.length,errors}
fs.writeFileSync('qa-purchase-filter-columns-artifacts/summary.json',JSON.stringify(summary,null,2))
console.log('PURCHASE_FILTER_COLUMN_E2E '+JSON.stringify(summary))
if(errors.length)process.exit(1)
