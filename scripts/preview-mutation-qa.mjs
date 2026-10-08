import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'
import fs from 'node:fs'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY||!SERVICE_KEY)throw new Error('Missing mutation QA environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const f=session.fixtures
if(!f)throw new Error('Missing QA fixture metadata')

const outDir='qa-browser-artifacts'
fs.mkdirSync(outDir,{recursive:true})
const summary={mutations:[],consoleErrors:[],pageErrors:[],network5xx:[],failures:[]}

function record(name,pass,detail={}){
  const row={name,pass:Boolean(pass),...detail}
  summary.mutations.push(row)
  console.log('QA_MUTATION_CHECK '+JSON.stringify(row))
  if(!row.pass)summary.failures.push('Mutation: '+name)
}
function persist(extra){
  Object.assign(f,extra)
  session.fixtures=f
  fs.writeFileSync('qa-session.json',JSON.stringify(session))
}
async function admin(path){
  const res=await fetch(SUPABASE_URL+path,{
    headers:{apikey:SERVICE_KEY,authorization:'Bearer '+SERVICE_KEY},
  })
  const text=await res.text()
  let json=null
  try{json=JSON.parse(text)}catch{}
  if(!res.ok)throw new Error('Admin verify failed '+res.status+' '+path+' '+text.slice(0,300))
  return json
}
async function first(path){
  const rows=await admin(path)
  return Array.isArray(rows)?rows[0]??null:null
}
async function waitFor(check,{attempts=30,delay=350}={}){
  for(let i=0;i<attempts;i++){
    const value=await check()
    if(value)return value
    await new Promise(r=>setTimeout(r,delay))
  }
  return null
}

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
if(setSessionError)throw new Error('Unable to serialize mutation QA session: '+setSessionError.message)

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:900}})
await context.addCookies([...cookieMap.values()].map(c=>({
  name:c.name,value:c.value,url:PREVIEW_URL,
  httpOnly:Boolean(c.options?.httpOnly),
  secure:c.options?.secure!==false,
  sameSite:c.options?.sameSite==='strict'?'Strict':c.options?.sameSite==='none'?'None':'Lax',
})))
const page=await context.newPage()
page.on('console',m=>{if(m.type()==='error')summary.consoleErrors.push({url:page.url(),text:m.text()})})
page.on('pageerror',e=>summary.pageErrors.push({url:page.url(),text:String(e)}))
page.on('response',r=>{if(r.status()>=500)summary.network5xx.push({url:r.url(),status:r.status()})})

async function go(path){
  let lastStatus=0
  for(let attempt=1;attempt<=3;attempt++){
    const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
    lastStatus=res?.status()??0
    await page.waitForTimeout(attempt===1?800:1200)
    if(lastStatus<500)return
  }
  throw new Error('Navigation failed '+path+' status='+lastStatus)
}

