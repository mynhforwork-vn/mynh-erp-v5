// Read-only unit integration against a completely mocked Supabase client.
// Tests the batch Server Action's authorization, preflight, V2 routing,
// legacy routing, partial failures and idempotency; never connects to a DB.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtempSync} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {pathToFileURL} from 'node:url'

const root=process.cwd()
const tmp=mkdtempSync(path.join(os.tmpdir(),'warehouse-bulk-action-'))
const outfile=path.join(tmp,'server.mjs')
await build({
  entryPoints:[path.join(root,'lib/actions/warehouse-bulk-receive.ts')],
  outfile,bundle:true,platform:'node',format:'esm',target:'node22',
  plugins:[{name:'mock-server-deps',setup(es){
    es.onResolve({filter:/^@\/lib\/supabase\/auth$/},()=>({path:'auth',namespace:'qa'}))
    es.onResolve({filter:/^next\/cache$/},()=>({path:'cache',namespace:'qa'}))
    es.onLoad({filter:/.*/,namespace:'qa'},args=>({
      loader:'js',
      contents:args.path==='auth'
        ? 'export async function requireUser(){return {supabase:globalThis.__bulkQA.supabase,user:globalThis.__bulkQA.user}}'
        : 'export function revalidatePath(path){globalThis.__bulkQA.revalidations.push(path)}',
    }))
  }}],
})
const {bulkReceiveWarehouseOrders}=await import(pathToFileURL(outfile).href)
const ids=[
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
]
const warehouseId='40000000-0000-4000-8000-000000000001'
const variantId='30000000-0000-4000-8000-000000000001'
const item=(order,index)=>({
  id:'20000000-0000-4000-8000-'+String(order*10+index).padStart(12,'0'),
  quantity:index===0?2:1,inventory_multiplier:1,product_variant_id:variantId,
})
const rows=[
  {id:ids[0],receive_status:'RECEIVED',warehouse_status:'READY_TO_TRANSFER',archived_at:null,order_items:[item(1,0)]},
  {id:ids[1],receive_status:'RECEIVED',warehouse_status:'READY_TO_TRANSFER',archived_at:null,order_items:[item(2,0),item(2,1)]},
  {id:ids[2],receive_status:'RECEIVED',warehouse_status:'READY_TO_TRANSFER',archived_at:null,order_items:[item(3,0),item(3,1)]},
  {id:ids[3],receive_status:'RECEIVED',warehouse_status:'READY_TO_TRANSFER',archived_at:null,order_items:[item(4,0)]},
]
const decisions=[
  ...rows[1].order_items.map((entry,index)=>({
    order_id:ids[1],order_item_id:entry.id,product_variant_id:variantId,
    multiplier:1,sale_price:90000,decision:index===0?'IN':'SKIP',
    skip_reason:index===0?null:'Không cần nhập',processing_state:'DRAFT',
  })),
  {order_id:ids[2],order_item_id:rows[2].order_items[0].id,
    product_variant_id:variantId,multiplier:1,sale_price:90000,
    decision:'IN',skip_reason:null,processing_state:'DRAFT'},
  {order_id:ids[3],order_item_id:rows[3].order_items[0].id,
    product_variant_id:variantId,multiplier:1,sale_price:90000,
    decision:'IN',skip_reason:null,processing_state:'DRAFT'},
]
const state={
  user:{app_metadata:{role:'operator'}},
  revalidations:[],calls:[],stock:[],failV2:false,
}
function query(name){
  const q={
    _column:null,_value:null,
    select(){return this},
    eq(column,value){this._column=column;this._value=value;return this},
    in(column,values){
      let data=[]
      if(name==='orders')data=rows.filter(x=>values.includes(x.id))
      if(name==='receive_batch_details')data=rows.filter(x=>values.includes(x.id)).map(x=>({
        order_id:x.id,receive_batches:{warehouse_id:warehouseId}
      }))
      if(name==='warehouse_item_decisions')data=decisions.filter(x=>values.includes(x.order_id))
      return Promise.resolve({data,error:null})
    },
    async maybeSingle(){
      if(name!=='warehouses')throw Error('wrong table query')
      return {data:this._value===warehouseId?{id:warehouseId,code:'BG',is_active:true}:null,error:null}
    },
  }
  return q
}
state.supabase={
  from:query,
  async rpc(name,args){
    state.calls.push({name,args})
    if(name==='receive_orders_into_warehouse'){
      for(const id of args.p_order_ids){
        const row=rows.find(x=>x.id===id)
        if(row.warehouse_status!=='READY_TO_TRANSFER')
          return {error:{message:'Đơn đã xử lý'}}
      }
      for(const id of args.p_order_ids){
        rows.find(x=>x.id===id).warehouse_status='WAREHOUSE_RECEIVED'
        state.stock.push({id,type:'LEGACY'})
      }
      return {error:null}
    }
    if(name==='finalize_warehouse_item_decisions'){
      if(state.failV2)return {error:{message:'Đơn không còn ở trạng thái chờ xử lý kho'}}
      const row=rows.find(x=>x.id===args.p_order_id)
      if(row.warehouse_status!=='READY_TO_TRANSFER')return {error:{message:'Đơn đã xử lý'}}
      row.warehouse_status='WAREHOUSE_MIXED'
      state.stock.push({id:args.p_order_id,type:'V2',stockItems:1,skippedItems:1})
      return {error:null}
    }
    throw Error('unexpected RPC '+name)
  },
}
globalThis.__bulkQA=state
const input=(orderIds)=>({warehouseId,orderIds,note:'Nghiệm thu'})
process.env.ERP_WAREHOUSE_V2_LIVE='false'
await assert.rejects(bulkReceiveWarehouseOrders(input([ids[0]])),/Preview chỉ xem/)
process.env.ERP_WAREHOUSE_V2_LIVE='true'
state.user.app_metadata.role='viewer'
await assert.rejects(bulkReceiveWarehouseOrders(input([ids[0]])),/Không có quyền nhập kho/)
state.user.app_metadata.role='operator'
await assert.rejects(bulkReceiveWarehouseOrders(input(Array.from({length:26},(_,i)=>
  '10000000-0000-4000-8000-'+String(100+i).padStart(12,'0')))),/Danh sách đơn/)
