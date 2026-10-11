// Isolated QA only: create a purchase order for a temporary user, then verify
// payment amount/source persists independently of COD and appears in each slidebar.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {chromium} from 'playwright'
import {createBrowserClient} from '@supabase/ssr'

const base=process.env.PREVIEW_URL
const url=process.env.SUPABASE_URL
const key=process.env.SUPABASE_KEY
assert.ok(base&&url&&key,'Thiếu cấu hình Preview QA')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const f=session.fixtures
assert.ok(f?.prepaid_order_code&&f?.erp_username,'Thiếu fixture thanh toán')
const jar=new Map()
const client=createBrowserClient(url,key,{
  cookies:{
    getAll:()=>[...jar.values()].map(x=>({name:x.name,value:x.value})),
    setAll:items=>items.forEach(x=>jar.set(x.name,x)),
  },
})
const {error:sessionError}=await client.auth.setSession({
  access_token:session.access_token,
  refresh_token:session.refresh_token,
})
if(sessionError)throw sessionError
const browser=await chromium.launch({
  headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})
})
fs.mkdirSync('qa-order-prepaid-artifacts',{recursive:true})
const checks=[]
function check(name,pass,meta={}){
  checks.push({name,pass:Boolean(pass),...meta})
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(meta))
}
async function verify(client,id,amount,type,label,cod){
  const {data,error}=await client.from('orders')
    .select('prepaid_amount,prepaid_source_type,prepaid_source_label,cod,payment_status')
    .eq('id',id).single()
  return {ok:!error&&Number(data?.prepaid_amount)===amount
    &&data?.prepaid_source_type===type&&data?.prepaid_source_label===label
    &&Number(data?.cod)===cod&&data?.payment_status==='PAID',
    data,error:error?.message}
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}})
  await context.addCookies([...jar.values()].map(c=>({
    name:c.name,value:c.value,url:base,secure:c.options?.secure!==false,
    httpOnly:Boolean(c.options?.httpOnly),sameSite:'Lax',
  })))
  const page=await context.newPage()
  async function go(route){
    const response=await page.goto(base+route,{waitUntil:'load',timeout:35000})
    assert.ok(response?.status()===200,'Preview route '+route+' HTTP '+response?.status())
    assert.ok(!new URL(page.url()).pathname.includes('/login'),'QA login required')
  }
  await go('/purchase/orders?range=all&mode=create')
  const form=page.locator('form.order-editor')
  await form.locator('.user-picker input').fill(f.erp_username)
  await form.locator('.user-picker-menu button').filter({hasText:f.erp_username}).first().click()
  await form.locator('input[name="shopee_order_id"]').fill(f.prepaid_order_code)
  await form.locator('input[name="item_product_name"]').first().fill('Sản phẩm kiểm thử đã thanh toán')
  await form.locator('input[name="cod"]').fill('25000')
  check('Khu vực nhập tiền và loại thẻ hiện ngay khi tạo đơn',
    await form.locator('.order-prepaid-fields').isVisible()
    &&await form.locator('input[name="prepaid_amount"]').count()===1
    &&await form.locator('select[name="prepaid_source_type"]').count()===1
    &&await form.locator('input[name="prepaid_amount"]').isDisabled())
  await form.locator('.order-prepaid-fields').scrollIntoViewIfNeeded()
  await page.screenshot({path:'qa-order-prepaid-artifacts/payment-fields-before-1440.png',fullPage:false})
  await form.getByRole('button',{name:'Đã trả bằng tài khoản/thẻ'}).click()
  check('Chọn nhanh thanh toán thẻ cho phép nhập và đổi trạng thái',
    await form.locator('select[name="payment_status"]').inputValue()==='PAID'
    &&await form.locator('input[name="prepaid_amount"]').isEnabled()
    &&await form.locator('select[name="prepaid_source_type"]').isEnabled())
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width===320?568:width===390?844:width===768?1024:900})
    const g=await form.evaluate(form=>{
      const panel=form.closest('.system-slidebar-v1')?.getBoundingClientRect()
      const fields=form.querySelector('.order-prepaid-fields')?.getBoundingClientRect()
      return {panelLeft:panel?.left,panelRight:panel?.right,fieldsRight:fields?.right,viewport:innerWidth}
    })
    check('Form thanh toán không tràn viewport '+width,
      g.panelLeft>=-2&&g.panelRight<=width+2&&g.fieldsRight<=width+2,g)
    if(width===390){
      await form.locator('.order-prepaid-fields').scrollIntoViewIfNeeded()
      await page.screenshot({path:'qa-order-prepaid-artifacts/payment-fields-mobile-390.png',fullPage:false})
    }
  }
  await page.setViewportSize({width:1440,height:900})
  await form.locator('input[name="prepaid_amount"]').fill('250000')
  await form.locator('select[name="prepaid_source_type"]').selectOption('CREDIT_CARD')
  await form.locator('input[name="prepaid_source_label"]').fill('Visa ****1234')
  check('Giao diện nhập đủ ba trường thanh toán',await form.locator('.order-prepaid-fields input').count()===2
    &&await form.locator('select[name="prepaid_source_type"]').count()===1)
  await form.getByRole('button',{name:'Tạo đơn'}).click()
  await page.waitForURL(u=>u.pathname==='/purchase/orders'&&u.searchParams.has('order')
    &&!u.searchParams.has('mode'),{timeout:25000})
  const id=new URL(page.url()).searchParams.get('order')
  assert.ok(id,'Order ID missing')
  const persisted=await verify(client,id,250000,'CREDIT_CARD','Visa ****1234',25000)
  check('Tạo đơn lưu tiền thẻ và giữ nguyên COD 25.000',persisted.ok,{data:persisted.data,error:persisted.error})
  await page.reload({waitUntil:'load'})
  const panel=page.locator('.order-panel .detail-grid')
  check('Chi tiết đơn sau reload hiển thị khoản đã trả, thẻ và COD',
    (await panel.innerText()).includes('250.000')&&(await panel.innerText()).includes('Visa ****1234')
    &&(await panel.innerText()).includes('25.000'))
  await page.getByRole('link',{name:'Sửa đơn'}).click()
  await page.waitForURL(u=>u.searchParams.get('mode')==='edit',{timeout:12000})
  const edit=page.locator('form.order-editor')
  check('Form sửa điền lại thẻ và số tiền',
    await edit.locator('input[name="prepaid_amount"]').inputValue()==='250000'
    &&await edit.locator('select[name="prepaid_source_type"]').inputValue()==='CREDIT_CARD')
  await edit.locator('input[name="prepaid_amount"]').fill('275000')
  await edit.locator('select[name="prepaid_source_type"]').selectOption('BANK_ACCOUNT')
  await edit.locator('input[name="prepaid_source_label"]').fill('MB Bank')
  await edit.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.waitForURL(u=>u.searchParams.has('order')&&!u.searchParams.has('mode'),{timeout:25000})
  const updated=await verify(client,id,275000,'BANK_ACCOUNT','MB Bank',25000)
  check('Sửa đơn cập nhật nguồn tiền không đổi COD',updated.ok,{data:updated.data,error:updated.error})
  await go('/purchase/accounts?range=all&user='+encodeURIComponent(f.erp_user_id)
    +'&tab=orders&order='+encodeURIComponent(id))
  check('Slidebar đơn trong User hiện thanh toán trước',
    (await page.locator('.context-order-panel').innerText()).includes('275.000')
    &&(await page.locator('.context-order-panel').innerText()).includes('MB Bank'))
  await go('/purchase/tracking?range=all&order='+encodeURIComponent(id))
  check('Slidebar đơn trong Tracking hiện thanh toán trước',
    (await page.locator('.context-order-panel').innerText()).includes('275.000')
    &&(await page.locator('.context-order-panel').innerText()).includes('MB Bank'))
  const {data:ledger}=await client.from('finance_transactions').select('id').eq('reference_id',id)
  check('Không sinh bút toán tài chính ngoài ý muốn',(ledger??[]).length===0)
  await context.close()
}finally{await browser.close()}
const failures=checks.filter(x=>!x.pass)
const summary={checks:checks.length,passed:checks.length-failures.length,failed:failures.length,failures}
fs.mkdirSync('qa-order-prepaid-artifacts',{recursive:true})
fs.writeFileSync('qa-order-prepaid-artifacts/summary.json',JSON.stringify(summary,null,2))
console.log('ORDER_PREPAID_E2E '+JSON.stringify(summary))
if(failures.length)process.exit(1)
