import assert from 'node:assert/strict'
import fs from 'node:fs'
import {trackingNumberMeansCancelled,orderIsCancelled} from '../lib/purchase-order-cancellation.ts'

assert.equal(trackingNumberMeansCancelled('KHÔNG CÓ'),true)
assert.equal(trackingNumberMeansCancelled('  không    có  '),true)
assert.equal(trackingNumberMeansCancelled('SPX123456'),false)
assert.equal(orderIsCancelled({order_status:'CANCELLED',shipments:[]}),true)
assert.equal(orderIsCancelled({order_status:'PROCESSING',shipments:[{tracking_number:'KHÔNG CÓ',is_active:true}]}),true)
assert.equal(orderIsCancelled({order_status:'PROCESSING',shipments:[{tracking_number:'SPX123456',is_active:true}]}),false)

const action=fs.readFileSync('lib/actions/core.ts','utf8')
const quick=action.slice(action.indexOf('export async function quickAddTrackingNumber'),action.indexOf('export async function replaceShipment'))
const replace=action.slice(action.indexOf('export async function replaceShipment'),action.indexOf('export async function bulkImportERPUsers'))
assert.match(quick,/trackingNumberMeansCancelled\(trackingNumber\)[\s\S]*?cancelOrderFromTrackingMarker/)
assert.match(replace,/trackingNumberMeansCancelled\(trackingNumber\)[\s\S]*?cancelOrderFromTrackingMarker/)
assert.match(action,/tracking_number:'KHÔNG CÓ',carrier:null,current_tracking_status:'CANCELLED'/)
assert.match(action,/tracking_enabled:false,next_track_at:null/)
assert.match(action,/order_status:'CANCELLED'/)
assert.match(action,/redirect\('\/settings\?section=tracking&tracking_tab=mapping&mapped=1'\)/)

const orderTable=fs.readFileSync('components/purchase-order-table.tsx','utf8')
assert.match(orderTable,/!trackingNumberMeansCancelled\(trackingNumber\)&&<select name="carrier_config_id"/)
const form=fs.readFileSync('components/order-editor-form.tsx','utf8')
assert.match(form,/trackingNumberMeansCancelled\(trackingNumber\)\?'Đơn bị huỷ'/)

const settings=fs.readFileSync('components/tracking-settings.tsx','utf8')
assert.match(settings,/setMappingExpanded\(true\);setTab\('mapping'\)/)
assert.match(settings,/tracking-mapping-content-v9'\)\?\.scrollIntoView/)
const page=fs.readFileSync('app/(erp)/settings/page.tsx','utf8')
assert.match(page,/tracking_tab\?:'operation'\|'cycle'\|'mapping'/)
assert.match(page,/const provider=String\(joined\?\.carrier/)
assert.match(page,/String\(config\?\.carrier_code\?\?provider\)/)

console.log('PASS static cancellation marker and mapping navigation contracts')
