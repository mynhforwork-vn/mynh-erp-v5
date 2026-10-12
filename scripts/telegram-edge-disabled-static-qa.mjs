import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
const path="supabase/functions/telegram-alert-dispatcher/index.ts";
const source=await fs.readFile(path,"utf8");
const tracking=await fs.readFile("supabase/functions/tracking-dispatcher/index.ts","utf8");
const checks=[
 ["Old Telegram Edge endpoint returns 410",()=>assert.match(source,/status\s*:\s*410/)],
 ["Legacy function no outbound Telegram HTTP",()=>assert.ok(!source.includes("api.telegram.org"))],
 ["No dispatch RPC, token access or alert claims",()=>assert.ok(!/claim_due_telegram_alerts|complete_telegram_alert_delivery|SUPABASE_SECRET_KEY|TELEGRAM_BOT_TOKEN|fetch\(/.test(source))],
 ["Edge response prevents caching",()=>assert.ok(source.includes('"Cache-Control":"no-store"'))],
 ["Disabled Edge returns JSON error to all callers",()=>{assert.ok(source.includes("Deno.serve(() => new Response("));assert.ok(source.includes("JSON.stringify({ok:false"))}],
 ["Tracking dispatcher is separate and still in repository",()=>{assert.ok(tracking.includes("runTracking")||tracking.includes("claim_due_shipments"));assert.ok(!source.includes("claim_due_shipments"))}],
// Execute ONLY the retired handler in a constrained Node VM; no Supabase, bot or provider connections.
 ["All HTTP methods return 410; zero outbound calls",async()=>{
  const body=source.replace(/^import\\s+"jsr:@supabase\\/functions-js\\/edge-runtime\\.d\\.ts";\\s*/,"");
  assert.notEqual(body,source,"Unknown Edge runtime import header");
  let handler=null;
  let outbound=0;
  vm.runInNewContext(body,{
    Deno:{serve(fn){handler=fn}},
    Response,JSON,
    fetch(){outbound++;throw new Error("Outbound request forbidden in Edge QA");},
  },{timeout:1000});
  assert.equal(typeof handler,"function");
  for(const method of ["GET","POST","PUT","DELETE","OPTIONS","HEAD"]){
    const response=await handler(new Request("https://unit.test/functions/v1/telegram-alert-dispatcher",{method}));
    assert.equal(response.status,410,method);
    assert.equal(response.headers.get("Cache-Control"),"no-store");
    const payload=await response.json();
    assert.equal(payload.ok,false);
    assert.match(payload.error,/ngừng sử dụng/);
  }
  assert.equal(outbound,0);
  console.log("TELEGRAM_EDGE_RUNTIME_QA "+JSON.stringify({methods:6,passed:6,outbound_calls:outbound,production_deployed:false}));
 }]

];
let failed=0;
for(const [label,test] of checks){try{await test();console.log("PASS "+label)}catch(e){failed++;console.error("FAIL "+label+" "+String(e.message||e).slice(0,180))}}
console.log("TELEGRAM_EDGE_DISABLED_PREFLIGHT "+JSON.stringify({checks:checks.length,passed:checks.length-failed,failed,deploy_performed:false,tracking_dispatcher_modified:false}));
if(failed)process.exitCode=1;
