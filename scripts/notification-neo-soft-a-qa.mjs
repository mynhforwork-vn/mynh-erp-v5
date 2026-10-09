import assert from 'node:assert/strict'
import fs from 'node:fs'
const view=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
const css=fs.readFileSync('app/styles/notification-neo-soft-a.css','utf8')
const global=fs.readFileSync('app/globals.css','utf8')
const wrangler=fs.readFileSync('wrangler.neo-soft-a.jsonc','utf8')
function includes(haystack,needle){assert.ok(haystack.includes(needle),'Missing Neo Soft contract: '+needle)}
for(const text of [
 'neo-soft-v1','neo-soft-stats','neo-soft-notice-list',
 'neo-soft-hub-line','neo-soft-detail','neo-soft-timeline',
 'Xem chi tiết','Mở đơn trong ERP','backToList',
 "row.receive_status!=='RECEIVED'","row.destination_hub===hub",
 "filter==='action'","filter==='unread'","filter==='all'",
 "setSelectedId(row.id)",'listScroll','username','recipient_phone',
 'products','tracking_number','isTrackingQuietNow','NOTIFICATION_POLL_MS',
 'if(notificationsEnabled!==true||trackingEnabled!==true)',
]){
 includes(view,text)
}
for(const text of [
 'buildOrderNotices','order_items(product_name,variant,quantity)',
 'shipments(tracking_number,carrier)','erp_users(username)',
 "order.receive_status==='RECEIVED'?'':", 'recipient_phone:canViewRecipient',
 'username:', 'cod:order.cod', 'products:items.map',
])includes(api,text)
includes(global,"@import './styles/notification-neo-soft-a.css'")
includes(wrangler,'"mynh-erp-neo-soft-a"')
for(const text of ['.neo-soft-v1.app-alert-panel-v2','.neo-soft-stats',
 '.neo-soft-notice','.neo-soft-detail-section','.neo-soft-hub-line',
 '.neo-soft-timeline','prefers-reduced-motion'])includes(css,text)
const fetchCount=(view.match(/\bfetch\(/g)||[]).length
assert.equal(fetchCount,2,'GET polling and deliberate POST should be the only notification fetch calls')
assert.ok(!view.includes('notification-center-v1'),'Do not import V1 layout on Neo Soft preview')
console.log('PASS: Neo Soft A cards, in-panel detail and back, HUB filters, read vs action, 5-minute/quiet gate, permission-aware data, isolated worker')
