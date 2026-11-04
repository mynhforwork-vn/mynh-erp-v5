import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {orderIsCancelled} from '../lib/purchase-order-cancellation.ts'
import {buildOrderNotices} from '../lib/notification-order-presentation.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const shipment=status=>({is_active:true,tracking_number:'SPX-TEST',current_tracking_status:status})
const order=status=>({order_status:'PROCESSING',shipments:[shipment(status)]})

assert.equal(orderIsCancelled(order('RETURNING')),false,'in-progress return remains an active order')
assert.equal(orderIsCancelled(order('RETURNED')),true,'successful return is cancelled even before DB backfill')
assert.equal(orderIsCancelled(order('CANCELLED')),true,'previous cancellation behavior remains')
assert.equal(orderIsCancelled(order('DELIVERY_FAILED')),false,'delivery failure alone must not cancel')
assert.equal(orderIsCancelled({order_status:'CANCELLED',shipments:[shipment('IN_TRANSIT')]}),true)
assert.equal(orderIsCancelled({order_status:'PROCESSING',shipments:[{is_active:true,tracking_number:'KHÔNG CÓ'}]}),true)

const failedAlert=[{
  alert_ids:['qa-failure'],alert_type:'DELIVERY_FAILED',label:'Giao hàng không thành công',
  destination_hub:'QA',alert_count:1,order_codes:['QA-RETURN-1'],primary_order_id:null,
  reason_summary:'Không liên lạc được',created_at:'2026-11-01T10:00:00Z',is_read:false,
}]
const link=status=>[{
  id:'00000000-0000-4000-8000-000000000001',
  shopee_order_id:'QA-RETURN-1',order_status:'PROCESSING',receive_status:'NOT_READY',
  shipments:[shipment(status)],
}]
assert.equal(buildOrderNotices(failedAlert,link('RETURNED')).length,0,'returned order has no active warning')
assert.equal(buildOrderNotices(failedAlert,link('RETURNING')).length,1,'returning order retains alert history')
assert.equal(buildOrderNotices(failedAlert,link('DELIVERY_FAILED'))[0].reminder_active,true,'old failed reminder stays active until terminal')

const tracking=read('app/(erp)/tracking/page.tsx')
assert.match(tracking,/r\.tracking_status==='CANCELLED'\|\|r\.tracking_status==='RETURNED'/,'live Tracking excludes returned shipments')
const migration=read('supabase/migrations/0072_cancel_successfully_returned_orders.sql')
assert.match(migration,/NEW\.current_tracking_status = 'RETURNED'/,'terminal status is exact')
assert.match(migration,/NEW\.tracking_enabled := false/,'terminal status disables tracking')
assert.match(migration,/NEW\.next_track_at := null/,'terminal status removes schedule')
assert.match(migration,/order_status = 'CANCELLED'/,'order is cancelled')
assert.match(migration,/NEW\.is_active IS TRUE/,'only active shipment cancels its order')
assert.match(migration,/UPDATE public\.orders o[\s\S]*?EXISTS \([\s\S]*?s\.current_tracking_status = 'RETURNED'/,'historical rows are backfilled')
assert.match(migration,/telegram_suppressed_reason = 'RETURNED_SHIPMENT_TERMINAL'/,'unsent alerts are suppressed')
assert.doesNotMatch(migration,/(?:UPDATE|DELETE FROM)\s+public\.tracking_events/i,'tracking history stays untouched')
assert.doesNotMatch(migration,/(?:UPDATE|DELETE FROM)\s+public\.(?:payment|finance|warehouse)/i,'finance and warehouse untouched')
console.log('RETURNED_SHIPMENT_STATIC_QA_PASS: RETURNED cancels + suppresses, RETURNING stays active; no DB E2E or Preview claimed')