await assert.rejects(bulkReceiveWarehouseOrders({warehouseId:'HUB-NONE',orderIds:[ids[0]]}),/Danh sách đơn/)
assert.equal(state.calls.length,0,'invalid/unauthorized input never calls an RPC')

const result=await bulkReceiveWarehouseOrders(input(ids.slice(0,3)))
assert.deepEqual(result.succeeded,[ids[0],ids[1]],'legacy & V2 committed successfully')
assert.deepEqual(result.failed.map(x=>x.orderId),[ids[2]],'incomplete V2 excluded before RPC')
assert.equal(result.legacyOrders,1)
assert.equal(result.itemDecisionOrders,1)
assert.equal(result.stockItemLines,1)
assert.equal(result.skippedItemLines,1)
assert.deepEqual(state.calls.map(x=>x.name),[
  'receive_orders_into_warehouse','finalize_warehouse_item_decisions',
])
assert.equal(state.stock.length,2)
assert.equal(state.stock[1].stockItems,1)
assert.equal(state.stock[1].skippedItems,1)
assert.ok(state.revalidations.includes('/warehouse/inventory'))

const replay=await bulkReceiveWarehouseOrders(input([ids[0],ids[1]]))
assert.equal(replay.succeeded.length,0,'already processed orders never repeated')
assert.equal(replay.failed.length,2)
assert.equal(state.stock.length,2,'retries do not increase stock')
assert.equal(state.calls.length,2,'retries rejected during preflight, no RPC called')

state.failV2=true
const failed=await bulkReceiveWarehouseOrders(input([ids[3]]))
assert.deepEqual(failed.succeeded,[],'a failed V2 RPC cannot be reported successful')
assert.equal(failed.failed.length,1,'a failed V2 order remains available for operator review')
assert.equal(state.stock.length,2,'V2 errors cannot add simulated inventory')

console.log('PASS: 10 bulk action assertions; auth, preview, preflight, legacy, V2, partial result, idempotency')
