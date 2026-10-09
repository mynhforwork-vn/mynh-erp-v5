import assert from 'node:assert/strict'
import fs from 'node:fs'
const view=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
const css=fs.readFileSync('app/styles/notification-neo-soft-a.css','utf8')
const global=fs.readFileSync('app/globals.css','utf8')
const wrangler=fs.readFileSync('wrangler.neo-soft-a.jsonc','utf8')
function includes(haystack,needle){assert.ok(haystack.includes(needle),'Missing Neo Soft contract: '+needle)}
for(const text of [
 'neo-soft-v1','neo-soft-notice-list','neo-soft-notice-primary',
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
for(const text of ['.neo-soft-v1.app-alert-panel-v2','.neo-soft-notice-primary',
 '.neo-soft-notice','.neo-soft-detail-section','.neo-soft-hub-line',
 '.neo-soft-timeline','prefers-reduced-motion'])includes(css,text)
const fetchCount=(view.match(/\bfetch\(/g)||[]).length
assert.equal(fetchCount,2,'GET polling and deliberate POST should be the only notification fetch calls')
assert.ok(!view.includes('neo-soft-stats'),'Large dashboard KPI cards must be removed from notification drawer')
assert.ok(!view.includes('neo-soft-notice-tags'),'No redundant fourth/fifth row of badges in each notification')
assert.ok(css.includes('width:min(408px,94vw)'), 'Drawer must be compact, not 468px')
assert.ok(css.includes('min-height:56px'), 'Header should stay compact')
assert.ok(css.includes('gap:5px'), 'Notification rows must be dense')
assert.ok(view.includes('neo-soft-result-count'), 'Compact HUB selection must show filtered order count')
assert.ok(view.includes('neo-soft-chevron'), 'Rows must have a clear drill-down affordance')
assert.ok(view.includes("row.requires_action&&!row.is_resolved"),'Business action state must remain visible')
assert.ok(!view.includes('notification-center-v1'),'Do not import V1 layout on Neo Soft preview')

assert.ok(view.includes('neo-soft-notice-tracking'), 'MVD must be prominent in each notification row')
assert.ok(view.includes('neo-soft-detail-mvd'), 'MVD must be prominent in details')
const lineCode=view.indexOf('className="neo-soft-notice-code"')
const lineMvd=view.indexOf('className="neo-soft-notice-tracking"')
const lineHub=view.indexOf('className="neo-soft-notice-secondary"')
assert.ok(lineCode>=0&&lineMvd>lineCode&&lineHub>lineMvd, 'MVD needs to appear immediately under order code, above HUB')
assert.ok(view.includes('row.tracking_number||\'Chưa có mã vận đơn\''), 'Tracking fallback must be explicit')
assert.ok(view.includes('neo-soft-detail-sheet'),'Unified enterprise detail sheet missing')
assert.ok(view.includes('neo-soft-header-tools'), 'Three icon actions must be at the top')
for(const icon of ['ReadAllIcon','NotificationSwitchIcon','TrackingIcon']){
  assert.ok(view.includes('<'+icon),'Missing actionable icon: '+icon)
}
for(const title of ['Đánh dấu đã đọc tất cả','Tắt thông báo','Mở Cảnh báo vận chuyển']){
  assert.ok(view.includes('title="'+title+'"')||view.includes("'"+title+"'"),
    'Icon needs accessible tooltip: '+title)
}
const header=view.indexOf('<header className="app-alert-panel-head-v2">')
const top=view.indexOf('<div className="neo-soft-topzone">')
const iconGroup=view.indexOf('className="app-alert-panel-actions-v2 neo-soft-header-tools"')
assert.ok(header>=0&&iconGroup>header&&iconGroup<top, 'Icon actions must all appear next to header')
assert.ok(!view.includes('neo-soft-footer'), 'Bottom quick-action buttons must be removed')
assert.ok(!view.includes('<footer'), 'No extra footer occupying notification list')
assert.ok(css.includes('grid-template-rows:auto auto minmax(0,1fr)!important'), 'Slidebar needs three-row layout, no footer')
assert.ok(css.includes('.neo-soft-notice-tracking>strong'), 'Tracking code needs emphasized typography')
assert.ok(css.includes('.neo-soft-detail-sheet .neo-soft-detail-section + .neo-soft-detail-section'), 'Detail sections need fine dividers')
assert.ok(css.includes('.neo-soft-header-tools .neo-soft-tool'), 'Header icons need consistent styling')
assert.ok(view.includes('disabled={pending||unread===0'), 'Read-all must be disabled when no unread alerts')
assert.ok(view.includes('aria-pressed={notificationsEnabled===true}'), 'Toggle must expose on/off state')


// Readability acceptance contract: keep a neutral palette and text above
// WCAG AA contrast 4.5:1 on white; no teal-dominant walls of UI chrome.
function luminance(hex){
  const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
    .map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4))
  return r*.2126+g*.7152+b*.0722
}
function contrast(hex1,hex2){
  const a=luminance(hex1),b=luminance(hex2)
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
}
for(const color of ['#253746','#35495a','#596b7b','#5c6e7c',
  '#647583','#266c50','#8b612d','#385e7c','#a34f4e','#24485c']){
  assert.ok(contrast(color,'#ffffff')>=4.5,
    'Insufficient contrast on white: '+color+' '+contrast(color,'#ffffff').toFixed(2))
  assert.ok(css.includes(color),'Accessible palette missing: '+color)
}
for(const token of ['Neo Soft A · Readability remediation',
  '--notice-ink:#253746','--notice-background:#f7f8fa',
  '.neo-soft-notice-tracking>strong',
  '.neo-soft-detail-sheet .neo-soft-kv dt',
  '.neo-soft-detail-sheet .neo-soft-product strong',
  '.neo-soft-detail-sheet .neo-soft-timeline time',
  '.neo-soft-header-tools .neo-soft-tool']){
  assert.ok(css.includes(token),'Readability CSS contract missing: '+token)
}
console.log('PASS: compact layout + WCAG AA charcoal text + restrained semantic colors + clear MVD and detail typography')
