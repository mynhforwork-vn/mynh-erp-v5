import fs from 'node:fs'
import assert from 'node:assert/strict'

const read=p=>fs.readFileSync(p,'utf8')
const settings=read('app/(erp)/settings/page.tsx')
const component=read('components/tracking-notification-settings.tsx')
const actions=read('lib/actions/core.ts')
const alerts=read('app/api/alerts/in-app/route.ts')
const styles=read('app/globals.css')
const mobile=read('app/styles/notification-in-app-only.css')
const checks=[]
const check=(name,test)=>{
  try{test();checks.push({name,pass:true});console.log('PASS '+name)}
  catch(e){checks.push({name,pass:false});console.error('FAIL '+name,String(e))}
}
check('Notification settings have no Telegram UI or DB reads',()=>{
  assert.ok(settings.includes('<TrackingNotificationSettings'))
  assert.ok(settings.includes('alert_rule_configs'))
  assert.ok(!/telegram|tracking-telegram-settings/i.test(settings))
})
check('Rules preserve in-app alert and batching controls',()=>{
  assert.ok(component.includes('saveAlertRuleConfig'))
  for(const item of ['enabled','in_app_enabled','batch_window_minutes'])assert.ok(component.includes('name="'+item+'"'))
  assert.ok(!/telegram|chat.?id|bot.?token/i.test(component))
})
check('Backend never enables Telegram when saving an alert rule',()=>{
  assert.match(actions,/p_telegram_enabled:\s*false/)
  for(const action of ['saveTelegramAlertSettings','saveTelegramAlertDestination','deleteTelegramAlertDestination','testTelegramConnection'])assert.ok(!actions.includes(action),action)
  assert.ok(!actions.includes("functions.invoke('telegram-alert-dispatcher'"))
})
check('In-app notification center and API remain intact',()=>{
  assert.ok(fs.existsSync('components/in-app-alert-center.tsx'))
  assert.ok(alerts.includes("supabase.rpc('get_in_app_alerts'"))
})
check('Old Telegram UI removed, responsive in-app styles loaded',()=>{
  assert.ok(!fs.existsSync('components/tracking-telegram-settings.tsx'))
  assert.ok(styles.includes('notification-in-app-only.css'))
  assert.ok(mobile.includes('@media(max-width:1100px)'))
  assert.ok(mobile.includes('notification-rule-row-v9'))
})
check('Telegram Edge Function is a disabled compatibility endpoint',()=>{
  const source=read('supabase/functions/telegram-alert-dispatcher/index.ts')
  assert.ok(source.includes('status:410'))
  assert.ok(!source.includes('api.telegram.org'))
  assert.ok(!source.includes('sendMessage('))
  assert.ok(!source.includes('claim_due_telegram_alerts'))
})
const failed=checks.filter(x=>!x.pass)
console.log('IN_APP_ONLY_QA '+JSON.stringify({passed:checks.length-failed.length,failed:failed.length}))
if(failed.length)process.exit(1)
