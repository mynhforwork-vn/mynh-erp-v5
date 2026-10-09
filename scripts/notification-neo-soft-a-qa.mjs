import assert from 'node:assert/strict'
import fs from 'node:fs'

const view=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
const css=fs.readFileSync('app/styles/notification-neo-soft-a.css','utf8')
const global=fs.readFileSync('app/globals.css','utf8')
const wrangler=fs.readFileSync('wrangler.neo-soft-a.jsonc','utf8')
const has=(file,text)=>assert.ok(file.includes(text),'Missing contract: '+text)

// The notification list must always remain rendered, with inline expansion
// inside its article instead of a separate detail screen.
for(const text of [
 'neo-soft-notice-list','neo-soft-notice-main','neo-soft-expanded',
 'neo-soft-expanded-kv','neo-soft-expanded-section','neo-soft-inline-product',
 'neo-soft-inline-timeline','neo-soft-expanded-actions',
 'aria-expanded={selectedId===row.id}',"onClick={()=>toggleOrder(row.id)}",
 'selectedId===row.id&&<div','onClick={()=>void mark(row)}',
 "setSelectedId(current=>current===id?null:id)",
 "setSelectedId(null)","row.tracking_number||'Chưa có mã vận đơn'",
 "row.receive_status!=='RECEIVED'","row.destination_hub===hub",
 "filter==='action'","filter==='unread'","filter==='all'",
 'neo-soft-hub-line','neo-soft-result-count',
 'ReadAllIcon','NotificationSwitchIcon','TrackingIcon',
 'neo-soft-header-tools','isTrackingQuietNow','NOTIFICATION_POLL_MS',
 'if(notificationsEnabled!==true||trackingEnabled!==true)',
 'recipient_phone','products','tracking_number',
])has(view,text)
assert.ok(!view.includes('selectedNotice'),'Standalone detail view must be removed')
assert.ok(!view.includes('backToList'),'Accordion should not navigate to a second view')
assert.ok(!view.includes('neo-soft-detail-sheet'),'No nested detail cards')
assert.ok(!view.includes('neo-soft-stats'),'No KPI cards in notification drawer')
assert.ok(!view.includes('<footer'),'Header only icon actions; no bottom footer')
const a=view.indexOf('className="neo-soft-notice-code"')
const b=view.indexOf('className="neo-soft-notice-tracking"')
const c=view.indexOf('className="neo-soft-notice-secondary"')
assert.ok(a>=0&&b>a&&c>b,'Order code, MVD and HUB must be in that order')
const rowStart=view.indexOf('<article key={row.id}')
const inlineStart=view.indexOf('selectedId===row.id&&<div',rowStart)
const rowEnd=view.indexOf('</article>',rowStart)
assert.ok(rowStart>=0&&inlineStart>rowStart&&inlineStart<rowEnd,
  'Expanded details must be inside the same notification article')
assert.equal((view.match(/\bfetch\(/g)||[]).length,2,
  'Expanding and collapsing must not issue extra notification API requests')

for(const text of [
 'buildOrderNotices','order_items(product_name,variant,quantity)',
 'shipments(tracking_number,carrier)','erp_users(username)',
 'recipient_phone:canViewRecipient',"order.receive_status==='RECEIVED'?'':",
])has(api,text)
has(global,"@import './styles/notification-neo-soft-a.css'")
has(wrangler,'"mynh-erp-neo-soft-a"')

for(const text of [
 '.neo-soft-v1.app-alert-panel-v2','.neo-soft-notice-list',
 '.neo-soft-notice-tracking>strong','.neo-soft-expanded',
 '.neo-soft-expanded-section','.neo-soft-inline-timeline',
 '.neo-soft-expanded-actions','.neo-soft-header-tools',
 'grid-template-rows:auto auto minmax(0,1fr)',
 'width:min(408px,94vw)','font-weight:600','prefers-reduced-motion',
])has(css,text)
assert.ok(!css.includes('.neo-soft-detail-sheet'),
  'Old separate detail styling must be removed')
assert.ok(!/\.neo-soft-stat(?=[\s.{:#>])/.test(css),'Old KPI card styling must be removed')
const weights=[...css.matchAll(/font-weight:\s*(\d+)/g)].map(x=>Number(x[1]))
assert.ok(weights.length>0&&weights.every(n=>n<=600),
  'No font weight above 600 in drawer stylesheet')
assert.ok(!css.includes('font-weight:800')&&!css.includes('font-weight:820'),
  'No heavy typography in notification drawer')

function luminance(hex){
  const x=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
    .map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4))
  return x[0]*.2126+x[1]*.7152+x[2]*.0722
}
function contrast(a,b){
  const x=luminance(a),y=luminance(b)
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)
}
for(const color of ['#303e4c','#5a6875','#526573','#293d4d','#335266','#647784']){
  assert.ok(css.includes(color),'Core text color missing: '+color)
  assert.ok(contrast(color,'#ffffff')>=4.5,
    'Text color lacks 4.5:1 contrast on white: '+color)
}
console.log('PASS: in-place accordion under each order, one persistent list, light typography <=600, compact 408px, HUB, MVD and polling safety')
