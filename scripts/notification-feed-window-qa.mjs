import assert from 'node:assert/strict'
import {selectNotificationWindow} from '../lib/notification-feed-window.ts'

const categories=['mvd','receive','intake','other']
const rows=Array.from({length:100},(_,i)=>({
  id:'notice-'+i,created_at:'2026-10-16T00:00:00.000Z',
  group:categories[i%categories.length],
  is_read:i%10!==0,
  requires_action:i<11||(i>=40&&i<62),
  is_resolved:false,
}))
const feed=selectNotificationWindow(rows,40,0,true)
assert.equal(feed.items.length,40,'normal feed stays paginated at 40')
assert.equal(feed.action_total,33,'action summary uses all 100 records')
assert.equal(feed.items.filter(x=>x.requires_action).length,11,'reproduce 33 vs 11')
assert.equal(feed.supplemental_items.filter(x=>x.requires_action).length,22,'restore the hidden 22')
assert.equal(feed.supplemental_items.length,feed.supplemental_items.filter(x=>x.requires_action||!x.is_read).length)
const combined=[...feed.items,...feed.supplemental_items]
assert.equal(new Set(combined.map(x=>x.id)).size,combined.length,'no repeated records')
const actionable=combined.filter(x=>x.requires_action&&!x.is_resolved)
assert.equal(actionable.length,feed.action_total,'action tab has every counted record')
const groupCounts=categories.map(g=>actionable.filter(x=>x.group===g).length)
assert.equal(groupCounts.reduce((a,b)=>a+b,0),feed.action_total,'groups reconcile with action total')
assert.equal(combined.filter(x=>!x.is_read).length,feed.unread_total,
  'unread tab has every counted record')
assert.deepEqual(feed.items,rows.slice(0,40),'All tab retains original order')
const noExtra=selectNotificationWindow(rows,40,40,false)
assert.equal(noExtra.supplemental_items.length,0,'extra only on default first-page feed')
const resolved=rows.map((x,i)=>i===12?{...x,requires_action:true,is_resolved:true}:x)
assert.equal(selectNotificationWindow(resolved,40,0,true).action_total,33,
  'resolved items do not inflate action total')
console.log('NOTIFICATION_FEED_WINDOW_QA_SUMMARY '+JSON.stringify({
  passed:11,failed:0,firstPage:40,actionTotal:33,firstPageAction:11,extraAction:22,
  newRequests:0,
}))
