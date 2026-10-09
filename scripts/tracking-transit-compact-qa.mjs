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

// Five operational KPI groups: "Giao thành công" means DELIVERED and WAITING_RECEIVE.
// No separate "Chờ nhận" KPI or quick filter; all five groups must be disjoint.
const stages=['READY_TO_SHIP','PICKED_UP','IN_TRANSIT','ARRIVED_TRANSIT_HUB','ARRIVED_DESTINATION_HUB','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','CANCELLED','RETURNED','UNKNOWN']
const counters={
  transit:stages.filter(s=>isPreDestinationTransit(code,s)).length,
  atHub:stages.filter(s=>s==='ARRIVED_DESTINATION_HUB').length,
  delivering:stages.filter(s=>s==='OUT_FOR_DELIVERY').length,
  deliveredAwaitingReceipt:stages.filter(s=>isDeliveredAwaitingReceipt(s,'WAITING_RECEIVE')).length,
  failed:stages.filter(s=>s==='DELIVERY_FAILED').length,
}
assert.deepEqual(counters,{transit:4,atHub:1,delivering:1,deliveredAwaitingReceipt:1,failed:1})
for(const status of stages){
  const groups=[
    isPreDestinationTransit(code,status),
    status==='ARRIVED_DESTINATION_HUB',
    status==='OUT_FOR_DELIVERY',
    isDeliveredAwaitingReceipt(status,'WAITING_RECEIVE'),
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
check(page,"href={trackingHref({status:'DELIVERED',receive:'WAITING_RECEIVE'})}", 'merged KPI and filter links')
check(page,"<span>Giao thành công</span><b>{waiting}</b><small>Chờ nhận", 'merged card counts waiting only')
check(page,"sp.status==='DELIVERED'&&sp.receive==='WAITING_RECEIVE'", 'merged active state')
assert.equal((page.match(/href=\{trackingHref\(\{status:'DELIVERED',receive:'WAITING_RECEIVE'\}\)\}/g)||[]).length,2,'Exactly one merged KPI link and one matching quick filter')
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
assert.equal((strip.match(/tracking-status-metric/g)||[]).length,5,'Exactly five tracking KPIs')
const requiredKpiOrder=['Đang vận chuyển','Đến HUB','Đang giao','Giao thành công','Giao lỗi']
const seenKpiOrder=[...strip.matchAll(/<span>(Đang vận chuyển|Đến HUB|Đang giao|Giao thành công|Giao lỗi|Chờ nhận)<\/span>/g)].map(match=>match[1])
assert.deepEqual(seenKpiOrder,requiredKpiOrder,'KPI order must exactly match user-approved workflow')
const quickStart=page.indexOf('<div className="tracking-filter-segments tracking-filter-segments-v2">')
const quickEnd=page.indexOf('</div>',quickStart)
const quick=page.slice(quickStart,quickEnd)
const quickOrder=[...quick.matchAll(/>(Đang vận chuyển|Đến HUB|Đang giao|Giao thành công|Giao lỗi|Chờ nhận)<\/Link>/g)].map(match=>match[1])
assert.deepEqual(quickOrder,requiredKpiOrder,'Quick filter order should mirror the KPI order')
assert.ok(!strip.includes('Đang trung chuyển'),'Legacy KPI label must be removed')
assert.ok(!strip.includes('<span>Chờ nhận</span>'),'Chờ nhận must not have a separate KPI')
assert.ok(!quick.includes('>Chờ nhận</Link>'),'Chờ nhận must not have a separate quick filter')
assert.equal((quick.match(/<\/Link>/g)||[]).length,6,'All + exactly five quick filters')
const demo=[
  {id:'in-transit',tracking_status:'IN_TRANSIT',tracking_number:code,receive_status:'NOT_READY'},
  {id:'hub',tracking_status:'ARRIVED_DESTINATION_HUB',tracking_number:code,receive_status:'NOT_READY'},
  {id:'out',tracking_status:'OUT_FOR_DELIVERY',tracking_number:code,receive_status:'NOT_READY'},
  {id:'waiting',tracking_status:'DELIVERED',tracking_number:code,receive_status:'WAITING_RECEIVE'},
  {id:'already-received',tracking_status:'DELIVERED',tracking_number:code,receive_status:'RECEIVED'},
  {id:'misflagged',tracking_status:'OUT_FOR_DELIVERY',tracking_number:code,receive_status:'WAITING_RECEIVE'},
  {id:'failed',tracking_status:'DELIVERY_FAILED',tracking_number:code,receive_status:'NOT_READY'},
]
const visible=demo.filter(row=>row.receive_status!=='RECEIVED')
const byKpi=[
  visible.filter(row=>isPreDestinationTransit(row.tracking_number,row.tracking_status)),
  visible.filter(row=>row.tracking_status==='ARRIVED_DESTINATION_HUB'),
  visible.filter(row=>row.tracking_status==='OUT_FOR_DELIVERY'),
  visible.filter(row=>isDeliveredAwaitingReceipt(row.tracking_status,row.receive_status)),
  visible.filter(row=>row.tracking_status==='DELIVERY_FAILED'),
]
assert.deepEqual(byKpi.map(group=>group.map(row=>row.id)),[['in-transit'],['hub'],['out','misflagged'],['waiting'],['failed']])
assert.equal(new Set(byKpi.flat().map(row=>row.id)).size,byKpi.flat().length,'Five KPIs cannot count the same order twice')
assert.equal(visible.filter(row=>row.tracking_status==='DELIVERED'&&row.receive_status==='WAITING_RECEIVE').length,byKpi[3].length,'Quick filter must return merged KPI count')

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
check(css,'width:24px','icon density')
check(css,'prefers-reduced-motion:reduce','motion accessibility')
check(globals,"@import './styles/tracking-compact-actions-v1.css';",'import')

console.log('PASS: transit KPI+filter excludes post-HUB/terminal/unknown and requires MVD; icon sync accessible, no duplicate Details, five compact KPI')

const resizer=fs.readFileSync('components/desktop-table-column-resize.tsx','utf8')
const sidebar=fs.readFileSync('components/sidebar-collapse-toggle.tsx','utf8')
const panel=fs.readFileSync('components/context-order-panel.tsx','utf8')
const contract=fs.readFileSync('app/styles/brand-responsive-v1.css','utf8')
check(group,"className={'tracking-col-'+col+(col==='actions'?' row-actions-head tracking-action-head':'')}",'action header compact/locked when managed columns reorder')
check(group,'className="tracking-col-actions tracking-action-cell"','semantic action cell')
check(resizer,"th.classList.contains('tracking-action-head') ? 44",'action width cannot grow to saved legacy width')
check(resizer,"window.addEventListener('mynh-sidebar-resized',queue)",'react to left rail width change')
check(resizer,"grip.addEventListener('pointerdown'",'column drag pointer')
check(resizer,"grip.addEventListener('keydown'",'column keyboard resize')
check(resizer,"localStorage.setItem(tableId(table)",'persist custom widths')
check(css,'th.tracking-col-actions','semantic action width')
check(css,'width:44px!important','compact action column')
check(css,'width:24px!important','compact sync control')
check(css,'.tracking-content-workspace.with-panel','right slidebar workspace stays separate')
check(sidebar,"dispatchEvent(new Event('mynh-sidebar-resized'))",'left rail emits resize event')
check(panel,'<SystemSlidebar','right context panel preserved')
check(contract,'.tracking-content-workspace.with-panel','two-column tracking workspace contract')
assert.ok(!css.includes('width:29px'),'No old oversized icon dimensions')
console.log('PASS: Tracking column resizers, compact 44px action column/24px sync, left and right slidebar contracts')

check(group,'<colgroup>','semantic colgroup for wide screen')
check(group,"className={'tracking-colgroup-'+col}",'managed columns and colgroup reorder together')
check(css,'table-layout:fixed!important','fixed desktop widths prevent stretched actions')
check(css,'col.tracking-colgroup-actions','action width fixed at large viewport')
check(css,'width:44px!important','locked action column via colgroup')
