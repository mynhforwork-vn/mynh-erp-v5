import fs from 'node:fs'
import crypto from 'node:crypto'

const SUPABASE_URL=process.env.SUPABASE_URL
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL||!SERVICE_KEY)throw new Error('Missing Supabase QA fixture environment')
if(!fs.existsSync('qa-session.json'))throw new Error('Missing qa-session.json')

const session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))

async function request(path,{method='GET',body}={}){
  const res=await fetch(SUPABASE_URL+path,{
    method,
    headers:{
      'content-type':'application/json',
      'apikey':SERVICE_KEY,
      'authorization':'Bearer '+SERVICE_KEY,
      'prefer':'return=minimal',
    },
    body:body===undefined?undefined:JSON.stringify(body),
  })
  const text=await res.text()
  let json=null
  try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,text,json}
}

async function insert(table,row){
  const res=await request('/rest/v1/'+table,{method:'POST',body:row})
  if(!res.ok)throw new Error('Fixture insert '+table+' failed '+res.status+' '+res.text.slice(0,300))
}

const wh=await request('/rest/v1/warehouses?select=id,code&is_active=eq.true&order=code.asc&limit=1')
if(!wh.ok||!Array.isArray(wh.json)||!wh.json[0]?.id)throw new Error('No active warehouse for QA fixture')

const suffix=Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex')
const fixtures={
  customer_id:crypto.randomUUID(),
  warehouse_order_id:crypto.randomUUID(),
  warehouse_item_id:crypto.randomUUID(),
  receive_batch_id:crypto.randomUUID(),
  receive_detail_id:crypto.randomUUID(),
  hub_order_id:crypto.randomUUID(),
  hub_item_id:crypto.randomUUID(),
  hub_shipment_id:crypto.randomUUID(),
  warehouse_id:String(wh.json[0].id),
  warehouse_code:String(wh.json[0].code??''),
  customer_name:'QA Browser Customer '+suffix,
  warehouse_order_code:'QA-WH-'+suffix,
  hub_order_code:'QA-HUB-'+suffix,
  sale_sku:'QA-MUT-'+suffix.toUpperCase(),
  mutation_product_name:'QA Mutation Product '+suffix,
  mutation_sale_price:50000,
  mutation_stock_quantity:3,
  shipper_hub:'QA HUB '+suffix,
  marker:'QA_BROWSER_FIXTURE:'+suffix,
}

session.fixtures=fixtures
fs.writeFileSync('qa-session.json',JSON.stringify(session))

await insert('customers',{
  id:fixtures.customer_id,
  name:fixtures.customer_name,
  phone:'0900000000',
  address:'QA Browser Fixture',
  note:fixtures.marker,
})

await insert('orders',{
  id:fixtures.warehouse_order_id,
  shopee_order_id:fixtures.warehouse_order_code,
  recipient_name:'QA Warehouse',
  recipient_phone:'0900000001',
  recipient_address:'QA Browser Fixture',
  cod:12345,
  receive_status:'RECEIVED',
  warehouse_status:'READY_TO_TRANSFER',
  order_status:'COMPLETED',
  payment_status:'UNPAID',
  source:'MANUAL',
  shipping_service:'STANDARD',
})
await insert('order_items',{
  id:fixtures.warehouse_item_id,
  order_id:fixtures.warehouse_order_id,
  sku:'QA-WH-'+suffix,
  product_name:'QA Warehouse Intake Fixture',
  variant:'Chưa map',
  quantity:fixtures.mutation_stock_quantity,
  original_price:12345,
  final_price:12345,
  inventory_multiplier:1,
})
await insert('receive_batches',{
  id:fixtures.receive_batch_id,
  warehouse_id:fixtures.warehouse_id,
  order_count:1,
  total_cod:12345,
  note:fixtures.marker,
})
await insert('receive_batch_details',{
  id:fixtures.receive_detail_id,
  receive_batch_id:fixtures.receive_batch_id,
  order_id:fixtures.warehouse_order_id,
  cod_snapshot:12345,
})

await insert('orders',{
  id:fixtures.hub_order_id,
  shopee_order_id:fixtures.hub_order_code,
  recipient_name:'QA Shipper HUB',
  recipient_phone:'0900000002',
  recipient_address:'QA Browser Fixture',
  destination_hub:fixtures.shipper_hub,
  cod:54321,
  receive_status:'WAITING_RECEIVE',
  warehouse_status:'NOT_READY',
  order_status:'COMPLETED',
  payment_status:'UNPAID',
  source:'MANUAL',
  shipping_service:'STANDARD',
})
await insert('order_items',{
  id:fixtures.hub_item_id,
  order_id:fixtures.hub_order_id,
  sku:'QA-HUB-'+suffix,
  product_name:'QA Shipper HUB Fixture',
  variant:'Mặc định',
  quantity:1,
  original_price:54321,
  final_price:54321,
  inventory_multiplier:1,
})
await insert('shipments',{
  id:fixtures.hub_shipment_id,
  order_id:fixtures.hub_order_id,
  tracking_number:'QA'+Date.now(),
  carrier:'SPX',
  is_active:false,
  tracking_enabled:false,
  current_tracking_status:'DELIVERED',
})

console.log('QA_FIXTURES_CREATED warehouse='+fixtures.warehouse_order_id+' customer='+fixtures.customer_id+' hub='+fixtures.hub_order_id)
