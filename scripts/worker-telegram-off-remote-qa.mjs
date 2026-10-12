import assert from "node:assert/strict";
import fs from "node:fs/promises";

const WORKER="erp-auto-tracking-telegramoff-qa-v1";
const PREVIEW="telegramoff-isolated-v1";
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!accountId||!token)throw new Error("Missing QA-only Cloudflare API access");
const manifest=JSON.parse(await fs.readFile("qa-worker-artifacts/manifest.json","utf8"));

const resp=await fetch("https://api.cloudflare.com/client/v4/accounts/"+accountId+
  "/workers/workers/"+WORKER+"/previews",{
  headers:{Authorization:"Bearer "+token},
  signal:AbortSignal.timeout(20000),
});
assert.equal(resp.status,200,"QA Preview directory not readable");
const json=await resp.json();
assert.equal(json.success,true,"Cloudflare rejected QA Preview listing");
const previews=Array.isArray(json.result)?json.result:
  Array.isArray(json.result?.previews)?json.result.previews:[];
const item=previews.find(p=>p.name===PREVIEW||p.slug===PREVIEW);
assert.ok(item,"Named isolated Preview not found");
const rawUrl=(item.urls||[]).find(v=>v.startsWith("https://"));
assert.ok(rawUrl,"Preview URL not advertised by Cloudflare");
const url=new URL(rawUrl);
assert.ok(url.hostname.includes(WORKER),"Expected a separate QA Worker hostname");
assert.ok(!url.hostname.includes("mynh-erp-v5"),"Must not test ERP production Worker");
assert.ok(!url.hostname.startsWith("erp-auto-tracking.mynh"),"Must not test Tracking production Worker");

// Diagnose routability without invoking any Tracking/provider endpoints.
const deploymentResponse=await fetch("https://api.cloudflare.com/client/v4/accounts/"+accountId+
  "/workers/workers/"+WORKER+"/previews/"+item.id+"/deployments",{
  headers:{Authorization:"Bearer "+token},
  signal:AbortSignal.timeout(20000),
});
assert.equal(deploymentResponse.status,200,"Cannot verify Preview deployment metadata");
const deploymentList=await deploymentResponse.json();
const versions=Array.isArray(deploymentList.result)?deploymentList.result:[];
const latest=versions[0];
assert.ok(latest,"No Preview deployment exists");
const uniqueUrl=(latest.urls||[]).find(x=>x.startsWith("https://"))||null;
assert.ok(uniqueUrl,"No version-specific Preview URL");
const diagnostic=[];
for(const candidate of [url.origin,uniqueUrl]){
  const r=await fetch(new URL("/health",candidate),{
    headers:{Accept:"application/json"},
    redirect:"manual",
    signal:AbortSignal.timeout(12000),
  });
  const body=await r.text();
  let data;
  try{data=JSON.parse(body)}catch{data=null}
  diagnostic.push({
    url:new URL(candidate).hostname,
    status:r.status,
    contentType:r.headers.get("content-type"),
    resultKeys:data?Object.keys(data).slice(0,8):[],
    errorValue:typeof data?.error==="string"?data.error.slice(0,140):null,
    cfErrorCode:data?.error_code??null,
    cfErrorName:data?.error_name??null,
    cfTitle:typeof data?.title==='string'?data.title.slice(0,100):null,
    cfDetail:typeof data?.detail==='string'?data.detail.slice(0,160):null,
    bodyTag:!data?body.slice(0,90).replace(/[^a-zA-Z0-9 _-]/g,""):null,
  });
}
console.log("CLOUDFLARE_PREVIEW_ROUTE_DIAGNOSTIC "+JSON.stringify({
  preview:item.name,
  annotation_commit:latest.annotations?.["workers/commit_sha"],
  preview_latest_deployed_on:item.deployed_on,
  diagnostics:diagnostic,
}));

async function request(path,method="GET"){
  const response=await fetch(new URL(path,url),{
    method,
    headers:{Accept:"application/json"},
    redirect:"manual",
    signal:AbortSignal.timeout(15000),
  });
  const text=await response.text();
  let parsed=null;
  try{parsed=JSON.parse(text)}catch{}
  assert.ok(parsed&&typeof parsed==="object",method+" "+path+" returned non-JSON");
  return {status:response.status,data:parsed};
}
const checks=[];
function check(label,pass,meta){
  checks.push({label,pass,meta});
  console.log((pass?"PASS ":"FAIL ")+label+" "+JSON.stringify(meta));
}

const health=await request("/health");
check("Cloudflare isolated QA health",health.status===200&&health.data.success===true,
  {status:health.status,build:health.data.build});
check("QA environment has no production credentials/bindings",
  !health.data.supabase_configured&&!health.data.service_binding_configured,
  {supabase_configured:health.data.supabase_configured,
   service_binding_configured:health.data.service_binding_configured});
check("Telegram disabled mode",
  health.data.notification_mode==="IN_APP_ONLY"&&health.data.telegram_bot_configured===false&&
  health.data.telegram_send_limit===0&&health.data.telegram_update_mode==="DISABLED",
  {notification_mode:health.data.notification_mode,telegram_send_limit:health.data.telegram_send_limit});
for(const path of [...manifest.routes_retired,"/telegram/other"]){
  for(const method of ["GET","POST"]){
    const r=await request(path,method);
    check(method+" "+path+" rejects Telegram",
      r.status===410&&r.data.success===false,{status:r.status});
  }
}
const auth=await request("/run-once","POST");
check("Manual Tracking requires existing token",auth.status===403,
  {status:auth.status});
const method=await request("/run-once","GET");
check("Manual Tracking retains POST method",method.status===405,
  {status:method.status});

const failures=checks.filter(v=>!v.pass);
await fs.writeFile("qa-worker-artifacts/remote-smoke-summary.json",
  JSON.stringify({worker:WORKER,preview:PREVIEW,url:url.origin,
   source_sha256:manifest.candidate_sha256,checked:checks.length,
   passed:checks.length-failures.length,failed:failures.length,checks},null,2)+"\n");
console.log("WORKER_CLOUDFLARE_PREVIEW_QA "+JSON.stringify({
  url:url.origin,checks:checks.length,passed:checks.length-failures.length,failed:failures.length,
  source_sha256:manifest.candidate_sha256,provider_calls:0,database_mutations:0,
}));
if(failures.length)process.exitCode=1;
