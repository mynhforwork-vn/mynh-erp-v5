import assert from 'node:assert/strict'
import fs from 'node:fs'
import {suggestDestinationHub} from '../lib/destination-hub-resolution.ts'

const hubs=[
  {hub_code:'20-HNI Hai Ba Trung 8 Hub',carrier_code:'SPX',province_keywords:['Hà Nội'],
    district_keywords:['Hai Bà Trưng','Bạch Mai'],priority:10},
  {hub_code:'20-HNI Dong Da 4 Hub',carrier_code:'SPX',province_keywords:['Hà Nội'],
    district_keywords:['Đống Đa','Dong Da'],priority:20},
  {hub_code:'20-HNI Hoan Kiem Hub',carrier_code:'SPX',province_keywords:['Hà Nội'],
    district_keywords:['Hoàn Kiếm','Cửa Nam'],priority:30},
  {hub_code:'17-BGG Bac Giang 3 Hub',carrier_code:'SPX',
    province_keywords:['Bắc Giang','Bắc Ninh'],district_keywords:[],priority:40},
]
const match=(addr)=>suggestDestinationHub(addr,hubs,'SPX')?.hub_code??null
assert.equal(match('10 Phan Chu Trinh, Phường Cửa Nam, Hà Nội'),'20-HNI Hoan Kiem Hub')
assert.equal(match('Ngõ 100 Bạch Mai, Hai Bà Trưng, Hà Nội'),'20-HNI Hai Ba Trung 8 Hub')
assert.equal(match('Phường Đống Đa, Thành phố Hà Nội'),'20-HNI Dong Da 4 Hub')
assert.equal(match('Phường Nếnh, Bắc Ninh'),'17-BGG Bac Giang 3 Hub')
assert.equal(match('Bắc Giang'),'17-BGG Bac Giang 3 Hub')
assert.equal(match('Hà Nội'),null,'Ambiguous Hanoi should not pick one of three HUBs')
assert.equal(match('Không rõ tỉnh thành'),null)
assert.equal(suggestDestinationHub('Hà Nội',[], 'SPX'),null)
assert.equal(suggestDestinationHub('Bắc Ninh',hubs,'GHN'),null,'Never infer SPX HUB for unsupported carrier')
const duplicate=[...hubs,{...hubs[2],hub_code:'20-HNI Duplicate Hoan Kiem Hub'}]
assert.equal(suggestDestinationHub('Cửa Nam, Hà Nội',duplicate,'SPX'),null,'Tie must not guess HUB')
const core=fs.readFileSync('lib/actions/core.ts','utf8')
const form=fs.readFileSync('components/order-editor-form.tsx','utf8')
assert.ok(form.startsWith("'use client'"),'Client component directive must stay at top')
assert.ok(form.includes("suggestDestinationHub(address,sortedHubs,'SPX')"),
 'Order editor must use the same routing logic')
assert.ok(core.includes(".eq('carrier_code',carrierName)"),
 'SPX code/name mismatch was not fixed')
assert.ok(core.includes("carrier==='SPX Express'?'SPX':carrier"),
 'SPX display name must normalize for matching')
for(const fn of ['createOrder','updateOrder','quickAddTrackingNumber','replaceShipment']){
 const a=core.indexOf('export async function '+fn+'(')
 const b=core.indexOf('export async function ',a+23)
 assert.ok(core.slice(a,b<0?undefined:b).includes('destinationHubFromAddress('),
  'Address rule match absent in '+fn)
}
assert.ok(core.includes("next_track_at:new Date().toISOString()"),
 'First scan must be queued immediately after adding MVD')
console.log('PASS: configured HUB address rules, SPX code/name fix, safe ambiguity, front/back consistency and first scan queue')
