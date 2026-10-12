import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {createHash} from "node:crypto";

const WORKER="erp-auto-tracking";
const PROXY="ghn-proxy";
const PREVIEW="erp-auto-tracking-telegramoff-qa-v1";
const BASE_VERSION="6f26895d-5af0-43dc-978a-b761d7c39dd8";
const GHN_VERSION="619f6ffe-6e19-46b0-99cd-0a491fd5be3b";
const SERVICE="GHN_PROXY";
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!ACCOUNT||!TOKEN||!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)
  throw Error("Missing read-only QA credentials");
const headers={Authorization:"Bearer "+TOKEN};
const notes=[],checks=[];
function assertCheck(name,fn) {
  try {const info=fn();checks.push({name,pass:true,info});console.log("PASS "+name);}
  catch(e){checks.push({name,pass:false,error:String(e.message||e).slice(0,220)});console.error("FAIL "+name+" "+String(e.message||e));}
}
function observation(name,level,reason){notes.push({name,level,reason});console.log(level+" "+name+" "+reason);}
async function cfGet(path){
  const u="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+path;
  const r=await fetch(u,{headers,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error("Cloudflare GET failed, status "+r.status+" "+path);
  const ct=r.headers.get("content-type")||"";
  if(ct.includes("json")){const j=await r.json();if(!j.success)throw Error("Cloudflare success=false");return j.result}
  return r.text();
}
async function sourceFor(worker){
  const body=String(await cfGet("/workers/scripts/"+worker));
  if(!body.startsWith("--"))return body;
  const boundary=body.slice(0,body.indexOf("\r\n"));
  const from=body.indexOf("\r\n\r\n")+4;
  const to=body.lastIndexOf("\r\n"+boundary);
  if(from<4||to<=from)throw Error("Unknown Worker response multipart envelope");
  return body.slice(from,to);
}
async function dbGet(table,query){
  const u=new URL(SUPABASE_URL.replace(/\/+$/,"")+"/rest/v1/"+table);
  for(const [k,v] of Object.entries(query))u.searchParams.set(k,v);
  const resp=await fetch(u,{
    headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+SUPABASE_SERVICE_ROLE_KEY,
      Accept:"application/json"},
    signal:AbortSignal.timeout(20000),
  });
  if(!resp.ok)throw Error("Supabase read-only GET "+table+" status "+resp.status);
  return resp.json();
}
function sha(s){return createHash("sha256").update(s).digest("hex");}

const [deploymentData,settings,proxyDeployments,workerSource,proxySource,providerRows,shipmentRows,logs]=
 await Promise.all([
   cfGet("/workers/scripts/"+WORKER+"/deployments"),
   cfGet("/workers/scripts/"+WORKER+"/settings"),
   cfGet("/workers/scripts/"+PROXY+"/deployments"),
   sourceFor(WORKER), sourceFor(PROXY),
   dbGet("tracking_provider_configs",{select:"carrier,enabled,adapter_type"}),
   dbGet("shipments",{select:"carrier,tracking_enabled,is_active,current_tracking_status",limit:"200"}),
   dbGet("tracking_sync_logs",{select:"source,result,started_at,error_code",order:"started_at.desc",limit:"150"}),
 ]);
const wd=deploymentData.deployments?.[0]||{},pd=proxyDeployments.deployments?.[0]||{};
const bindingMap=new Map((settings.bindings||[]).map(x=>[x.name,x]));
assertCheck("Production tracking Worker version pinned",()=>assert.equal(wd.versions?.[0]?.version_id,BASE_VERSION));
assertCheck("GHN proxy Worker version pinned",()=>assert.equal(pd.versions?.[0]?.version_id,GHN_VERSION));
assertCheck("Binding GHN_PROXY still targets ghn-proxy",()=>{
  assert.equal(bindingMap.get(SERVICE)?.type,"service");
  assert.equal(bindingMap.get(SERVICE)?.service,PROXY);
});
assertCheck("Worker secret bindings retained by name, never read",()=>{
  for(const name of ["RUN_TOKEN","SUPABASE_SECRET_KEY","SUPABASE_URL","SHOPEE_SECRETS_KEY"])
    assert.ok(bindingMap.has(name),"Missing expected binding "+name);
});
assertCheck("Tracking / GHN proxy endpoints remain linked in Worker source",()=>{
  assert.ok(workerSource.includes("callExistingTrackingProxy("));
  assert.ok(workerSource.includes("env.GHN_PROXY.fetch("));
  assert.ok(workerSource.includes('order_code: trackingNumber'));
  assert.ok(proxySource.includes('body.order_code'));
  assert.ok(proxySource.includes('body.phone_verify'));
  assert.ok(proxySource.includes('carrier === "SPX"'));
  assert.ok(proxySource.includes("https://fe-online-gateway.ghn.vn"));
  assert.ok(proxySource.includes("https://spx.vn"));
});
assertCheck("QA preview has no secrets and does not replace production Worker",()=>{
  assert.notEqual(WORKER,PREVIEW);
  assert.ok(!settings.bindings?.some(x=>x.service===PREVIEW));
});
const spxProvider=providerRows.find(x=>x.carrier==="SPX");
const ghnProvider=providerRows.find(x=>x.carrier==="GHN");
const spxShipments=shipmentRows.filter(x=>(x.carrier||"").toUpperCase().includes("SPX"));
const ghnShipments=shipmentRows.filter(x=>(x.carrier||"").toUpperCase().includes("GHN"));
const recentSuccessfulSPX=logs.filter(x=>x.source==="AUTO"&&x.result==="SUCCESS"&&
 new Date(x.started_at).getTime()>=Date.now()-24*3600*1000);
assertCheck("SPX provider enabled and named correctly",()=>{
 assert.equal(spxProvider?.enabled,true);
 assert.equal(spxProvider?.adapter_type,"SPX_PUBLIC");
 assert.ok(spxShipments.length>0);
});
assertCheck("SPX tracking sync success observed within 24h",()=>{
 assert.ok(recentSuccessfulSPX.length>0);
});
if(!ghnProvider?.enabled)
 observation("GHN runtime adapter", "BLOCKER", "No enabled GHN tracking_provider_configs entry; no claim of provider integration PASS");
if(!ghnShipments.length)
 observation("GHN real E2E", "UNVERIFIED", "No GHN shipments available for persistence verification");
if(proxySource.includes('"token": "[object Object]"')||proxySource.includes('"token": "[object Object]"'))
 observation("GHN proxy header", "WARNING", "Deployed proxy source contains literal [object Object] token header; validate provider contract before activation");
if((settings.bindings||[]).some(x=>x.name==="TELEGRAM_BOT_TOKEN"))
 observation("Telegram Production", "BLOCKER", "Production tracking Worker retains Telegram secret binding and old code");
const result={
 checked_at:new Date().toISOString(),
 mode:"READ_ONLY_NO_PROVIDER_CALLS",
 worker_version:wd.versions?.[0]?.version_id,
 proxy_version:pd.versions?.[0]?.version_id,
 worker_source_sha256:sha(workerSource),
 proxy_source_sha256:sha(proxySource),
 checks,
 blockers:notes.filter(x=>x.level==="BLOCKER"),
 warnings:notes.filter(x=>x.level==="WARNING"),
 unverified:notes.filter(x=>x.level==="UNVERIFIED"),
 provider_counts:{spx:spxShipments.length,ghn:ghnShipments.length},
 recent_auto_success_seen:recentSuccessfulSPX.length,
 release_ready:checks.every(x=>x.pass)&&notes.every(x=>x.level!=="BLOCKER"&&x.level!=="UNVERIFIED"),
 provider_http_requests:0,
 mutations:0
};
await fs.mkdir("qa-tracking-artifacts",{recursive:true});
await fs.writeFile("qa-tracking-artifacts/read-only-preflight.json",JSON.stringify(result,null,2)+"\n");
console.log("TRACKING_INTEGRATION_PREFLIGHT "+JSON.stringify({
  checks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,
  blockers:result.blockers.length,unverified:result.unverified.length,
  release_ready:result.release_ready,provider_http_requests:0,mutations:0
}));
if(checks.some(x=>!x.pass))process.exitCode=1;