// Baseline DB state must be isolated and clean before mutation.
const baselineOrder=await first('/rest/v1/orders?select=id,warehouse_status,receive_status&id=eq.'+encodeURIComponent(f.warehouse_order_id))
const baselineItem=await first('/rest/v1/order_items?select=id,product_variant_id,quantity,inventory_multiplier&id=eq.'+encodeURIComponent(f.warehouse_item_id))
const baselineSales=await admin('/rest/v1/sales?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id))
record('Baseline warehouse order is ready',baselineOrder?.warehouse_status==='READY_TO_TRANSFER'&&baselineOrder?.receive_status==='RECEIVED')
record('Baseline warehouse item is unmapped',baselineItem?.product_variant_id===null&&Number(baselineItem?.quantity)===Number(f.mutation_stock_quantity))
record('Baseline mutation customer has no sales or debt',
  Array.isArray(baselineSales)&&baselineSales.length===0,
  {count:baselineSales?.length??-1})

// 1) Warehouse Intake mutation: map SKU through real UI.
await go('/warehouse/receive')
const splitRow=page.locator('.warehouse-split-table tbody tr').filter({hasText:f.warehouse_order_code}).first()
if(!await splitRow.count())throw new Error('Warehouse mutation fixture row is missing')
await splitRow.click()
await page.locator('aside.warehouse-intake-panel').waitFor({state:'visible',timeout:5000})

const mapForm=page.locator('aside.warehouse-intake-panel .whx-map-form').first()
if(!await mapForm.count())throw new Error('Warehouse mapping form is missing')
await mapForm.locator('input[name="sale_sku"]').fill(f.sale_sku)
await mapForm.locator('input[name="sale_product_name"]').fill(f.mutation_product_name)
await mapForm.locator('input[name="sale_variant_name"]').fill('QA')
await mapForm.locator('input[name="sale_price"]').fill(String(f.mutation_sale_price))
await mapForm.locator('input[name="inventory_multiplier"]').fill('1')
await mapForm.getByRole('button',{name:'Lưu bóc tách'}).click()

const mappedItem=await waitFor(async()=>{
  const row=await first('/rest/v1/order_items?select=id,product_variant_id,inventory_multiplier&id=eq.'+encodeURIComponent(f.warehouse_item_id))
  return row?.product_variant_id?row:null
})
record('Warehouse mapping writes product_variant_id',Boolean(mappedItem?.product_variant_id))
if(!mappedItem?.product_variant_id)throw new Error('Warehouse mapping did not persist')

const variantId=String(mappedItem.product_variant_id)
const variant=await first('/rest/v1/product_variants?select=id,product_id,variant_name,sale_price&id=eq.'+encodeURIComponent(variantId))
const product=variant?.product_id
  ? await first('/rest/v1/products?select=id,sku,name,note&id=eq.'+encodeURIComponent(variant.product_id))
  : null
persist({mutation_variant_id:variantId,mutation_product_id:String(variant?.product_id??'')})
record('Warehouse mapping creates isolated QA SKU',product?.sku===f.sale_sku&&product?.name===f.mutation_product_name&&Number(variant?.sale_price)===Number(f.mutation_sale_price),{variantId})

// 1b) Real stock receipt mutation.
await go('/warehouse/receive')
const readyRow=page.locator('.warehouse-ready-table tbody tr').filter({hasText:f.warehouse_order_code}).first()
if(!await readyRow.count())throw new Error('Mapped QA order did not move to ready table')
await readyRow.click()
await page.locator('aside.warehouse-intake-panel').waitFor({state:'visible',timeout:5000})
const receiveButton=page.locator('aside.warehouse-intake-panel').getByRole('button',{name:'Nhập kho'}).first()
await receiveButton.waitFor({state:'visible',timeout:6000}).catch(()=>{})
if(!await receiveButton.count()||!await receiveButton.isVisible().catch(()=>false))throw new Error('Warehouse receive button is missing')
await receiveButton.click()

const receivedOrder=await waitFor(async()=>{
  const row=await first('/rest/v1/orders?select=id,warehouse_status&id=eq.'+encodeURIComponent(f.warehouse_order_id))
  return row?.warehouse_status==='WAREHOUSE_RECEIVED'?row:null
})
record('Warehouse receive updates order status',Boolean(receivedOrder))

const purchaseTx=await first('/rest/v1/inventory_transactions?select=id,tx_type,quantity,warehouse_id,product_variant_id,reference_type,reference_id&reference_type=eq.PURCHASE_RECEIPT&reference_id=eq.'+encodeURIComponent(f.warehouse_order_id))
record('Warehouse receive creates purchase inventory transaction',
  purchaseTx?.tx_type==='IN'&&
  Number(purchaseTx?.quantity)===Number(f.mutation_stock_quantity)&&
  String(purchaseTx?.warehouse_id)===String(f.warehouse_id)&&
  String(purchaseTx?.product_variant_id)===variantId
)
const balanceAfterReceive=await first('/rest/v1/inventory_balances?select=quantity&warehouse_id=eq.'+encodeURIComponent(f.warehouse_id)+'&product_variant_id=eq.'+encodeURIComponent(variantId))
record('Inventory balance increases after receive',Number(balanceAfterReceive?.quantity)===Number(f.mutation_stock_quantity),{quantity:Number(balanceAfterReceive?.quantity??0)})

// 2) POS mutation: sell the received QA SKU as full debt.
await go('/sales/pos')
const warehouseSelect=page.locator('.pos-warehouse select').first()
await warehouseSelect.selectOption(String(f.warehouse_id))
const search=page.getByRole('textbox',{name:'Tìm sản phẩm theo barcode, SKU hoặc tên'}).first()
await search.fill(f.sale_sku)
await page.waitForTimeout(250)
const tile=page.locator('button.pos-product-tile-final').filter({hasText:f.sale_sku}).first()
await tile.waitFor({state:'visible',timeout:5000})
await tile.click()

const customerButton=page.locator('.pos-control-actions button').first()
await customerButton.click()
// POS V2 uses searchable customer buttons, not the retired <select>.
await page.locator('.pos-customer-search-v2 input').fill(f.customer_name)
const choice=page.locator('.pos-customer-list-v2 button[data-customer-id="'+String(f.customer_id)+'"]').first()
await choice.waitFor({state:'visible',timeout:5000})
await choice.click()
await page.locator('.pos-customer-popover').waitFor({state:'hidden',timeout:5000})

const extras=page.getByRole('button',{name:/Tùy chỉnh hóa đơn/}).first()
if(await extras.count()){
  await extras.click()
  const note=page.locator('textarea[placeholder*="Ghi chú hóa đơn"]').first()
  if(await note.count())await note.fill(f.marker)
}
await page.locator('.pos-cart-actions').getByRole('button',{name:'Ghi nợ'}).click()
await page.locator('.pos-checkout').waitFor({state:'visible',timeout:5000})
record('POS debt checkout opens with fixture customer',await page.locator('.pos-checkout-customer').filter({hasText:f.customer_name}).count()>0)
await page.locator('.pos-confirm-payment').click()
await page.locator('.pos-success-layer').waitFor({state:'visible',timeout:10000})
record('POS creates debt sale success state',await page.locator('.pos-success-layer').filter({hasText:'Đã ghi nợ'}).count()>0)

const saleHref=await page.locator('.pos-success-actions').getByRole('link',{name:'Xem hóa đơn'}).getAttribute('href')
const saleId=saleHref?new URL(saleHref,PREVIEW_URL).searchParams.get('sale'):null
if(!saleId)throw new Error('POS mutation did not expose sale id')
persist({mutation_sale_id:saleId})

const sale=await first('/rest/v1/sales?select=id,customer_id,warehouse_id,total_amount,paid_amount,debt_amount,payment_status,sale_status,note,invoice_code&id=eq.'+encodeURIComponent(saleId))
record('POS debt sale persists expected totals',
  String(sale?.customer_id)===String(f.customer_id)&&
  String(sale?.warehouse_id)===String(f.warehouse_id)&&
  Number(sale?.total_amount)===Number(f.mutation_sale_price)&&
  Number(sale?.paid_amount)===0&&
  Number(sale?.debt_amount)===Number(f.mutation_sale_price)&&
  sale?.payment_status==='UNPAID'&&sale?.sale_status==='COMPLETED',
  {saleId,invoiceCode:sale?.invoice_code??null}
)
const saleItem=await first('/rest/v1/sale_items?select=id,product_variant_id,quantity,sale_price&sale_id=eq.'+encodeURIComponent(saleId))
record('POS sale item uses QA SKU',String(saleItem?.product_variant_id)===variantId&&Number(saleItem?.quantity)===1&&Number(saleItem?.sale_price)===Number(f.mutation_sale_price))
const saleTx=await first('/rest/v1/inventory_transactions?select=id,tx_type,quantity,reference_type,reference_id&reference_type=eq.SALE&reference_id=eq.'+encodeURIComponent(saleId))
record('POS sale creates inventory SALE transaction',saleTx?.tx_type==='SALE'&&Number(saleTx?.quantity)===1)
const balanceAfterSale=await first('/rest/v1/inventory_balances?select=quantity&warehouse_id=eq.'+encodeURIComponent(f.warehouse_id)+'&product_variant_id=eq.'+encodeURIComponent(variantId))
record('Inventory balance decreases after POS sale',Number(balanceAfterSale?.quantity)===Number(f.mutation_stock_quantity)-1,{quantity:Number(balanceAfterSale?.quantity??0)})
const saleDebt=await first('/rest/v1/debt_ledger?select=id,debit,credit,reference_type,reference_id&customer_id=eq.'+encodeURIComponent(f.customer_id)+'&reference_type=eq.SALE&reference_id=eq.'+encodeURIComponent(saleId))
record('POS debt creates debt ledger debit',Number(saleDebt?.debit)===Number(f.mutation_sale_price)&&Number(saleDebt?.credit)===0)

// 3) Debt collection mutation: collect the exact QA sale through real UI.
await go('/sales/debt?customer='+encodeURIComponent(f.customer_id)+'&mode=collect')
const collect=page.locator('.debt-collect-v2').first()
await collect.waitFor({state:'visible',timeout:5000})
const amountInput=collect.locator('.debt-amount-input-v2 input').first()
record('Debt collection loads exact QA balance',Number(await amountInput.inputValue())===Number(f.mutation_sale_price))
const noteInput=collect.locator('.debt-note-v2 input').first()
if(await noteInput.count())await noteInput.fill(f.marker)
await collect.getByRole('button',{name:/Tiếp tục phân bổ hóa đơn/}).click()
await page.locator('.debt-invoice-allocation-list-v2').waitFor({state:'visible',timeout:5000})
const allocationRow=page.locator('.debt-invoice-allocation-v2').filter({hasText:String(sale?.invoice_code??'')}).first()
record('Debt collection allocates to QA sale',await allocationRow.count()>0)
const confirm=page.getByRole('button',{name:/Xác nhận thu/}).first()
await confirm.click()
let debtSuccess=false
let debtError=''
for(let attempt=0;attempt<50;attempt++){
  debtSuccess=await page.locator('.debt-collect-success-v2').count()>0
  if(debtSuccess)break
  const errorBox=page.locator('.debt-collect-v2 .error-box').first()
  if(await errorBox.count()){
    debtError=(await errorBox.innerText()).trim()
    if(debtError)break
  }
  await page.waitForTimeout(200)
}
record('Debt collection shows success state',debtSuccess,{error:debtError||null})
if(!debtSuccess){
  await page.screenshot({path:outDir+'/mutation-debt-error.png',fullPage:true})
  const body=(await page.locator('body').innerText()).slice(-5000)
  throw new Error('Debt collection failed in UI: '+(debtError||body))
}

const payment=await waitFor(async()=>{
  const rows=await admin('/rest/v1/customer_payments?select=id,amount,receipt_code,payment_method,cash_amount,transfer_amount&customer_id=eq.'+encodeURIComponent(f.customer_id)+'&order=created_at.desc&limit=1')
  return Array.isArray(rows)&&rows[0]?rows[0]:null
})
if(!payment?.id)throw new Error('Debt collection did not create customer payment')
persist({mutation_customer_payment_id:String(payment.id),mutation_receipt_code:String(payment.receipt_code??'')})
record('Debt payment persists as cash receipt',Number(payment.amount)===Number(f.mutation_sale_price)&&payment.payment_method==='CASH'&&Number(payment.cash_amount)===Number(f.mutation_sale_price)&&Number(payment.transfer_amount)===0,{paymentId:payment.id,receiptCode:payment.receipt_code})

const paidSale=await first('/rest/v1/sales?select=id,total_amount,paid_amount,debt_amount,payment_status&id=eq.'+encodeURIComponent(saleId))
record('Debt collection settles QA sale',Number(paidSale?.paid_amount)===Number(f.mutation_sale_price)&&Number(paidSale?.debt_amount)===0&&paidSale?.payment_status==='PAID')
const allocation=await first('/rest/v1/customer_payment_allocations?select=id,customer_payment_id,sale_id,amount&customer_payment_id=eq.'+encodeURIComponent(payment.id)+'&sale_id=eq.'+encodeURIComponent(saleId))
record('Debt payment allocation points to QA sale',String(allocation?.sale_id)===String(saleId)&&Number(allocation?.amount)===Number(f.mutation_sale_price))
const paymentDebt=await first('/rest/v1/debt_ledger?select=id,debit,credit,reference_type,reference_id&customer_id=eq.'+encodeURIComponent(f.customer_id)+'&reference_type=eq.CUSTOMER_PAYMENT&reference_id=eq.'+encodeURIComponent(payment.id))
record('Debt payment creates debt ledger credit',Number(paymentDebt?.credit)===Number(f.mutation_sale_price)&&Number(paymentDebt?.debit)===0)
const financeRows=await admin('/rest/v1/finance_transactions?select=id,tx_type,category,amount,reference_type,reference_id,status,finance_document_id,payment_method&reference_type=eq.CUSTOMER_PAYMENT&reference_id=eq.'+encodeURIComponent(payment.id))
const financeTx=Array.isArray(financeRows)?financeRows[0]??null:null
record('Debt payment creates exactly one canonical finance transaction',
  Array.isArray(financeRows)&&financeRows.length===1&&
  financeTx?.tx_type==='INCOME'&&financeTx?.category==='DEBT_COLLECTION'&&
  Number(financeTx?.amount)===Number(f.mutation_sale_price)&&financeTx?.status==='POSTED'&&
  Boolean(financeTx?.finance_document_id)&&financeTx?.payment_method==='CASH',
  {count:Array.isArray(financeRows)?financeRows.length:0,category:financeTx?.category??null}
)
const financeDocument=financeTx?.finance_document_id
  ? await first('/rest/v1/finance_documents?select=id,document_type,document_status,total_amount,cash_amount,transfer_amount,payment_method,source_type,source_id&id=eq.'+encodeURIComponent(financeTx.finance_document_id))
  : null
record('Debt payment creates canonical finance document',
  financeDocument?.document_type==='INCOME'&&financeDocument?.document_status==='POSTED'&&
  Number(financeDocument?.total_amount)===Number(f.mutation_sale_price)&&
  Number(financeDocument?.cash_amount)===Number(f.mutation_sale_price)&&
  Number(financeDocument?.transfer_amount)===0&&financeDocument?.payment_method==='CASH'&&
  financeDocument?.source_type==='CUSTOMER_PAYMENT'&&String(financeDocument?.source_id)===String(payment.id)
)
const customerDebt=await first('/rest/v1/customer_debt_balances?select=customer_id,balance&customer_id=eq.'+encodeURIComponent(f.customer_id))
record('Customer debt balance returns to zero',!customerDebt||Number(customerDebt.balance)===0,{balance:Number(customerDebt?.balance??0)})
const balanceAfterPayment=await first('/rest/v1/inventory_balances?select=quantity&warehouse_id=eq.'+encodeURIComponent(f.warehouse_id)+'&product_variant_id=eq.'+encodeURIComponent(variantId))
record('Debt collection does not alter inventory',Number(balanceAfterPayment?.quantity)===Number(f.mutation_stock_quantity)-1)

// UI no longer lists fixture customer as outstanding debt.
await go('/sales/debt?q='+encodeURIComponent(f.customer_name))
record('Settled QA customer leaves outstanding debt list',await page.locator('.debt-demo-table tbody tr').filter({hasText:f.customer_name}).count()===0)

await page.screenshot({path:outDir+'/mutation-final-debt.png',fullPage:true})
await browser.close()

if(summary.consoleErrors.length)summary.failures.push('Console errors: '+summary.consoleErrors.length)
if(summary.pageErrors.length)summary.failures.push('Page errors: '+summary.pageErrors.length)
if(summary.network5xx.length)summary.failures.push('5xx responses: '+summary.network5xx.length)
fs.writeFileSync(outDir+'/mutation-summary.json',JSON.stringify(summary,null,2))
console.log('QA_MUTATION_SUMMARY_START')
console.log(JSON.stringify(summary,null,2))
console.log('QA_MUTATION_SUMMARY_END')
if(summary.failures.length)process.exit(2)
