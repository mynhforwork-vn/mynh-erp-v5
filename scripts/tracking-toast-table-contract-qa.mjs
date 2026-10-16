import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=x=>fs.readFileSync(x,'utf8')
const toast=read('components/tracking-success-toast.tsx')
const resize=read('components/desktop-table-column-resize.tsx')
const css=read('app/styles/tracking-compact-actions-v1.css')
const hub=read('components/tracking-hub-group.tsx')
let tests=0
const check=(label,pass)=>{assert.ok(pass,label);tests++;console.log('PASS '+label)}
check('Toast positioned fixed upper-right on desktop and mobile',
 css.includes('position:fixed;')&&css.includes('left:auto!important')&&
 css.includes('right:max(14px,env(safe-area-inset-right,0px))!important')&&
 css.includes('right:max(10px,env(safe-area-inset-right,0px))!important')&&
 !css.includes('left:230px;right:auto!important'))
check('Toast dismisses 30 seconds after mount and cleans up timer',
 toast.includes('TOAST_DURATION_MS=30_000')&&
 toast.includes('window.setTimeout(()=>setVisible([]),TOAST_DURATION_MS)')&&
 toast.includes('window.clearTimeout(timer)'))
check('Receive+payment is one compact confirmation',toast.includes("received&&payment?['combined']")&&toast.includes("id:NoticeKey"))
check('Toast manually closeable and one-time URL cleaned',
 toast.includes('tracking-success-toast-close')&&toast.includes("url.searchParams.delete('received')")&&toast.includes("url.searchParams.delete('payment')"))
check('Unresized tables fill HUB including reduced visible columns',
 css.includes('min-width:max(100%,var(--tracking-table-min-width,900px))'))
check('Context slidebar uses panel floor and fits available lane',
 css.includes('min-width:max(100%,var(--tracking-table-panel-min-width,760px))'))
check('Saved widths are fitted against actual pane width',
 resize.includes('Math.floor(lane.clientWidth)')&&resize.includes('fitTrackingPanel(table,ths,preferred,overrides)'))
check('Tracking wrapper width changes trigger refit',
 resize.includes("'.order-table-card,.account-table-card,.tracking-hub-table-wrap-v2'")&&resize.includes('new ResizeObserver(()=>queue())'))
check('No change in other ERP table resize routes',
 resize.includes("const isAccount=table.matches('.mynh-p1-semantic-table.user-table')")&&resize.includes('orderFit(table,ths,overrides)'))
check('Selected columns retain action 44px and semantic order',
 hub.includes("actions:44")&&hub.includes('tracking-colgroup-')&&css.includes('width:44px!important'))
check('No new network calls or writes introduced',
 !toast.includes('fetch(')&&!css.includes('http')&&!resize.includes("fetch("))
console.log('TRACKING_TOAST_TABLE_CONTRACT_QA_SUMMARY '+JSON.stringify({passed:tests,failed:0}))
