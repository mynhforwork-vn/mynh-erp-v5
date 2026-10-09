import assert from 'node:assert/strict'
import fs from 'node:fs'
import {isPreDestinationTransit,PRE_DESTINATION_TRANSIT_STATUSES} from '../lib/tracking/status-groups.ts'

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

const page=fs.readFileSync('app/(erp)/tracking/page.tsx','utf8')
const group=fs.readFileSync('components/tracking-hub-group.tsx','utf8')
const manual=fs.readFileSync('components/manual-sync-button.tsx','utf8')
const css=fs.readFileSync('app/styles/tracking-compact-actions-v1.css','utf8')
const globals=fs.readFileSync('app/globals.css','utf8')
const check=(s,key,where)=>assert.ok(s.includes(key),'Missing '+where+' '+key)

check(page,"import { isPreDestinationTransit }", 'KPI helper')
check(page,"const transit=scopeRows.filter", 'KPI count')
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
check(css,'width:29px','icon density')
check(css,'prefers-reduced-motion:reduce','motion accessibility')
check(globals,"@import './styles/tracking-compact-actions-v1.css';",'import')

console.log('PASS: transit KPI+filter excludes post-HUB/terminal/unknown and requires MVD; icon sync accessible, no duplicate Details, six compact KPI')
