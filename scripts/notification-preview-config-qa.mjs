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
if(!layout.includes('<InAppAlertCenter role={role}/>'))throw Error('Alert center is not role-bound')
const api=fs.readFileSync('app/api/alerts/in-app/route.ts','utf8')
if(!api.includes("get_notification_feed")||!api.includes('get_in_app_alerts'))throw Error('Missing merged notification feed or legacy fallback')
const ui=fs.readFileSync('components/in-app-alert-center.tsx','utf8')
if(!ui.includes('open?300000:900000')||!ui.includes("document.visibilityState==='hidden'"))throw Error('15/5 minute Cloudflare quota rule missing')
console.log('Notification isolated preview config/static QA: PASS')
