import fs from 'node:fs'

const SUPABASE_URL=process.env.SUPABASE_URL
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL||!SERVICE_KEY){
  console.log('QA_FIXTURE_CLEANUP_SKIPPED missing environment')
  process.exit(0)
}

let session=null
try{session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))}catch{}
const f=session?.fixtures
if(!f){
  console.log('QA_FIXTURE_CLEANUP_SKIPPED no fixture metadata')
  process.exit(0)
}

const errors=[]
async function request(path,{method='GET'}={}){
  const res=await fetch(SUPABASE_URL+path,{
    method,
    headers:{
      apikey:SERVICE_KEY,
      authorization:'Bearer '+SERVICE_KEY,
      prefer:'return=minimal',
    },
  })
  const body=await res.text()
  let json=null
  try{json=JSON.parse(body)}catch{}
  return {ok:res.ok,status:res.status,body,json}
}
async function rows(path){
  const res=await request(path)
  if(!res.ok){
    errors.push('read '+path+' status='+res.status)
    return []
  }
  return Array.isArray(res.json)?res.json:[]
}
async function del(table,column,value){
  if(value===null||value===undefined||value==='')return
  const path='/rest/v1/'+table+'?'+column+'=eq.'+encodeURIComponent(String(value))
  const res=await request(path,{method:'DELETE'})
  console.log('QA_FIXTURE_CLEANUP '+table+' '+column+'='+value+' status='+res.status)
  if(!res.ok)errors.push('delete '+table+' '+column+'='+value+' status='+res.status+' '+res.body.slice(0,180))
}

