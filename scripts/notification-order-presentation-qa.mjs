import assert from 'node:assert/strict'
import {buildOrderNotices,cleanTrackingReason} from '../lib/notification-order-presentation.ts'
const stamp='2026-10-09T01:00:00.000Z'
const row=(status,code,id,read,reason='R00',time=stamp)=>({
  alert_ids:[id],alert_type:status,label:({
    ARRIVED_DESTINATION_HUB:'Đến kho đích',
    OUT_FOR_DELIVERY:'Đang giao hàng',DELIVERED:'Giao hàng thành công',
    DELIVERY_FAILED:'Giao không thành công',
  })[status],destination_hub:'20-HNI Hoan Kiem Hub',alert_count:1,
  order_codes:[code],primary_order_id:null,reason_summary:reason,created_at:time,is_read:read,
})
const records=[
  row('ARRIVED_DESTINATION_HUB','26100715VS1TB6','a1',true),
  row('OUT_FOR_DELIVERY','26100715VS1TB6','a2',true),
  row('DELIVERED','26100715VS1TB6','a3',true),
  row('ARRIVED_DESTINATION_HUB','26100707IKJE9T','b1',true),
  row('OUT_FOR_DELIVERY','26100707IKJE9T','b2',true),
  row('DELIVERED','26100707IKJE9T','b3',false),
  row('DELIVERY_FAILED','2610000XYZTEST','c1',true),
]
const links=[
  {id:'11111111-1111-1111-1111-111111111111',shopee_order_id:'26100715VS1TB6',receive_status:'WAITING_RECEIVE'},
  {id:'22222222-2222-2222-2222-222222222222',shopee_order_id:'26100707IKJE9T',receive_status:'RECEIVED'},
  {id:'33333333-3333-3333-3333-333333333333',shopee_order_id:'2610000XYZTEST',receive_status:'NOT_READY'},
]
assert.equal(cleanTrackingReason('R00'),null)
assert.equal(cleanTrackingReason('R00 · R01'),null)
assert.equal(cleanTrackingReason('R00 · Khách yêu cầu giao lại'),'Khách yêu cầu giao lại')
assert.equal(cleanTrackingReason('Không liên lạc được người nhận'),'Không liên lạc được người nhận')
const out=buildOrderNotices(records,links)
assert.equal(out.length,3,'7 alert events collapse to 3 orders')
const waiting=out.find(x=>x.order_code==='26100715VS1TB6')
assert.ok(waiting)
assert.equal(waiting.event_type,'DELIVERED')
assert.equal(waiting.group_count,3)
assert.equal(waiting.timeline.length,3,'all original events remain in history')
assert.equal(waiting.is_read,true,'already read is not a resolved action')
assert.equal(waiting.requires_action,true,'DELIVERED + WAITING_RECEIVE still needs receipt confirmation')
assert.equal(waiting.title,'Chờ xác nhận nhận hàng')
assert.deepEqual(new Set(waiting.legacy_ids),new Set(['a1','a2','a3']))
assert.equal(waiting.timeline.every(x=>x.reason===null),true)
const received=out.find(x=>x.order_code==='26100707IKJE9T')
assert.equal(received.requires_action,false,'received order does not require confirmation')
assert.equal(received.is_read,false,'unread event is not lost by grouping')
const failed=out.find(x=>x.order_code==='2610000XYZTEST')
assert.equal(failed.requires_action,true)
assert.equal(failed.severity,'critical')
assert.equal(failed.is_read,true,'read and needs action are independent')
assert.equal(out.filter(x=>!x.is_read).length,1)
assert.equal(out.filter(x=>x.requires_action).length,2)
console.log('PASS: R00 hidden, events grouped by order, latest stage, timeline retained, unread independent from action')
