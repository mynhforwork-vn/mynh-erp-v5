import fs from 'node:fs'
const base=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'))
const separate=JSON.parse(fs.readFileSync('wrangler.notifications-preview.jsonc','utf8'))
const workflow=fs.readFileSync('.github/workflows/cloudflare-notifications-preview.yml','utf8')
if(separate.name===base.name||separate.name==='desktop-polish-v1')throw Error('Preview is not independent')
if(separate.name!=='mynh-erp-notify-v1')throw Error('Unexpected isolated name')
if(separate.main!==base.main)throw Error('Preview is not building the same OpenNext Worker')
if(separate.workers_dev!==true)throw Error('Dedicated Workers.dev URL disabled')
if(workflow.includes('wrangler preview')||workflow.includes('opennextjs-cloudflare deploy')){
 throw Error('Preview workflow could update original Worker instead of a dedicated Worker')
}
if(!workflow.includes('wrangler deploy --config wrangler.notifications-preview.jsonc'))throw Error('Separate config is unused')
if(!workflow.includes('mynh-erp-notify-v1.mynh-forwork.workers.dev'))throw Error('Dedicated URL not checked')
if(workflow.includes('desktop-polish-v1 --worker-name'))throw Error('Original preview override found')
if(/cron|\[triggers\]/i.test(fs.readFileSync('wrangler.notifications-preview.jsonc','utf8'))){
 throw Error('Duplicated scheduled tracking would be unsafe')
}
const layout=fs.readFileSync('app/(erp)/layout.tsx','utf8')
if(!layout.includes('<InAppAlertCenter role={role} trackingEnabled={trackingEnabled} quietStart={quietStart} quietEnd={quietEnd}/>'))throw Error('Alert center must include role, Tracking and quiet hours')
if(!layout.includes(".select('auto_tracking_enabled,quiet_start,quiet_end')"))throw Error('Quiet hours not read from Supabase')
if(!layout.includes(".from('tracking_runtime_settings')"))throw Error('Tracking state not read from Supabase')
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
if(!api.includes("get_notification_feed")||!api.includes('get_in_app_alerts'))throw Error('Missing merged notification feed or legacy fallback')
const ui=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
if(!ui.includes("import {isTrackingQuietNow,msToQuietBoundary,NOTIFICATION_POLL_MS}")||
   !ui.includes('notificationsEnabled===true&&trackingEnabled===true')){
 throw Error('5-minute polling, quiet hours or Tracking gate missing')
}
if(!ui.includes("msToQuietBoundary(at,'end',start,end)")||
   !ui.includes("msToQuietBoundary(at,'start',start,end)")){
 throw Error('Quiet-hour pause/resume boundary scheduling missing')
}
if(!ui.includes('if(!enabledRef.current||inflight.current)return')||
   !ui.includes('currentRequest.current?.abort()')){
 throw Error('Notification disable gate/abort missing')
}
const trackingUI=fs.readFileSync('components/tracking-settings.tsx','utf8')
if(!trackingUI.includes('saveRuntimeAndNotify')||!trackingUI.includes('mynh-erp-tracking-changed')){
 throw Error('Tracking switch not synchronized with alerts')
}
console.log('Notification isolated preview config/static QA: PASS')
