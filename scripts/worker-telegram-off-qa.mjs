import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";

const path="qa-worker-artifacts/erp-auto-tracking-telegram-off.mjs";
const manifest=JSON.parse(await fs.readFile("qa-worker-artifacts/manifest.json","utf8"));
const source=await fs.readFile(path,"utf8");
const sha256=text=>createHash("sha256").update(text).digest("hex");

const checks=[];
function check(name,fn){
  checks.push(Promise.resolve().then(fn).then(()=>{
    console.log("PASS worker: "+name);
  },e=>{console.error("FAIL worker: "+name+": "+String(e));throw e;}));
}
const assertSafety=async()=>{
  assert.equal(sha256(source),manifest.candidate_sha256);
  assert.equal(manifest.baseline_version,"6f26895d-5af0-43dc-978a-b761d7c39dd8");
  assert.ok(manifest.no_telegram_network_sink);
  assert.ok(!source.includes("https://api.telegram.org"));
  assert.ok(!source.includes("await runTelegramNotificationCycle("));
  assert.match(source,/async function runAutomationCycle\(env, triggerType\) \{\s*return runTrackingCycle\(env, triggerType\);/);
  assert.match(source,/async scheduled\(event, env, ctx\)/);
  assert.match(source,/GHN_PROXY/);
  assert.match(source,/async function callExistingTrackingProxy\(/);
  assert.match(source,/async function runTrackingCycle\(/);
  assert.match(source,/erp_apply_tracking_result/);
  assert.match(source,/url.pathname === "\/run-once"/);
  for(const path of manifest.routes_retired){
    assert.ok(!source.includes('url.pathname === "'+path+'"'),"Old endpoint still directly reachable: "+path);
  }
  console.log("PASS worker: pinned source, unchanged proxy/tracking contracts and no Telegram outbound sink");
};
await assertSafety();

let outbound=0;
const priorFetch=globalThis.fetch;
globalThis.fetch=async()=>{outbound++;throw new Error("Unexpected network call from offline QA");};
try{
  const url=pathToFileURL(process.cwd()+"/"+path);
  const module=await import(url.href);
  const worker=module.default;
  assert.equal(typeof worker.fetch,"function");
  assert.equal(typeof worker.scheduled,"function");
  const env={
    GHN_PROXY:{fetch:async()=>{throw new Error("Unexpected GHN binding call");}},
    TELEGRAM_BOT_TOKEN:"QA_DUMMY_DO_NOT_SEND",
    SUPABASE_URL:"",
    SUPABASE_SECRET_KEY:"",
    RUN_TOKEN:"QA_DUMMY",
  };
  const health=await worker.fetch(new Request("https://unit.test/health"),env);
  const data=await health.json();
  assert.equal(health.status,200);
  assert.equal(data.success,true);
  assert.equal(data.service_binding_configured,true);
  assert.equal(data.telegram_bot_configured,false);
  assert.equal(data.telegram_send_limit,0);
  assert.equal(data.notification_mode,"IN_APP_ONLY");
  assert.equal(data.telegram_update_mode,"DISABLED");
  console.log("PASS worker: Tracking/GHN health contract retained, Telegram disabled");

  const routes=[
    "/telegram/webhook",
    "/telegram/setup-webhook",
    "/telegram/webhook-info",
    "/telegram/connect-owner",
    "/telegram/send-once",
    "/telegram/anything-else",
  ];
  for(const route of routes){
    for(const method of ["GET","POST"]){
      const response=await worker.fetch(new Request("https://unit.test"+route,{method}),env);
      const payload=await response.json();
      assert.equal(response.status,410,method+" "+route);
      assert.equal(payload.success,false);
    }
    console.log("PASS worker: "+route+" GET/POST permanently retired");
  }
  const manualNoAuth=await worker.fetch(new Request("https://unit.test/run-once",{method:"POST"}),env);
  assert.equal(manualNoAuth.status,401,"Existing manual tracking auth must remain");
  const manualWrongMethod=await worker.fetch(new Request("https://unit.test/run-once"),env);
  assert.equal(manualWrongMethod.status,405,"Existing manual tracking method must remain");
  console.log("PASS worker: manual Tracking route retains authorization and HTTP method checks");
  assert.equal(outbound,0,"Unexpected outbound call in isolated smoke");
  console.log("WORKER_TELEGRAM_OFF_QA "+JSON.stringify({
    passed:11,failed:0,telegram_routes_tested:routes.length,methods_per_route:2,
    outbound_calls:outbound,tracking_entrypoints_preserved:true,production_modified:false
  }));
}finally{
  globalThis.fetch=priorFetch;
}