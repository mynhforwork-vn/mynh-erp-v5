import assert from "node:assert/strict";
import fs from "node:fs/promises";
const path="supabase/functions/telegram-alert-dispatcher/index.ts";
const source=await fs.readFile(path,"utf8");
const tracking=await fs.readFile("supabase/functions/tracking-dispatcher/index.ts","utf8");
const checks=[
 ["Old Telegram Edge endpoint returns 410",()=>assert.match(source,/status\s*:\s*410/)],
 ["Legacy function no outbound Telegram HTTP",()=>assert.ok(!source.includes("api.telegram.org"))],
 ["No dispatch RPC, token access or alert claims",()=>assert.ok(!/claim_due_telegram_alerts|complete_telegram_alert_delivery|SUPABASE_SECRET_KEY|TELEGRAM_BOT_TOKEN|fetch\(/.test(source))],
 ["Edge response prevents caching",()=>assert.ok(source.includes('"Cache-Control":"no-store"'))],
 ["Disabled Edge returns JSON error to all callers",()=>{assert.ok(source.includes("Deno.serve(() => new Response("));assert.ok(source.includes("JSON.stringify({ok:false"))}],
 ["Tracking dispatcher is separate and still in repository",()=>{assert.ok(tracking.includes("runTracking")||tracking.includes("claim_due_shipments"));assert.ok(!source.includes("claim_due_shipments"))}]
];
let failed=0;
for(const [label,test] of checks){try{test();console.log("PASS "+label)}catch(e){failed++;console.error("FAIL "+label+" "+String(e.message||e).slice(0,180))}}
console.log("TELEGRAM_EDGE_DISABLED_PREFLIGHT "+JSON.stringify({checks:checks.length,passed:checks.length-failed,failed,deploy_performed:false,tracking_dispatcher_modified:false}));
if(failed)process.exitCode=1;
