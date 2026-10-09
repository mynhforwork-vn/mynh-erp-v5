import assert from 'node:assert/strict'
import fs from 'node:fs'
import {isPreDestinationTransit,isDeliveredAwaitingReceipt,PRE_DESTINATION_TRANSIT_STATUSES} from '../lib/tracking/status-groups.ts'

const code='SPXVN06543070497A'
for(const status of ['READY_TO_SHIP','PICKED_UP','IN_TRANSIT','ARRIVED_TRANSIT_HUB']){
  assert.equal(isPreDestinationTransit(code,status),true,'Transit before destination must include '+status)
}
for(const status of ['ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','PICKUP_FAILED','CANCELLED','RETURNED','UNKNOWN','']){
  assert.equal(isPreDestinationTransit(code,status),false,'Must exclude non-transit status: '+status)
}
for(const value of ['',null,undefined,'   ']){
  assert.equal(isPreDestinationTransit(value,'IN_TRANSIT'),false,'Missing tracking number must not count')
}
assert.equal(PRE_DESTINATION_TRANSIT_STATUSES.length,4)
assert.equal(isPreDestinationTransit(code,'in_transit'),false,'Require canonical provider status')

// Six operational KPI groups: primary transport stages must be disjoint.
// "Chờ nhận" is intentionally a subset of delivered, not an additional transport stage.
const stages=['READY_TO_SHIP','PICKED_UP','IN_TRANSIT','ARRIVED_TRANSIT_HUB','ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','CANCELLED','RETURNED','UNKNOWN']
const counters={
  transit:stages.filter(s=>isPreDestinationTransit(code,s)).length,
  atHub:stages.filter(s=>s==='ARRIVED_DESTINATION_HUB').length,
  delivering:stages.filter(s=>s==='OUT_FOR_DELIVERY').length,
  delivered:stages.filter(s=>s==='DELIVERED').length,
  failed:stages.filter(s=>s==='DELIVERY_FAILED').length,
}
assert.deepEqual(counters,{transit:4,atHub:1,delivering:1,delivered:1,failed:1})
for(const status of stages){
  const groups=[
    isPreDestinationTransit(code,status),
    status==='ARRIVED_DESTINATION_HUB',
    status==='OUT_FOR_DELIVERY',
    status==='DELIVERED',
    status==='DELIVERY_FAILED',
  ]
  assert.ok(groups.filter(Boolean).length<=1,'Disjoint transport stages: '+status)
  assert.equal(isDeliveredAwaitingReceipt(status,'WAITING_RECEIVE'),status==='DELIVERED',
    'Waiting for receipt requires DELIVERED, not merely receive flag: '+status)
}
for(const receive of ['RECEIVED','NOT_READY','',null,undefined]){
  assert.equal(isDeliveredAwaitingReceipt('DELIVERED',receive),false,
    'Received/not-ready order must not count as waiting for receipt')
}

const page=fs.readFileSync('app/(erp)/tracking/page.tsx','utf8')
const group=fs.readFileSync('components/tracking-hub-group.tsx','utf8')
const manual=fs.readFileSync('components/manual-sync-button.tsx','utf8')
const css=fs.readFileSync('app/styles/tracking-compact-actions-v1.css','utf8')
const globals=fs.readFileSync('app/globals.css','utf8')
const check=(s,key,where)=>assert.ok(s.includes(key),'Missing '+where+' '+key)

check(page,"import { isDeliveredAwaitingReceipt, isPreDestinationTransit }", 'KPI helpers')
check(page,"const transit=scopeRows.filter", 'KPI count')
check(page,"const waitingRows=scopeRows.filter((r:any)=>isDeliveredAwaitingReceipt(r.tracking_status,r.receive_status))", 'waiting status guard')
check(page,"if(sp.receive)rows=rows.filter((r:any)=>r.receive_status===sp.receive)", 'waiting quick filter second guard')
check(page,"href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE'})}", 'waiting KPI and filter links')
check(page,"const rangeRows=operationalRows.filter", 'preserve date filter')
check(page,"const hubRows=sp.hub?rangeRows.filter", 'preserve HUB filter')
check(page,"if(r.receive_status==='RECEIVED')return false", 'preserve received exclusions')
check(page,"if(r.shipping_service==='EXPRESS')return false", 'preserve express exclusions')
check(page,"isPreDestinationTransit(r.tracking_number,r.tracking_status)", 'tracking-code and status count')
check(page,"href={trackingHref({status:'PRE_DESTINATION',receive:null})}", 'clickable KPI')
check(page,"<span>Đang vận chuyển</span><b>{transit}</b>", 'KPI text')
check(page,"sp.status==='PRE_DESTINATION'", 'KPI active/filter')
check(page,"rows=rows.filter((r:any)=>isPreDestinationTransit(r.tracking_number,r.tracking_status))", 'KPI result filter')
check(page,"href={trackingHref({status:'PRE_DESTINATION',receive:null})}>Đang vận chuyển</Link>", 'quick filter')
const start=page.indexOf('<div className="tracking-status-strip-v2">')
const end=page.indexOf('</div>',start)
const strip=page.slice(start,end)
assert.equal((strip.match(/tracking-status-metric/g)||[]).length,6,'Exactly six tracking KPIs')
const requiredKpiOrder=['Đang vận chuyển','Đến HUB','Đang giao','Giao thành công','Giao lỗi','Chờ nhận']
const seenKpiOrder=[...strip.matchAll(/<span>(Đang vận chuyển|Đến HUB|Đang giao|Giao thành công|Giao lỗi|Chờ nhận)<\/span>/g)].map(match=>match[1])
assert.deepEqual(seenKpiOrder,requiredKpiOrder,'KPI order must exactly match user-approved workflow')
const quickStart=page.indexOf('<div className="tracking-filter-segments tracking-filter-segments-v2">')
const quickEnd=page.indexOf('</div>',quickStart)
const quick=page.slice(quickStart,quickEnd)
const quickOrder=[...quick.matchAll(/>(Đang vận chuyển|Đến HUB|Đang giao|Giao thành công|Giao lỗi|Chờ nhận)<\/Link>/g)].map(match=>match[1])
assert.deepEqual(quickOrder,requiredKpiOrder,'Quick filter order should mirror the KPI order')
assert.ok(!strip.includes('Đang trung chuyển'),'Legacy KPI label must be removed')

check(group,'<Link className="table-link" href={orderHref(r.id)}>', 'order code navigation remains')
check(group,'<ManualSyncButton shipmentId={r.shipment_id} iconOnly/>', 'icon-only sync')
assert.ok(!group.includes('>Chi tiết</Link>'),'Remove redundant row detail button')
check(manual,'iconOnly=false','backwards compatibility')
check(manual,'aria-label={label}','screen reader sync')
check(manual,'disabled={busy}','prevent duplicate sync')
check(manual,'role={state===\'error\'?\'alert\':\'status\'}','visible feedback')
check(manual,"fetch('/api/tracking/manual'","same manual sync backend")
check(css,'.tracking-sync-icon-button','icon style')
check(css,'flex-wrap:nowrap','one-row KPI strip')
check(css,'overflow-x:auto','KPI horizontal fallback')
check(css,'width:29px','icon density')
check(css,'prefers-reduced-motion:reduce','motion accessibility')
check(globals,"@import './styles/tracking-compact-actions-v1.css';",'import')

console.log('PASS: transit KPI+filter excludes post-HUB/terminal/unknown and requires MVD; icon sync accessible, no duplicate Details, six compact KPI')
