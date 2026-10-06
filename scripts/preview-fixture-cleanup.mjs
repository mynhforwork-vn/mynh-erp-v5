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

// Remove child rows first. Each QA customer/SKU is unique to this workflow run.
for(const paymentId of paymentIds)await del('customer_payment_allocations','customer_payment_id',paymentId)
for(const saleId of saleIds)await del('customer_payment_allocations','sale_id',saleId)

await del('debt_ledger','customer_id',f.customer_id)
for(const paymentId of paymentIds)await del('finance_transactions','reference_id',paymentId)
for(const saleId of saleIds)await del('finance_transactions','reference_id',saleId)

for(const paymentId of paymentIds)await del('audit_logs','entity_id',paymentId)
for(const saleId of saleIds)await del('audit_logs','entity_id',saleId)
await del('audit_logs','entity_id',f.warehouse_order_id)
await del('audit_logs','entity_id',f.hub_order_id)

for(const variantId of variantIds)await del('inventory_transactions','product_variant_id',variantId)
for(const saleId of saleIds)await del('sales','id',saleId)
for(const paymentId of paymentIds)await del('customer_payments','id',paymentId)

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
  product: f.sale_sku?await count('/rest/v1/products?select=id&sku=eq.'+encodeURIComponent(f.sale_sku)):0,
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
