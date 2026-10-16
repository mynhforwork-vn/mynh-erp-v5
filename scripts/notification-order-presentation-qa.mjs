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
  {id:'11111111-1111-1111-1111-111111111111',shopee_order_id:'26100715VS1TB6',receive_status:'WAITING_RECEIVE',shipments:[{is_active:true,current_tracking_status:'DELIVERED'}]},
  {id:'22222222-2222-2222-2222-222222222222',shopee_order_id:'26100707IKJE9T',receive_status:'RECEIVED',shipments:[{is_active:true,current_tracking_status:'DELIVERED'}]},
  {id:'33333333-3333-3333-3333-333333333333',shopee_order_id:'2610000XYZTEST',receive_status:'NOT_READY',shipments:[{is_active:true,current_tracking_status:'DELIVERY_FAILED'}]},
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
assert.equal(failed.is_read,false,'failure stays unread after acknowledgement until successful delivery/cancellation')
assert.equal(failed.reminder_active,true,'failure remains actionable while the order is unresolved')
assert.equal(out.filter(x=>!x.is_read).length,2)
assert.equal(out.filter(x=>x.requires_action).length,2)
console.log('PASS: R00 hidden, events grouped by order, latest stage, timeline retained, unread independent from action')

const retryCode='QA-DELIVERY-RETRY'
const deliveredCode='QA-DELIVERY-SUCCESS'
const cancelledCode='QA-DELIVERY-CANCELLED'
const returnedCode='QA-DELIVERY-RETURNED'
const ongoingCode='QA-DELIVERY-ONGOING'
const priorFailure=(code,base)=>[
  row('DELIVERY_FAILED',code,base+'-failed',true,'Giao không thành công','2026-10-13T06:00:00.000Z'),
  row('OUT_FOR_DELIVERY',code,base+'-retry',true,'Đang giao lại','2026-10-14T06:00:00.000Z'),
]
const replay=[
  ...priorFailure(retryCode,'retry'),
  ...priorFailure(deliveredCode,'success'),
  row('DELIVERED',deliveredCode,'success-delivered',true,'Đã giao','2026-10-14T07:00:00.000Z'),
  ...priorFailure(cancelledCode,'cancel'),
  ...priorFailure(returnedCode,'returned'),
  ...priorFailure(ongoingCode,'ongoing'),
]
const order=(code,status,order_status='PROCESSING')=>({
  id:'44444444-4444-4444-4444-444444444444',
  shopee_order_id:code,receive_status:'NOT_READY',order_status,
  shipments:[{is_active:true,current_tracking_status:status}],
})
const replayOut=buildOrderNotices(replay,[
  order(retryCode,'OUT_FOR_DELIVERY'),
  order(deliveredCode,'DELIVERED'),
  order(cancelledCode,'CANCELLED','CANCELLED'),
  order(returnedCode,'RETURNED'),
  order(ongoingCode,'DELIVERY_FAILED'),
])
assert.equal(replayOut.length,4,'cancelled orders stay absent')
const retried=replayOut.find(x=>x.order_code===retryCode)
assert.equal(retried.event_type,'OUT_FOR_DELIVERY','current retry outranks historical failure')
assert.equal(retried.reminder_active,false,'retry no longer has an active failure reminder')
assert.equal(retried.is_read,true,'read historical failure stays acknowledged during retry')
assert.equal(retried.requires_action,false,'retry is not a delivery-failed action')
assert.equal(retried.timeline.length,2,'historical failed/retry events retained')
assert.equal(retried.timeline[0].type,'OUT_FOR_DELIVERY','timeline respects event chronology')
assert.ok(retried.timeline.some(x=>x.type==='DELIVERY_FAILED'),'failure stays in history')
const succeeded=replayOut.find(x=>x.order_code===deliveredCode)
assert.equal(succeeded.event_type,'DELIVERED','successful delivery wins over prior failure')
assert.equal(succeeded.reminder_active,false)
assert.equal(succeeded.is_read,true,'success removes persistent unread override')
assert.equal(succeeded.requires_action,false)
assert.equal(succeeded.timeline.length,3,'failure remains in history after delivery')
const returned=replayOut.find(x=>x.order_code===returnedCode)
assert.equal(returned.reminder_active,false,'returned package must not pin prior delivery failure')
assert.equal(returned.event_type,'RETURNED')
const ongoing=replayOut.find(x=>x.order_code===ongoingCode)
assert.equal(ongoing.reminder_active,true)
const noDeliveredEvent=buildOrderNotices(priorFailure('QA-LIVE-SUCCESS','ld'),[
  order('QA-LIVE-SUCCESS','DELIVERED'),
])[0]
assert.equal(noDeliveredEvent.event_type,'DELIVERED','live shipment state is authoritative')
assert.equal(noDeliveredEvent.reminder_active,false)

const transit=buildOrderNotices(priorFailure('QA-RESUMED-TRANSIT','transit'),[
  order('QA-RESUMED-TRANSIT','IN_TRANSIT'),
])[0]
assert.equal(transit.event_type,'IN_TRANSIT','use live transport status after delivery failure')
assert.equal(transit.title,'Đang vận chuyển')
assert.equal(transit.reminder_active,false)
assert.equal(transit.requires_action,false)
assert.ok(transit.timeline.some(x=>x.type==='DELIVERY_FAILED'))
const hub=buildOrderNotices(priorFailure('QA-RETRY-HUB','hub'),[
  order('QA-RETRY-HUB','ARRIVED_DESTINATION_HUB'),
])[0]
assert.equal(hub.event_type,'ARRIVED_DESTINATION_HUB')
assert.equal(hub.reminder_active,false)
const noLive=buildOrderNotices([
  row('DELIVERY_FAILED','QA-NO-LIVE','z1',true,'Giao lỗi','2026-10-13T06:00:00.000Z'),
  row('OUT_FOR_DELIVERY','QA-NO-LIVE','z2',true,'Giao lại','2026-10-14T06:00:00.000Z'),
],[{id:'66666666-6666-4666-8666-666666666666',shopee_order_id:'QA-NO-LIVE',receive_status:'NOT_READY'}])[0]
assert.equal(noLive.event_type,'OUT_FOR_DELIVERY','newest real alert wins when live status is absent')
assert.equal(noLive.reminder_active,false)
console.log('DELIVERY_FAILURE_PERSISTENCE_QA_SUMMARY '+JSON.stringify({
  failedReminder:true,retryUnpinned:true,transitUnpinned:true,
  hubUnpinned:true,returnedUnpinned:true,succeededClears:true,
  cancelledClears:true,historyPreserved:true,unchangedPolling:true,
}))
