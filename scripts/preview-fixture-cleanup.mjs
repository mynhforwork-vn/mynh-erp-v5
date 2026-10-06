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

async function del(table,column,value){
  if(!value)return
  const url=SUPABASE_URL+'/rest/v1/'+table+'?'+column+'=eq.'+encodeURIComponent(String(value))
  const res=await fetch(url,{
    method:'DELETE',
    headers:{
      'apikey':SERVICE_KEY,
      'authorization':'Bearer '+SERVICE_KEY,
      'prefer':'return=minimal',
    },
  })
  const body=await res.text()
  console.log('QA_FIXTURE_CLEANUP '+table+' '+column+'='+value+' status='+res.status+(res.ok?'':' body='+body.slice(0,200)))
}

await del('shipments','id',f.hub_shipment_id)
await del('receive_batch_details','id',f.receive_detail_id)
await del('order_items','id',f.warehouse_item_id)
await del('order_items','id',f.hub_item_id)
await del('audit_logs','entity_id',f.warehouse_order_id)
await del('audit_logs','entity_id',f.hub_order_id)
await del('orders','id',f.warehouse_order_id)
await del('orders','id',f.hub_order_id)
await del('receive_batches','id',f.receive_batch_id)
await del('customers','id',f.customer_id)

console.log('QA_FIXTURES_CLEANED')
