// QA round 2 execution trigger 2026-10-06
import fs from 'node:fs'
import { chromium } from 'playwright'
import { createBrowserClient } from '@supabase/ssr'

const PREVIEW_URL=process.env.PREVIEW_URL
const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!PREVIEW_URL||!SUPABASE_URL||!SUPABASE_KEY||!SERVICE_KEY)throw new Error('Missing mutation QA v2 environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')
const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
const f=session.fixtures
if(!f?.mutation_variant_id)throw new Error('Mutation QA v2 requires successful v1 fixture state')

const outDir='qa-browser-artifacts'
fs.mkdirSync(outDir,{recursive:true})
const summary={mutations:[],consoleErrors:[],pageErrors:[],network5xx:[],failures:[]}
function record(name,pass,detail={}){
  const row={name,pass:Boolean(pass),...detail}
  summary.mutations.push(row)
  console.log('QA_MUTATION_V2_CHECK '+JSON.stringify(row))
  if(!row.pass)summary.failures.push('MutationV2: '+name)
}
function persist(extra){
  Object.assign(f,extra)
  session.fixtures=f
  fs.writeFileSync('qa-session.json',JSON.stringify(session))
}
async function admin(path){
  const res=await fetch(SUPABASE_URL+path,{headers:{apikey:SERVICE_KEY,authorization:'Bearer '+SERVICE_KEY}})
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
async function waitFor(check,{attempts=40,delay=300,label='condition'}={}){
  for(let i=0;i<attempts;i++){
    const value=await check()
    if(value)return value
    await new Promise(r=>setTimeout(r,delay))
  }
  throw new Error('Timed out waiting for '+label)
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
if(setSessionError)throw new Error('Unable to serialize mutation QA v2 session: '+setSessionError.message)

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
  const res=await page.goto(PREVIEW_URL+path,{waitUntil:'domcontentloaded',timeout:30000})
  await page.waitForTimeout(700)
  if((res?.status()??0)>=500)throw new Error('Navigation failed '+path+' status='+(res?.status()??0))
}
async function balance(warehouseId){
  const row=await first('/rest/v1/inventory_balances?select=quantity&warehouse_id=eq.'+encodeURIComponent(warehouseId)+'&product_variant_id=eq.'+encodeURIComponent(f.mutation_variant_id))
  return Number(row?.quantity??0)
}
async function createCashSale(quantity){
  await go('/sales/pos')
  await page.locator('.pos-warehouse select').first().selectOption(String(f.warehouse_id))
  const search=page.getByRole('textbox',{name:'Tìm sản phẩm theo barcode, SKU hoặc tên'}).first()
  await search.fill(f.sale_sku)
  await page.waitForTimeout(200)
  const tile=page.locator('button.pos-product-tile-final').filter({hasText:f.sale_sku}).first()
  await tile.waitFor({state:'visible',timeout:5000})
  await tile.click()
  const qtyInput=page.locator('.pos-cart-line .pos-qty input').first()
  if(quantity!==1)await qtyInput.fill(String(quantity))

  await page.locator('.pos-control-actions button').first().click()
  const customerSelect=page.locator('.pos-customer-popover select').first()
  await customerSelect.selectOption(String(f.customer_id))
  await page.locator('.pos-customer-popover .pos-popover-head button').first().click()

  const extras=page.getByRole('button',{name:/Tùy chỉnh hóa đơn/}).first()
  if(await extras.count()){
    await extras.click()
    const note=page.locator('textarea[placeholder*="Ghi chú hóa đơn"]').first()
    if(await note.count())await note.fill(f.marker+' V2 CASH')
  }

  await page.locator('.pos-cart-actions').getByRole('button',{name:'Tiền mặt'}).click()
  await page.locator('.pos-checkout').waitFor({state:'visible',timeout:5000})
  await page.locator('.pos-confirm-payment').click()
  await page.locator('.pos-success-layer').waitFor({state:'visible',timeout:10000})
  const href=await page.locator('.pos-success-actions').getByRole('link',{name:'Xem hóa đơn'}).getAttribute('href')
  const saleId=href?new URL(href,PREVIEW_URL).searchParams.get('sale'):null
  if(!saleId)throw new Error('Cash sale did not expose sale id')
  const sale=await waitFor(()=>first('/rest/v1/sales?select=id,invoice_code,total_amount,paid_amount,debt_amount,payment_status,sale_status&id=eq.'+encodeURIComponent(saleId)),{label:'cash sale'})
  return sale
}

// V2 baseline: v1 left two QA units in the source warehouse and no customer debt.
record('V2 baseline source stock is two',await balance(f.warehouse_id)===2,{quantity:await balance(f.warehouse_id)})
const baselineDebt=await first('/rest/v1/customer_debt_balances?select=balance&customer_id=eq.'+encodeURIComponent(f.customer_id))
record('V2 baseline customer debt is zero',!baselineDebt||Number(baselineDebt.balance)===0,{balance:Number(baselineDebt?.balance??0)})

// A) Cash sale cancellation must reverse inventory and finance.
const cancelSale=await createCashSale(1)
persist({mutation_cancel_sale_id:String(cancelSale.id)})
record('Cancellation fixture cash sale persisted',cancelSale.payment_status==='PAID'&&Number(cancelSale.paid_amount)===Number(f.mutation_sale_price),{saleId:cancelSale.id})
record('Cancellation fixture decrements stock',await balance(f.warehouse_id)===1,{quantity:await balance(f.warehouse_id)})

await go('/sales/history?sale='+encodeURIComponent(cancelSale.id))
await page.getByRole('button',{name:'Huỷ hóa đơn'}).click()
const cancelDialog=page.getByRole('dialog',{name:'Xác nhận huỷ hóa đơn'})
await cancelDialog.locator('textarea').fill(f.marker+' cancel')
await cancelDialog.getByRole('button',{name:'Xác nhận huỷ'}).click()
const cancelled=await waitFor(async()=>{
  const row=await first('/rest/v1/sales?select=id,sale_status,total_amount,paid_amount,debt_amount&id=eq.'+encodeURIComponent(cancelSale.id))
  return row?.sale_status==='CANCELLED'?row:null
},{label:'sale cancellation'})
record('Cancel sale changes status and zeroes value',cancelled.sale_status==='CANCELLED'&&Number(cancelled.total_amount)===0&&Number(cancelled.paid_amount)===0)
const cancelReturn=await first('/rest/v1/sale_returns?select=id,return_type,return_value,refund_amount,debt_relief&sale_id=eq.'+encodeURIComponent(cancelSale.id)+'&return_type=eq.CANCEL')
record('Cancel sale creates CANCEL return',Boolean(cancelReturn?.id)&&Number(cancelReturn?.refund_amount)===Number(f.mutation_sale_price),{returnId:cancelReturn?.id??null})
const cancelFinance=cancelReturn?.id?await first('/rest/v1/finance_transactions?select=tx_type,category,amount,status&reference_type=eq.SALE_CANCEL&reference_id=eq.'+encodeURIComponent(cancelReturn.id)):null
record('Cancel sale creates finance refund',cancelFinance?.tx_type==='EXPENSE'&&cancelFinance?.category==='SALE_CANCEL_REFUND'&&Number(cancelFinance?.amount)===Number(f.mutation_sale_price)&&cancelFinance?.status==='POSTED')
record('Cancel sale restores stock',await balance(f.warehouse_id)===2,{quantity:await balance(f.warehouse_id)})

// B) Partial then full return.
const returnSale=await createCashSale(2)
persist({mutation_return_sale_id:String(returnSale.id)})
record('Return fixture consumes two units',await balance(f.warehouse_id)===0,{quantity:await balance(f.warehouse_id)})
const returnItem=await first('/rest/v1/sale_items?select=id,quantity,sale_price&sale_id=eq.'+encodeURIComponent(returnSale.id))
if(!returnItem?.id)throw new Error('Return fixture sale item missing')

async function submitReturn(qty,expectedStatus){
  await go('/sales/history?sale='+encodeURIComponent(returnSale.id))
  await page.getByRole('button',{name:'Hoàn hàng'}).click()
  const dialog=page.getByRole('dialog',{name:'Hoàn hàng'})
  const qtyInput=dialog.locator('.sales-return-line input').first()
  await qtyInput.fill(String(qty))
  await dialog.locator('textarea').fill(f.marker+' return '+expectedStatus)
  await dialog.getByRole('button',{name:'Xác nhận hoàn'}).click()
  return await waitFor(async()=>{
    const row=await first('/rest/v1/sales?select=id,sale_status,total_amount,paid_amount,debt_amount,payment_status&id=eq.'+encodeURIComponent(returnSale.id))
    return row?.sale_status===expectedStatus?row:null
  },{label:'sale return '+expectedStatus})
}
const partial=await submitReturn(1,'PARTIAL_RETURN')
record('Partial return updates sale status',partial.sale_status==='PARTIAL_RETURN'&&Number(partial.total_amount)===Number(f.mutation_sale_price)&&Number(partial.paid_amount)===Number(f.mutation_sale_price))
record('Partial return restores one unit',await balance(f.warehouse_id)===1,{quantity:await balance(f.warehouse_id)})
const partialReturn=await first('/rest/v1/sale_returns?select=id,return_type,return_value,refund_amount&sale_id=eq.'+encodeURIComponent(returnSale.id)+'&return_type=eq.PARTIAL')
record('Partial return creates PARTIAL record',Boolean(partialReturn?.id)&&Number(partialReturn?.refund_amount)===Number(f.mutation_sale_price))

const full=await submitReturn(1,'RETURNED')
record('Full return zeroes remaining sale value',full.sale_status==='RETURNED'&&Number(full.total_amount)===0&&Number(full.paid_amount)===0&&full.payment_status==='PAID')
record('Full return restores second unit',await balance(f.warehouse_id)===2,{quantity:await balance(f.warehouse_id)})
const returnRows=await admin('/rest/v1/sale_returns?select=id,return_type,refund_amount&sale_id=eq.'+encodeURIComponent(returnSale.id)+'&order=created_at.asc')
record('Return flow creates two return records',Array.isArray(returnRows)&&returnRows.length===2&&returnRows.some(x=>x.return_type==='PARTIAL')&&returnRows.some(x=>x.return_type==='FULL'),{count:Array.isArray(returnRows)?returnRows.length:0})
const returnFinance=await admin('/rest/v1/finance_transactions?select=id,amount,category,reference_id&reference_type=eq.SALE_RETURN')
const relatedReturnIds=new Set((returnRows??[]).map(x=>String(x.id)))
const relatedFinance=(returnFinance??[]).filter(x=>relatedReturnIds.has(String(x.reference_id??'')))
record('Return flow refunds collected cash',relatedFinance.reduce((s,x)=>s+Number(x.amount??0),0)===Number(f.mutation_sale_price)*2,{refundTotal:relatedFinance.reduce((s,x)=>s+Number(x.amount??0),0)})

// C) Archive / restore returned invoice.
const returnInvoice=(await first('/rest/v1/sales?select=invoice_code&id=eq.'+encodeURIComponent(returnSale.id)))?.invoice_code
await go('/sales/history?q='+encodeURIComponent(returnInvoice))
const salePick=page.getByRole('checkbox',{name:'Chọn '+returnInvoice}).first()
await salePick.check()
await page.getByRole('button',{name:'Lưu trữ đã chọn'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/sales?select=archived_at&id=eq.'+encodeURIComponent(returnSale.id))
  return row?.archived_at?row:null
},{label:'archive sale'})
record('Sale archive persists archived_at',Boolean((await first('/rest/v1/sales?select=archived_at&id=eq.'+encodeURIComponent(returnSale.id)))?.archived_at))

await go('/sales/history?archive=archived&q='+encodeURIComponent(returnInvoice))
await page.getByRole('checkbox',{name:'Chọn '+returnInvoice}).check()
await page.getByRole('button',{name:'Khôi phục đã chọn'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/sales?select=archived_at&id=eq.'+encodeURIComponent(returnSale.id))
  return row&&row.archived_at===null?row:null
},{label:'restore sale'})
record('Sale restore clears archived_at',(await first('/rest/v1/sales?select=archived_at&id=eq.'+encodeURIComponent(returnSale.id)))?.archived_at===null)

// D) Stocktake to 5 then manual adjustment OUT 2.
await go('/warehouse/inventory')
await page.getByRole('button',{name:'Kiểm kê kho'}).click()
let tool=page.locator('.whx-tool-popover.wide form').first()
await tool.locator('select[name="warehouse_id"]').selectOption(String(f.warehouse_id))
await tool.locator('select[name="product_variant_id"]').selectOption(String(f.mutation_variant_id))
await tool.locator('input[name="actual_quantity"]').fill('5')
await tool.locator('input[name="note"]').fill(f.marker+' stocktake')
await tool.getByRole('button',{name:'Xác nhận kiểm kê'}).click()
await waitFor(async()=>await balance(f.warehouse_id)===5?true:null,{label:'stocktake balance'})
record('Stocktake changes balance to actual quantity',await balance(f.warehouse_id)===5,{quantity:await balance(f.warehouse_id)})
const stockTxs=await admin('/rest/v1/inventory_transactions?select=tx_type,quantity,reference_type&warehouse_id=eq.'+encodeURIComponent(f.warehouse_id)+'&product_variant_id=eq.'+encodeURIComponent(f.mutation_variant_id)+'&order=created_at.desc&limit=5')
record('Stocktake writes ADJUSTMENT_IN transaction',(stockTxs??[]).some(x=>x.tx_type==='ADJUSTMENT_IN'&&Number(x.quantity)===3&&x.reference_type==='STOCKTAKE'))

await go('/warehouse/inventory')
await page.getByRole('button',{name:'Điều chỉnh tồn'}).click()
tool=page.locator('.whx-tool-popover form').first()
await tool.locator('select[name="warehouse_id"]').selectOption(String(f.warehouse_id))
await tool.locator('select[name="product_variant_id"]').selectOption(String(f.mutation_variant_id))
await tool.locator('select[name="direction"]').selectOption('OUT')
await tool.locator('input[name="quantity"]').fill('2')
await tool.locator('input[name="note"]').fill(f.marker+' adjust-out')
await tool.getByRole('button',{name:'Ghi điều chỉnh'}).click()
await waitFor(async()=>await balance(f.warehouse_id)===3?true:null,{label:'manual adjustment'})
record('Manual OUT adjustment decreases balance',await balance(f.warehouse_id)===3,{quantity:await balance(f.warehouse_id)})

// E) Transfer one unit source -> destination, dispatch and receive.
await go('/warehouse/inventory')
await page.getByRole('button',{name:'Chuyển kho'}).click()
tool=page.locator('.whx-tool-popover.transfer form').first()
await tool.locator('select[name="from_warehouse_id"]').selectOption(String(f.warehouse_id))
await tool.locator('select[name="to_warehouse_id"]').selectOption(String(f.transfer_warehouse_id))
await tool.locator('select[name="product_variant_id"]').selectOption(String(f.mutation_variant_id))
await tool.locator('input[name="quantity"]').fill('1')
await tool.locator('input[name="note"]').fill(f.marker+' transfer')
await tool.getByRole('button',{name:'Tạo phiếu chuyển'}).click()
const transfer=await waitFor(async()=>first('/rest/v1/transfer_batches?select=id,status,from_warehouse_id,to_warehouse_id,note&note=eq.'+encodeURIComponent(f.marker+' transfer')+'&order=created_at.desc&limit=1'),{label:'transfer draft'})
persist({mutation_transfer_id:String(transfer.id)})
record('Transfer creates DRAFT batch',transfer.status==='DRAFT'&&String(transfer.from_warehouse_id)===String(f.warehouse_id)&&String(transfer.to_warehouse_id)===String(f.transfer_warehouse_id),{transferId:transfer.id})

await go('/warehouse/inventory')
await page.getByRole('button',{name:'Chuyển kho'}).click()
let transferRow=page.locator('.whx-transfer-row').filter({hasText:String(transfer.id).slice(0,8)}).first()
await transferRow.getByRole('button',{name:'Xuất chuyển'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/transfer_batches?select=status&id=eq.'+encodeURIComponent(transfer.id))
  return row?.status==='IN_TRANSIT'?row:null
},{label:'transfer dispatch'})
record('Transfer dispatch moves batch IN_TRANSIT',(await first('/rest/v1/transfer_batches?select=status&id=eq.'+encodeURIComponent(transfer.id)))?.status==='IN_TRANSIT')
record('Transfer dispatch decrements source stock',await balance(f.warehouse_id)===2,{quantity:await balance(f.warehouse_id)})

await go('/warehouse/inventory')
await page.getByRole('button',{name:'Chuyển kho'}).click()
transferRow=page.locator('.whx-transfer-row').filter({hasText:String(transfer.id).slice(0,8)}).first()
await transferRow.getByRole('button',{name:'Xác nhận nhận'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/transfer_batches?select=status&id=eq.'+encodeURIComponent(transfer.id))
  return row?.status==='RECEIVED'?row:null
},{label:'transfer receive'})
const sourceAfterTransfer=await balance(f.warehouse_id)
const destAfterTransfer=await balance(f.transfer_warehouse_id)
record('Transfer receive moves batch RECEIVED',(await first('/rest/v1/transfer_batches?select=status&id=eq.'+encodeURIComponent(transfer.id)))?.status==='RECEIVED')
record('Transfer preserves total stock across warehouses',sourceAfterTransfer===2&&destAfterTransfer===1&&sourceAfterTransfer+destAfterTransfer===3,{source:sourceAfterTransfer,destination:destAfterTransfer})

// F) User archive and restore.
await go('/purchase/accounts?user='+encodeURIComponent(f.erp_user_id)+'&tab=info')
await page.locator('.record-lifecycle-zone').getByRole('button',{name:'Lưu trữ'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/erp_users?select=archived_at&id=eq.'+encodeURIComponent(f.erp_user_id))
  return row?.archived_at?row:null
},{label:'archive user'})
record('ERP User archive persists archived_at',Boolean((await first('/rest/v1/erp_users?select=archived_at&id=eq.'+encodeURIComponent(f.erp_user_id)))?.archived_at))
await go('/purchase/accounts?archive=archived&user='+encodeURIComponent(f.erp_user_id)+'&tab=info')
await page.locator('.record-lifecycle-zone').getByRole('button',{name:'Khôi phục'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/erp_users?select=archived_at&id=eq.'+encodeURIComponent(f.erp_user_id))
  return row&&row.archived_at===null?row:null
},{label:'restore user'})
record('ERP User restore clears archived_at',(await first('/rest/v1/erp_users?select=archived_at&id=eq.'+encodeURIComponent(f.erp_user_id)))?.archived_at===null)

// G) Order archive and restore before HUB settlement.
await go('/purchase/orders?range=all&order='+encodeURIComponent(f.hub_order_id)+'&tab=info')
await page.locator('.record-lifecycle-zone').getByRole('button',{name:'Lưu trữ'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/orders?select=archived_at&id=eq.'+encodeURIComponent(f.hub_order_id))
  return row?.archived_at?row:null
},{label:'archive order'})
record('Order archive persists archived_at',Boolean((await first('/rest/v1/orders?select=archived_at&id=eq.'+encodeURIComponent(f.hub_order_id)))?.archived_at))
await go('/purchase/orders?range=all&archive=archived&order='+encodeURIComponent(f.hub_order_id)+'&tab=info')
await page.locator('.record-lifecycle-zone').getByRole('button',{name:'Khôi phục'}).click()
await waitFor(async()=>{
  const row=await first('/rest/v1/orders?select=archived_at&id=eq.'+encodeURIComponent(f.hub_order_id))
  return row&&row.archived_at===null?row:null
},{label:'restore order'})
record('Order restore clears archived_at',(await first('/rest/v1/orders?select=archived_at&id=eq.'+encodeURIComponent(f.hub_order_id)))?.archived_at===null)

// H) HUB receive + shipper settlement with explicit tip.
await go('/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE&hub='+encodeURIComponent(f.shipper_hub))
const pick=page.getByRole('checkbox',{name:'Chọn '+f.hub_order_code}).first()
await pick.check()
await page.getByRole('button',{name:'Nhận hàng'}).click()
const receiveDialog=page.getByRole('dialog',{name:/XÁC NHẬN NHẬN HÀNG|QA HUB/i})
await receiveDialog.locator('select[name="warehouse_id"]').selectOption(String(f.warehouse_id))
const actual=54321+1000
await receiveDialog.locator('input[name="actual_transferred"]').fill(String(actual))
await receiveDialog.locator('input[name="note"]').fill(f.marker+' shipper-settlement')
await receiveDialog.getByRole('button',{name:'Nhận + ghi chuyển ship'}).click()

const hubOrder=await waitFor(async()=>{
  const row=await first('/rest/v1/orders?select=receive_status,warehouse_status&id=eq.'+encodeURIComponent(f.hub_order_id))
  return row?.receive_status==='RECEIVED'?row:null
},{label:'HUB receive'})
record('HUB settlement marks order received',hubOrder.receive_status==='RECEIVED'&&hubOrder.warehouse_status==='READY_TO_TRANSFER',{warehouseStatus:hubOrder.warehouse_status})
const shipDetail=await waitFor(async()=>first('/rest/v1/shipper_payment_details?select=shipper_payment_id,cod_snapshot&order_id=eq.'+encodeURIComponent(f.hub_order_id)),{label:'shipper payment detail'})
const shipPayment=await first('/rest/v1/shipper_payments?select=id,destination_hub,total_cod,actual_transferred,tip,warehouse_id&id=eq.'+encodeURIComponent(shipDetail.shipper_payment_id))
persist({mutation_shipper_payment_id:String(shipDetail.shipper_payment_id)})
record('HUB settlement creates payment detail',Number(shipDetail.cod_snapshot)===54321,{paymentId:shipDetail.shipper_payment_id})
record('HUB settlement persists COD, actual transfer and tip',
  String(shipPayment?.destination_hub)===String(f.shipper_hub)&&
  Number(shipPayment?.total_cod)===54321&&
  Number(shipPayment?.actual_transferred)===actual&&
  Number(shipPayment?.tip)===1000&&
  String(shipPayment?.warehouse_id)===String(f.warehouse_id),
  {totalCod:Number(shipPayment?.total_cod??0),actual:Number(shipPayment?.actual_transferred??0),tip:Number(shipPayment?.tip??0)}
)
const receiveDetail=await first('/rest/v1/receive_batch_details?select=id,receive_batch_id,cod_snapshot&order_id=eq.'+encodeURIComponent(f.hub_order_id))
record('HUB settlement creates receive batch detail',Boolean(receiveDetail?.id)&&Number(receiveDetail?.cod_snapshot)===54321,{receiveBatchId:receiveDetail?.receive_batch_id??null})

await page.screenshot({path:outDir+'/mutation-v2-final.png',fullPage:true})
await browser.close()

if(summary.consoleErrors.length)summary.failures.push('Console errors: '+summary.consoleErrors.length)
if(summary.pageErrors.length)summary.failures.push('Page errors: '+summary.pageErrors.length)
if(summary.network5xx.length)summary.failures.push('5xx responses: '+summary.network5xx.length)
fs.writeFileSync(outDir+'/mutation-v2-summary.json',JSON.stringify(summary,null,2))
console.log('QA_MUTATION_V2_SUMMARY_START')
console.log(JSON.stringify(summary,null,2))
console.log('QA_MUTATION_V2_SUMMARY_END')
if(summary.failures.length)process.exit(2)
