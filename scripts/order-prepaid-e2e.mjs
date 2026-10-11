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
async function verify(client,id,amount,type,label,cod,paymentStatus='PAID'){
  const {data,error}=await client.from('orders')
    .select('prepaid_amount,prepaid_source_type,prepaid_source_label,cod,payment_status')
    .eq('id',id).single()
  return {ok:!error&&(amount===null?data?.prepaid_amount===null:Number(data?.prepaid_amount)===amount)
    &&data?.prepaid_source_type===type&&data?.prepaid_source_label===label
    &&Number(data?.cod)===cod&&data?.payment_status===paymentStatus,
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
    let response
    for(let attempt=0;attempt<2;attempt++){
      response=await page.goto(base+route,{waitUntil:'load',timeout:35000})
      if(![502,503,504].includes(response?.status()??0))break
      // A transient edge 503 should not falsely fail payment persistence.
      if(attempt===0)await page.waitForTimeout(2000)
    }
    assert.ok(response?.status()===200,'Preview route '+route+' HTTP '+response?.status())
    assert.ok(!new URL(page.url()).pathname.includes('/login'),'QA login required')
  }
  await go('/purchase/orders?range=all&mode=create')
  const form=page.locator('form.order-editor')
  await form.locator('.user-picker input').fill(f.erp_username)
  await form.locator('.user-picker-menu button').filter({hasText:f.erp_username}).first().click()
  await form.locator('input[name="shopee_order_id"]').fill(f.prepaid_order_code)
  await form.locator('input[name="item_product_name"]').first().fill('Sản phẩm kiểm thử đã thanh toán')
  for(const status of ['UNPAID','PENDING','REFUNDED']){
    await form.locator('select[name="payment_status"]').selectOption(status)
    check('Trạng thái '+status+' ẩn chi tiết thẻ nhưng bắt buộc nhập COD',
      await form.locator('.order-prepaid-fields').count()===0
      &&await form.locator('[name="prepaid_amount"]').count()===0
      &&await form.locator('.order-cod-section input[name="cod"]').isVisible()
      &&await form.locator('.order-cod-section input[name="cod"]').getAttribute('required')!==null)
  }
  await form.locator('select[name="payment_status"]').selectOption('PARTIAL')
  check('Thanh toán một phần có cả chi tiết thẻ và ô COD',
    await form.locator('.order-prepaid-fields').isVisible()
    &&await form.locator('[name="prepaid_amount"]').isEnabled()
    &&await form.locator('[name="prepaid_source_type"]').isEnabled()
    &&await form.locator('.order-cod-section input[name="cod"]').isVisible())
  await form.locator('input[name="cod"]').fill('25000')
  await form.locator('select[name="payment_status"]').selectOption('PAID')
  check('Đã thanh toán tự chuyển COD về 0 và ẩn nhập COD',
    await form.locator('.order-prepaid-fields').isVisible()
    &&await form.locator('.order-cod-section').count()===0
    &&await form.locator('input[name="cod"][type="hidden"]').inputValue()==='0')
  await form.locator('select[name="payment_status"]').selectOption('PARTIAL')
  check('Chuyển lại một phần vẫn giữ COD đã nhập',
    await form.locator('.order-cod-section input[name="cod"]').inputValue()==='25000')
  await form.locator('select[name="payment_status"]').selectOption('PAID')
  await form.locator('.order-prepaid-fields').scrollIntoViewIfNeeded()
  await page.screenshot({path:'qa-order-prepaid-artifacts/payment-fields-before-1440.png',fullPage:false})
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
  await form.getByRole('button',{name:'Hỏa tốc',exact:true}).click()
  check('Tạo đơn chọn Hỏa tốc không làm mất thông tin thẻ đã nhập',
    await form.locator('input[name="shipping_service"]').inputValue()==='EXPRESS'
    &&await form.locator('input[name="prepaid_amount"]').inputValue()==='250000'
    &&await form.locator('select[name="prepaid_source_type"]').inputValue()==='CREDIT_CARD'
    &&await form.locator('input[name="prepaid_source_label"]').inputValue()==='Visa ****1234'
    &&(await form.locator('.order-value-summary').innerText()).includes('250.000'))
  await form.getByRole('button',{name:'Tiêu chuẩn',exact:true}).click()
  await form.getByRole('button',{name:'Tạo đơn'}).click()
  await page.waitForURL(u=>u.pathname==='/purchase/orders'&&u.searchParams.has('order')
    &&!u.searchParams.has('mode'),{timeout:25000})
  const id=new URL(page.url()).searchParams.get('order')
  assert.ok(id,'Order ID missing')
  const persisted=await verify(client,id,250000,'CREDIT_CARD','Visa ****1234',0)
  check('Tạo đơn Đã thanh toán ghi COD 0 dù trước đó nhập 25000',persisted.ok,{data:persisted.data,error:persisted.error})
  await page.reload({waitUntil:'load'})
  const panel=page.locator('.order-panel .detail-grid')
  check('Chi tiết đơn sau reload hiển thị khoản đã trả, thẻ và giá trị đơn',
    (await panel.innerText()).includes('250.000')&&(await panel.innerText()).includes('Visa ****1234')
    &&(await panel.innerText()).includes('Giá trị đơn hàng'))
  await page.getByRole('link',{name:'Sửa đơn'}).click()
  await page.waitForURL(u=>u.searchParams.get('mode')==='edit',{timeout:12000})
  const edit=page.locator('form.order-editor')
  check('Form sửa Đã thanh toán nạp lại thẻ và có COD ẩn bằng 0',
    await edit.locator('input[name="prepaid_amount"]').inputValue()==='250000'
    &&await edit.locator('select[name="prepaid_source_type"]').inputValue()==='CREDIT_CARD'
    &&await edit.locator('input[name="cod"][type="hidden"]').inputValue()==='0')
  await edit.locator('select[name="payment_status"]').selectOption('PARTIAL')
  check('Sửa sang Thanh toán một phần hiển thị lại ô COD',
    await edit.locator('.order-cod-section input[name="cod"]').isVisible())
  await edit.locator('input[name="cod"]').fill('12500')
  await edit.locator('input[name="prepaid_amount"]').fill('275000')
  await edit.locator('select[name="prepaid_source_type"]').selectOption('BANK_ACCOUNT')
  await edit.locator('input[name="prepaid_source_label"]').fill('MB Bank')
  await edit.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.waitForURL(u=>u.searchParams.has('order')&&!u.searchParams.has('mode'),{timeout:25000})
  const updated=await verify(client,id,275000,'BANK_ACCOUNT','MB Bank',12500,'PARTIAL')
  check('Sửa đơn Một phần lưu COD 12500 và tiền trả trước riêng',updated.ok,{data:updated.data,error:updated.error})
  check('Chi tiết Một phần hiển thị giá trị đơn 287.500',
    (await page.locator('.order-panel .detail-grid').innerText()).includes('287.500'))
  await go('/purchase/accounts?range=all&user='+encodeURIComponent(f.erp_user_id)
    +'&tab=orders&order='+encodeURIComponent(id))
  check('Slidebar đơn trong User hiện thanh toán trước và giá trị đơn',
    (await page.locator('.context-order-panel').innerText()).includes('275.000')
    &&(await page.locator('.context-order-panel').innerText()).includes('MB Bank')
    &&(await page.locator('.context-order-panel').innerText()).includes('287.500'))
  await go('/purchase/tracking?range=all&order='+encodeURIComponent(id))
  check('Slidebar đơn trong Tracking hiện thanh toán trước',
    (await page.locator('.context-order-panel').innerText()).includes('275.000')
    &&(await page.locator('.context-order-panel').innerText()).includes('MB Bank'))
  await go('/purchase/orders?range=all&order='+encodeURIComponent(id)+'&mode=edit')
  const paidAgain=page.locator('form.order-editor')
  check('Mở lại đơn Thanh toán một phần vẫn có COD 12500',
    await paidAgain.locator('.order-cod-section input[name="cod"]').inputValue()==='12500')
  await paidAgain.locator('select[name="payment_status"]').selectOption('PAID')
  check('Đổi Một phần thành Đã thanh toán buộc COD thành 0',
    await paidAgain.locator('input[name="cod"][type="hidden"]').inputValue()==='0'
    &&await paidAgain.locator('.order-cod-section').count()===0)
  await paidAgain.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.waitForURL(u=>u.searchParams.has('order')&&!u.searchParams.has('mode'),{timeout:25000})
  const paidNow=await verify(client,id,275000,'BANK_ACCOUNT','MB Bank',0,'PAID')
  check('Lưu sửa Đã thanh toán ghi COD 0 vào Supabase',paidNow.ok,{data:paidNow.data,error:paidNow.error})
  // Verify the reported Hỏa tốc payment regression against the real DB.
  await go('/purchase/orders?range=all&order='+encodeURIComponent(id)+'&mode=edit')
  const express=page.locator('form.order-editor')
  await express.locator('select[name="payment_status"]').selectOption('PARTIAL')
  await express.locator('input[name="cod"]').fill('14000')
  await express.getByRole('button',{name:'Hỏa tốc',exact:true}).click()
  check('Đổi sang Hỏa tốc không mất trường thanh toán và tiền đã nhập',
    await express.locator('input[name="shipping_service"]').inputValue()==='EXPRESS'
    &&await express.locator('input[name="prepaid_amount"]').inputValue()==='275000'
    &&await express.locator('select[name="prepaid_source_type"]').inputValue()==='BANK_ACCOUNT'
    &&await express.locator('input[name="prepaid_source_label"]').inputValue()==='MB Bank'
    &&await express.locator('input[name="cod"]').inputValue()==='14000')
  check('Hỏa tốc Một phần tính giá trị đơn 289.000 trong form',
    (await express.locator('.order-value-summary').innerText()).includes('289.000'))
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width===320?568:width===390?844:width===768?1024:900})
    const g=await express.locator('.order-value-section').evaluate(el=>({
      right:el.getBoundingClientRect().right,width:innerWidth,
    }))
    check('Hỏa tốc giá trị đơn không tràn '+width,g.right<=width+2,g)
  }
  await page.setViewportSize({width:1440,height:900})
  await express.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.waitForURL(u=>u.searchParams.has('order')&&!u.searchParams.has('mode'),{timeout:25000})
  const {data:expressRow,error:expressError}=await client.from('orders')
    .select('shipping_service,cod,payment_status,prepaid_amount,prepaid_source_type,prepaid_source_label')
    .eq('id',id).single()
  check('Hỏa tốc Một phần lưu COD và thẻ đúng trên Supabase',
    !expressError&&expressRow?.shipping_service==='EXPRESS'
    &&expressRow?.payment_status==='PARTIAL'
    &&Number(expressRow?.prepaid_amount)===275000
    &&Number(expressRow?.cod)===14000
    &&expressRow?.prepaid_source_type==='BANK_ACCOUNT'
    &&expressRow?.prepaid_source_label==='MB Bank',{data:expressRow,error:expressError?.message})
  await page.reload({waitUntil:'load'})
  check('Tab Thông tin Hỏa tốc hiển thị giá trị đơn 289.000 và nguồn thẻ',
    (await page.locator('.order-panel .detail-grid').innerText()).includes('289.000')
    &&(await page.locator('.order-panel .detail-grid').innerText()).includes('MB Bank'))
  await page.getByRole('link',{name:'Sửa đơn'}).click()
  await page.waitForURL(u=>u.searchParams.get('mode')==='edit',{timeout:12000})
  const paidExpress=page.locator('form.order-editor')
  check('Sửa Hỏa tốc sau reload còn dữ liệu thanh toán',
    await paidExpress.locator('input[name="shipping_service"]').inputValue()==='EXPRESS'
    &&await paidExpress.locator('input[name="prepaid_amount"]').inputValue()==='275000'
    &&await paidExpress.locator('select[name="prepaid_source_type"]').inputValue()==='BANK_ACCOUNT')
  await paidExpress.locator('select[name="payment_status"]').selectOption('PAID')
  check('Đã thanh toán Hỏa tốc COD = 0 và giá trị bằng tiền đã trả',
    await paidExpress.locator('input[name="cod"][type="hidden"]').inputValue()==='0'
    &&(await paidExpress.locator('.order-value-summary').innerText()).includes('275.000'))
  await paidExpress.getByRole('button',{name:'Lưu thay đổi'}).click()
  await page.waitForURL(u=>u.searchParams.has('order')&&!u.searchParams.has('mode'),{timeout:25000})
  const {data:expressPaid}=await client.from('orders')
    .select('shipping_service,payment_status,cod,prepaid_amount').eq('id',id).single()
  check('Hỏa tốc Đã thanh toán lưu COD 0 và tiền thẻ',
    expressPaid?.shipping_service==='EXPRESS'&&expressPaid?.payment_status==='PAID'
    &&Number(expressPaid?.cod)===0&&Number(expressPaid?.prepaid_amount)===275000)
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
