import assert from 'node:assert/strict'
import fs from 'node:fs'
import {buildOrderWorkNotices,missingMvd,pendingIntake} from '../lib/notification-order-tasks.ts'

const root=(id,override={})=>({
  id,shopee_order_id:'ORDER-'+id,order_date:'2026-10-09T05:00:00.000Z',
  order_status:'PENDING',shipping_service:'STANDARD',
  receive_status:'NOT_READY',warehouse_status:'NOT_READY',
  cod:1900,destination_hub:null,
  shipments:[],order_items:[{product_name:'Test item',quantity:1}],...override,
})
const a=root('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
const b=root('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{
  order_status:'COMPLETED',receive_status:'RECEIVED',
  warehouse_status:'READY_TO_TRANSFER',destination_hub:'20-HNI Example Hub',
  shipments:[{id:'s2',is_active:true,tracking_number:'SPXVNTEST',carrier:'SPX'}],
})
const tracked=root('cccccccc-cccc-4ccc-8ccc-cccccccccccc',{
  order_status:'PROCESSING',shipments:[{id:'s3',is_active:true,
   tracking_number:'SPXVNTEST2',carrier:'SPX'}],
})
const finished=root('dddddddd-dddd-4ddd-8ddd-dddddddddddd',{
  receive_status:'RECEIVED',warehouse_status:'STOCKED',order_status:'COMPLETED',
})
assert.equal(missingMvd(a),true)
assert.equal(missingMvd(b),false)
assert.equal(missingMvd(tracked),false)
assert.equal(missingMvd(finished),false)
assert.equal(pendingIntake(b),true)
assert.equal(pendingIntake(finished),false)
const tasks=buildOrderWorkNotices([a,b,tracked,finished])
assert.equal(tasks.length,2)
const mvd=tasks.find(x=>x.work_type==='tracking_missing')
const warehouse=tasks.find(x=>x.work_type==='warehouse_intake')
assert.equal(mvd?.is_read,true,'Business task is not a repeated unread ping')
assert.equal(mvd?.requires_action,true)
assert.equal(mvd?.event_type,'MISSING_TRACKING')
assert.match(mvd.target_path,/mode=edit/)
assert.equal(mvd.order_code,a.shopee_order_id)
assert.equal(mvd.tracking_number,null)
assert.equal(warehouse?.destination_hub,'','Intake must NOT be grouped by destination HUB')
assert.equal(warehouse?.event_type,'WAREHOUSE_INTAKE')
assert.equal(warehouse?.requires_action,true)
assert.ok(warehouse.target_path.startsWith('/warehouse/receive'))
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
const ui=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
const core=fs.readFileSync('lib/actions/core.ts','utf8')
const css=fs.readFileSync('app/styles/notification-neo-soft-a.css','utf8')
for(const x of [
 "buildOrderWorkNotices((taskOrders??[]) as TaskOrder[])",
 ".is('archived_at',null)",".order('order_date',{ascending:false})",
 "workNotices", "warehouse_status", "receiving_warehouses",
])assert.ok(api.includes(x),'missing operational feed: '+x)
for(const x of [
 "'tracking'|'system'|'work'","'tracking_missing'|'warehouse_intake'",
 "ActionGroup='all'|'mvd'|'receive'|'intake'|'other'",
 "'Cập nhật MVD'","'Nhập kho'","'Chờ nhận'",
 "filter==='action'","taskGroup(row)===actionGroup",
 "row.work_type==='tracking_missing'?'Cập nhật MVD",
 "row.work_type==='warehouse_intake'?'Đến Nhập kho",
])assert.ok(ui.includes(x),'missing UI work group: '+x)
const i=core.indexOf('async function queueFirstTracking(')
assert.ok(i>=0)
assert.ok(core.slice(i,i+450).includes('next_track_at:new Date().toISOString()'))
for(const fn of ['createOrder','updateOrder','quickAddTrackingNumber','replaceShipment']){
  const start=core.indexOf('export async function '+fn+'(')
  const end=core.indexOf('export async function ',start+23)
  assert.ok(core.slice(start,end<0?undefined:end).includes('queueFirstTracking(supabase,'),
    'No initial provider scheduling for '+fn)
}
assert.ok(css.includes('.neo-soft-task-tabs'))
console.log('PASS: new-order missing MVD + post-receipt intake notifications, split action categories, no DB migration, immediate first provider queue')
