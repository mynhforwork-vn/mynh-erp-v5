import assert from "node:assert/strict";
import fs from "node:fs/promises";

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error("Cloudflare credentials unavailable");

const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/ghn-proxy",{
 headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(20000),
});
assert.equal(response.status,200);
const multipart=await response.text();
const boundary=multipart.slice(0,multipart.indexOf("\r\n"));
const src=multipart.startsWith("--")?multipart.slice(multipart.indexOf("\r\n\r\n")+4,multipart.lastIndexOf("\r\n"+boundary)):multipart;
assert.ok(src.includes("async fetch(request, env, ctx)"));
const worker=(await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"))).default;
assert.equal(typeof worker.fetch,"function");

const originalFetch=globalThis.fetch;
const hits=[];
let fallback=false;
globalThis.fetch=async(u,opts={})=>{
  const url=String(u);
  const method=opts.method||"GET";
  assert.ok(url.startsWith("https://spx.vn/")||url.startsWith("https://fe-online-gateway.ghn.vn/"),
    "Unexpected provider URL in mock");
  const body=opts.body?JSON.parse(opts.body):null;
  hits.push({host:new URL(url).hostname,path:new URL(url).pathname,search:new URL(url).search,method,body});
  if(fallback&&method==="POST")return new Response("{}",{status:500,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({ok:true,data:{logs:[]},retcode:0}),{
    status:200,headers:{"content-type":"application/json"}});
};
const checks=[];
async function test(name,fn){
 try{await fn();checks.push({name,pass:true});console.log("PASS "+name);}
 catch(e){checks.push({name,pass:false,error:String(e.message||e).slice(0,160)});console.error("FAIL "+name+" "+String(e.message||e))}
}
async function invoke(payload){
  const req=new Request("https://qa.invalid/",{
   method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const r=await worker.fetch(req,{},{});return {status:r.status,data:await r.json()};
}
try{
 await test("SPX missing waybill returns 400 without network",async()=>{
   const count=hits.length,r=await invoke({carrier:"SPX"});assert.equal(r.status,400);assert.equal(hits.length,count);
 });
 await test("GHN missing order_code returns 400 without network",async()=>{
   const count=hits.length,r=await invoke({carrier:"GHN"});assert.equal(r.status,400);assert.equal(hits.length,count);
 });
 await test("SPX input generates public GET request but fetch is mocked",async()=>{
   const r=await invoke({carrier:"SPX",tracking_number:"QA-SPX-NOT-REAL"});
   assert.equal(r.status,200);const v=hits.at(-1);
   assert.equal(v.method,"GET");assert.equal(v.host,"spx.vn");
   assert.ok(new URLSearchParams(v.search).get("spx_tn")==="QA-SPX-NOT-REAL");
 });
 await test("GHN input generates order_code + phone_verify in POST, mocked",async()=>{
   const r=await invoke({carrier:"GHN",order_code:"QA-NO-SEND",phone_verify:"0000000000"});
   assert.equal(r.status,200);const v=hits.at(-1);
   assert.equal(v.method,"POST");assert.equal(v.host,"fe-online-gateway.ghn.vn");
   assert.equal(v.body.order_code,"QA-NO-SEND");assert.equal(v.body.phone_verify,"0000000000");
 });
 await test("GHN fallback GET uses same QA order without real provider request",async()=>{
   fallback=true;const begin=hits.length;
   const r=await invoke({carrier:"GHN",order_code:"QA-FALLBACK-ONLY",phone_verify:"0000000000"});
   assert.equal(r.status,200);assert.equal(hits.length,begin+2);
   assert.equal(hits.at(-1).method,"GET");
   assert.equal(new URLSearchParams(hits.at(-1).search).get("order_code"),"QA-FALLBACK-ONLY");
 });
 await test("GHN token header requires separate security review",async()=>{
   assert.ok(src.includes('"token": "[object Object]"'));
 });
}finally{globalThis.fetch=originalFetch}
await fs.mkdir("qa-tracking-artifacts",{recursive:true});
const out={mode:"OFFLINE_MOCKED",calls_intercepted:hits.length,real_provider_calls:0,
 tests:checks,failed:checks.filter(x=>!x.pass).length,
 risk:"GHN proxy has a hardcoded [object Object] token string: do not enable GHN until provider contract is validated"};
await fs.writeFile("qa-tracking-artifacts/ghn-proxy-mocked.json",JSON.stringify(out,null,2)+"\n");
console.log("GHN_PROXY_OFFLINE_CONTRACT "+JSON.stringify({passed:checks.filter(x=>x.pass).length,failed:out.failed,intercepted:hits.length,real_provider_calls:0}));
if(out.failed)process.exitCode=1;