const sales=await rows('/rest/v1/sales?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id))
const payments=await rows('/rest/v1/customer_payments?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id))
const products=f.sale_sku
  ? await rows('/rest/v1/products?select=id&sku=eq.'+encodeURIComponent(f.sale_sku))
  : []
const productIds=[...new Set([
  ...products.map(x=>String(x.id)),
  ...(f.mutation_product_id?[String(f.mutation_product_id)]:[]),
])]
let variantIds=f.mutation_variant_id?[String(f.mutation_variant_id)]:[]
for(const productId of productIds){
  const variants=await rows('/rest/v1/product_variants?select=id&product_id=eq.'+encodeURIComponent(productId))
  variantIds.push(...variants.map(x=>String(x.id)))
}
variantIds=[...new Set(variantIds.filter(Boolean))]
const saleIds=[...new Set([
  ...sales.map(x=>String(x.id)),
  ...(f.mutation_sale_id?[String(f.mutation_sale_id)]:[]),
])]
const paymentIds=[...new Set([
  ...payments.map(x=>String(x.id)),
  ...(f.mutation_customer_payment_id?[String(f.mutation_customer_payment_id)]:[]),
])]

const returnIds=[]
for(const saleId of saleIds){
  const rows=await rows('/rest/v1/sale_returns?select=id&sale_id=eq.'+encodeURIComponent(saleId))
  returnIds.push(...rows.map(x=>String(x.id)))
}
const transferBatchIds=[]
for(const variantId of variantIds){
  const items=await rows('/rest/v1/transfer_items?select=transfer_batch_id&product_variant_id=eq.'+encodeURIComponent(variantId))
  transferBatchIds.push(...items.map(x=>String(x.transfer_batch_id)))
}
if(f.mutation_transfer_id)transferBatchIds.push(String(f.mutation_transfer_id))

const shipperDetails=await rows('/rest/v1/shipper_payment_details?select=shipper_payment_id&order_id=eq.'+encodeURIComponent(f.hub_order_id))
const shipperPaymentIds=[...new Set([
  ...shipperDetails.map(x=>String(x.shipper_payment_id)),
  ...(f.mutation_shipper_payment_id?[String(f.mutation_shipper_payment_id)]:[]),
])]

const receiveDetails=await rows('/rest/v1/receive_batch_details?select=id,receive_batch_id&order_id=eq.'+encodeURIComponent(f.hub_order_id))
const extraReceiveBatchIds=[...new Set(receiveDetails.map(x=>String(x.receive_batch_id)))]

const financeDocumentIds=[]
for(const paymentId of paymentIds){
  const docs=await rows('/rest/v1/finance_documents?select=id&source_type=eq.CUSTOMER_PAYMENT&source_id=eq.'+encodeURIComponent(paymentId))
  financeDocumentIds.push(...docs.map(x=>String(x.id)))
}

// Remove child rows first. Each QA customer/SKU is unique to this workflow run.
for(const paymentId of paymentIds)await del('customer_payment_allocations','customer_payment_id',paymentId)
for(const saleId of saleIds)await del('customer_payment_allocations','sale_id',saleId)
for(const returnId of returnIds)await del('sale_return_items','sale_return_id',returnId)
for(const returnId of returnIds)await del('sale_returns','id',returnId)

await del('debt_ledger','customer_id',f.customer_id)
for(const paymentId of paymentIds)await del('finance_transactions','reference_id',paymentId)
for(const saleId of saleIds)await del('finance_transactions','reference_id',saleId)
for(const returnId of returnIds)await del('finance_transactions','reference_id',returnId)
for(const transferId of [...new Set(transferBatchIds)])await del('finance_transactions','reference_id',transferId)
for(const shipperPaymentId of shipperPaymentIds)await del('finance_transactions','reference_id',shipperPaymentId)
for(const documentId of financeDocumentIds)await del('finance_transactions','finance_document_id',documentId)
for(const documentId of financeDocumentIds)await del('finance_document_lines','document_id',documentId)
for(const documentId of financeDocumentIds)await del('finance_documents','id',documentId)

for(const paymentId of paymentIds)await del('audit_logs','entity_id',paymentId)
for(const saleId of saleIds)await del('audit_logs','entity_id',saleId)
for(const returnId of returnIds)await del('audit_logs','entity_id',returnId)
for(const transferId of [...new Set(transferBatchIds)])await del('audit_logs','entity_id',transferId)
for(const shipperPaymentId of shipperPaymentIds)await del('audit_logs','entity_id',shipperPaymentId)
await del('audit_logs','entity_id',f.warehouse_order_id)
await del('audit_logs','entity_id',f.hub_order_id)
await del('audit_logs','entity_id',f.erp_user_id)

for(const variantId of variantIds)await del('inventory_transactions','product_variant_id',variantId)
for(const saleId of saleIds)await del('sales','id',saleId)
for(const paymentId of paymentIds)await del('customer_payments','id',paymentId)

for(const transferId of [...new Set(transferBatchIds)]){
  await del('transfer_items','transfer_batch_id',transferId)
  await del('transfer_batches','id',transferId)
}
for(const shipperPaymentId of shipperPaymentIds){
  await del('shipper_payment_details','shipper_payment_id',shipperPaymentId)
  await del('shipper_payments','id',shipperPaymentId)
}
for(const detail of receiveDetails)await del('receive_batch_details','id',detail.id)
for(const batchId of extraReceiveBatchIds)await del('receive_batches','id',batchId)

await del('shipments','id',f.hub_shipment_id)
await del('receive_batch_details','id',f.receive_detail_id)
await del('order_items','id',f.warehouse_item_id)
await del('order_items','id',f.hub_item_id)
await del('orders','id',f.warehouse_order_id)
await del('orders','id',f.hub_order_id)
await del('receive_batches','id',f.receive_batch_id)

for(const variantId of variantIds)await del('product_variants','id',variantId)
for(const productId of productIds)await del('products','id',productId)
await del('customers','id',f.customer_id)
await del('purchase_account_devices','erp_user_id',f.erp_user_id)
await del('erp_users','id',f.erp_user_id)
await del('destination_hub_shipper_assignments','hub_config_id',f.hub_config_id)
await del('destination_hub_configs','id',f.hub_config_id)

async function count(path){
  return (await rows(path)).length
}
const leftovers={
  customer:await count('/rest/v1/customers?select=id&id=eq.'+encodeURIComponent(f.customer_id)),
  warehouse_order:await count('/rest/v1/orders?select=id&id=eq.'+encodeURIComponent(f.warehouse_order_id)),
  hub_order:await count('/rest/v1/orders?select=id&id=eq.'+encodeURIComponent(f.hub_order_id)),
  receive_batch:await count('/rest/v1/receive_batches?select=id&id=eq.'+encodeURIComponent(f.receive_batch_id)),
  sales:await count('/rest/v1/sales?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id)),
  payments:await count('/rest/v1/customer_payments?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id)),
  debt_ledger:await count('/rest/v1/debt_ledger?select=id&customer_id=eq.'+encodeURIComponent(f.customer_id)),
  finance_documents:0,
  finance_document_lines:0,
  product: f.sale_sku?await count('/rest/v1/products?select=id&sku=eq.'+encodeURIComponent(f.sale_sku)):0,
  erp_user: f.erp_user_id?await count('/rest/v1/erp_users?select=id&id=eq.'+encodeURIComponent(f.erp_user_id)):0,
  hub_config: f.hub_config_id?await count('/rest/v1/destination_hub_configs?select=id&id=eq.'+encodeURIComponent(f.hub_config_id)):0,
  sale_returns:0,
  transfers:0,
  shipper_payments:0,
}
for(const saleId of saleIds)leftovers.sale_returns+=await count('/rest/v1/sale_returns?select=id&sale_id=eq.'+encodeURIComponent(saleId))
for(const transferId of [...new Set(transferBatchIds)])leftovers.transfers+=await count('/rest/v1/transfer_batches?select=id&id=eq.'+encodeURIComponent(transferId))
for(const shipperPaymentId of shipperPaymentIds)leftovers.shipper_payments+=await count('/rest/v1/shipper_payments?select=id&id=eq.'+encodeURIComponent(shipperPaymentId))
for(const paymentId of paymentIds){
  leftovers.finance_documents+=await count('/rest/v1/finance_documents?select=id&source_type=eq.CUSTOMER_PAYMENT&source_id=eq.'+encodeURIComponent(paymentId))
}
for(const documentId of financeDocumentIds){
  leftovers.finance_document_lines+=await count('/rest/v1/finance_document_lines?select=id&document_id=eq.'+encodeURIComponent(documentId))
}
let inventory=0
for(const variantId of variantIds)inventory+=await count('/rest/v1/inventory_transactions?select=id&product_variant_id=eq.'+encodeURIComponent(variantId))
leftovers.inventory_transactions=inventory

console.log('QA_FIXTURE_CLEANUP_VERIFY '+JSON.stringify(leftovers))
const remaining=Object.entries(leftovers).filter(([,value])=>Number(value)!==0)
if(errors.length||remaining.length){
  throw new Error('QA fixture cleanup incomplete errors='+JSON.stringify(errors)+' leftovers='+JSON.stringify(leftovers))
}
console.log('QA_FIXTURES_CLEANED verified=zero')
