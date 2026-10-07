import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

type Job={
  shipment_id:string;
  order_id:string;
  tracking_number:string;
  carrier:string|null;
  current_tracking_status:string;
};

type ProviderConfig={
  carrier:string;
  enabled:boolean;
  adapter_type:"NORMALIZED_JSON"|"SPX_PUBLIC";
  endpoint_url:string;
  http_method:"GET"|"POST";
  timeout_ms:number;
  auth_header_name:string|null;
  auth_secret:string|null;
};

type NormalizedEvent={
  event_time:string;
  normalized_status?:string;
  status?:string;
  raw_status?:string|null;
  description?:string|null;
  raw_description?:string|null;
  location?:string|null;
  raw_location?:string|null;
  normalized_location?:string|null;
  destination_hub?:string|null;
  raw_status_code?:string|null;
  raw_status_name?:string|null;
  reason_code?:string|null;
  reason_description?:string|null;
  raw_payload?:unknown;
};

type RequestMode="AUTO"|"MANUAL";

type SpxRecord={
  tracking_code?:string;
  tracking_name?:string;
  description?:string;
  actual_time?:number;
  reason_code?:string;
  reason_desc?:string;
  current_location?:{location_name?:string};
  next_location?:{location_name?:string};
  milestone_code?:number;
  milestone_name?:string;
};

const ALLOWED_STATUSES=new Set([
  "READY_TO_SHIP","PICKUP_FAILED","PICKED_UP","IN_TRANSIT","ARRIVED_TRANSIT_HUB",
  "ARRIVED_DESTINATION_HUB","OUT_FOR_DELIVERY","DELIVERY_FAILED","DELIVERED",
  "CANCELLED","RETURNING","RETURNED","UNKNOWN"
]);

const supabaseUrl=Deno.env.get("SUPABASE_URL");
const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!supabaseUrl||!serviceRoleKey)throw new Error("Missing Supabase runtime variables");

const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}});
}

function normalizeKey(value:string|null|undefined){
  return String(value??"").trim().toLocaleLowerCase("vi-VN");
}

async function sha256(input:string){
  const bytes=new TextEncoder().encode(input);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function safeProviderUrl(raw:string){
  const url=new URL(raw);
  if(url.protocol!=="https:")throw new Error("Provider endpoint must use HTTPS");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith(".local")){
    throw new Error("Local provider endpoints are not allowed");
  }
  return url;
}

async function authorize(req:Request):Promise<RequestMode|null>{
  const supplied=req.headers.get("x-cron-secret")??"";
  if(supplied){
    const{data,error}=await db.rpc("verify_tracking_cron_secret",{p_secret:supplied});
    if(!error&&data===true)return"AUTO";
  }
  const auth=req.headers.get("authorization")??"";
  if(auth.toLowerCase().startsWith("bearer ")){
    const token=auth.slice(7).trim();
    const{data,error}=await db.auth.getUser(token);
    const role=data.user?.app_metadata?.role;
    if(!error&&data.user&&(role==="admin"||role==="operator"))return"MANUAL";
  }
  return null;
}

async function loadProvider(carrier:string){
  const{data,error}=await db.rpc("get_tracking_provider_runtime_config",{p_carrier:carrier}).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error(`Provider adapter is not configured for ${carrier}`);
  return data as ProviderConfig;
}

function fallbackStatus(name:string){
  const v=name.toLowerCase();
  if(/pickup done|picked up|pickup success/.test(v))return"PICKED_UP";
  if(v.includes("unsuccessful pickup"))return"PICKUP_FAILED";
  if(v.includes("out for delivery"))return"OUT_FOR_DELIVERY";
  if(v.includes("delivery attempt failed"))return"DELIVERY_FAILED";
  if(v==="delivered")return"DELIVERED";
  if(v.includes("returned to sender"))return"RETURNED";
  return"UNKNOWN";
}

async function fetchSpx(config:ProviderConfig,job:Job):Promise<NormalizedEvent[]>{
  const url=safeProviderUrl(config.endpoint_url||"https://spx.vn/shipment/order/open/order/get_order_info");
  url.searchParams.set("spx_tn",job.tracking_number);
  url.searchParams.set("language_code","vi");

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Math.min(Math.max(config.timeout_ms??10000,1000),30000));

  try{
    const response=await fetch(url,{
      method:"GET",
      headers:{
        accept:"application/json, text/plain, */*",
        cookie:"spx_token=0; spx_sid=0; login_status=true; nss_sys_type=true; nss_cid=VN",
        referer:"https://spx.vn/track",
        "user-agent":"Mozilla/5.0 MYNH-ERP-Tracking/1.0",
      },
      signal:controller.signal,
    });
    if(!response.ok)throw new Error(`SPX HTTP ${response.status}`);

    const payload=await response.json();
    if(Number(payload?.retcode??-1)!==0)throw new Error(`SPX retcode ${payload?.retcode??"unknown"}`);
    const records=payload?.data?.sls_tracking_info?.records;
    if(!Array.isArray(records))throw new Error("SPX payload does not contain tracking records");

    const[{data:mappings,error:mappingError},{data:hubs,error:hubError}]=await Promise.all([
      db.from("carrier_status_mappings")
        .select("raw_code,canonical_status")
        .eq("carrier","SPX")
        .eq("is_active",true),
      db.from("destination_hub_configs")
        .select("hub_code,tracking_location_aliases")
        .eq("is_active",true)
        .eq("carrier_code","SPX"),
    ]);
    if(mappingError)throw mappingError;
    if(hubError)throw hubError;

    const map=new Map((mappings??[]).map((x:any)=>[String(x.raw_code).toUpperCase(),String(x.canonical_status).toUpperCase()]));
    const hubMap=new Map<string,string>();
    for(const hub of hubs??[]){
      const canonical=String((hub as any).hub_code??"").trim();
      if(!canonical)continue;
      hubMap.set(normalizeKey(canonical),canonical);
      for(const alias of ((hub as any).tracking_location_aliases??[]) as string[]){
        if(String(alias??"").trim())hubMap.set(normalizeKey(alias),canonical);
      }
    }

    return (records as SpxRecord[]).map(record=>{
      const rawCode=String(record.tracking_code??"").trim().toUpperCase();
      const rawName=String(record.tracking_name??"").trim();
      const rawLocation=String(record.current_location?.location_name??"").trim();
      let status=map.get(rawCode)??fallbackStatus(rawName);
      let destinationHub:string|null=null;

      if(rawCode==="F599"){
        const matched=hubMap.get(normalizeKey(rawLocation));
        if(matched){
          status="ARRIVED_DESTINATION_HUB";
          destinationHub=matched;
        }else{
          status="ARRIVED_TRANSIT_HUB";
        }
      }

      if(!ALLOWED_STATUSES.has(status))status="UNKNOWN";
      const unix=Number(record.actual_time??0);
      if(!Number.isFinite(unix)||unix<=0)throw new Error(`SPX invalid actual_time for ${rawCode||rawName||"event"}`);

      return{
        event_time:new Date(unix*1000).toISOString(),
        normalized_status:status,
        raw_status:rawName||rawCode||status,
        raw_description:record.description??null,
        raw_location:rawLocation||null,
        normalized_location:rawLocation||null,
        destination_hub:destinationHub,
        raw_status_code:rawCode||null,
        raw_status_name:rawName||null,
        reason_code:record.reason_code??null,
        reason_description:record.reason_desc??null,
        raw_payload:record,
      } satisfies NormalizedEvent;
    });
  }finally{
    clearTimeout(timeout);
  }
}

async function fetchNormalizedJson(config:ProviderConfig,job:Job):Promise<NormalizedEvent[]>{
  const url=safeProviderUrl(config.endpoint_url);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Math.min(Math.max(config.timeout_ms??8000,1000),30000));
  try{
    const headers:Record<string,string>={};
    if(config.auth_header_name&&config.auth_secret)headers[config.auth_header_name]=config.auth_secret;
    let response:Response;
    if(config.http_method==="POST"){
      headers["content-type"]="application/json";
      response=await fetch(url,{
        method:"POST",headers,
        body:JSON.stringify({tracking_number:job.tracking_number,carrier:job.carrier}),
        signal:controller.signal,
      });
    }else{
      url.searchParams.set("tracking_number",job.tracking_number);
      if(job.carrier)url.searchParams.set("carrier",job.carrier);
      response=await fetch(url,{headers,signal:controller.signal});
    }
    if(!response.ok)throw new Error(`Provider HTTP ${response.status}`);
    const payload=await response.json();
    const events=Array.isArray(payload)?payload:payload?.events;
    if(!Array.isArray(events))throw new Error("Provider payload must contain an events array");
    return events;
  }finally{
    clearTimeout(timeout);
  }
}

async function fetchProvider(config:ProviderConfig,job:Job){
  if(config.adapter_type==="SPX_PUBLIC")return fetchSpx(config,job);
  return fetchNormalizedJson(config,job);
}

async function processJob(job:Job,syncSource:RequestMode){
  const startedAt=new Date().toISOString();
  const{data:logRow,error:logError}=await db.from("tracking_sync_logs")
    .insert({shipment_id:job.shipment_id,source:syncSource,started_at:startedAt})
    .select("id").single();
  if(logError)throw logError;

  try{
    if(!job.carrier)throw new Error("Shipment carrier is missing");
    const config=await loadProvider(job.carrier);
    const events=(await fetchProvider(config,job))
      .slice()
      .sort((a,b)=>new Date(a.event_time).getTime()-new Date(b.event_time).getTime());

    if(events.length===0){
      const{error}=await db.rpc("complete_tracking_no_change",{p_shipment_id:job.shipment_id});
      if(error)throw error;
    }else{
      for(const event of events){
        const status=String(event.normalized_status??event.status??"UNKNOWN").toUpperCase();
        if(!ALLOWED_STATUSES.has(status))throw new Error(`Unsupported normalized status: ${status}`);
        if(!event.event_time||Number.isNaN(new Date(event.event_time).getTime()))throw new Error("Invalid event_time");

        const rawStatus=event.raw_status??event.status??event.raw_status_name??event.raw_status_code??status;
        const rawLocation=event.raw_location??event.location??null;
        const fingerprint=await sha256([
          job.tracking_number,event.event_time,event.raw_status_code??"",rawStatus??"",rawLocation??"",status
        ].join("|"));

        const{error}=await db.rpc("apply_tracking_event_v2",{
          p_shipment_id:job.shipment_id,
          p_event_time:event.event_time,
          p_raw_status:rawStatus,
          p_raw_description:event.raw_description??event.description??null,
          p_raw_location:rawLocation,
          p_normalized_status:status,
          p_normalized_location:event.normalized_location??event.location??null,
          p_destination_hub:event.destination_hub??null,
          p_source:"CARRIER",
          p_fingerprint:fingerprint,
          p_raw_status_code:event.raw_status_code??null,
          p_raw_status_name:event.raw_status_name??null,
          p_reason_code:event.reason_code??null,
          p_reason_description:event.reason_description??null,
          p_raw_payload:event.raw_payload??null,
        });
        if(error)throw error;
      }
    }

    await db.from("tracking_sync_logs").update({
      completed_at:new Date().toISOString(),result:"SUCCESS",new_event_count:events.length
    }).eq("id",logRow.id);
    return{shipment_id:job.shipment_id,ok:true,event_count:events.length};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.rpc("mark_tracking_failure",{
      p_shipment_id:job.shipment_id,
      p_error_code:"TRACKING_PROVIDER_ERROR",
      p_error_message:message,
    });
    await db.from("tracking_sync_logs").update({
      completed_at:new Date().toISOString(),result:"FAILED",
      error_code:"TRACKING_PROVIDER_ERROR",error_message:message.slice(0,1000),
    }).eq("id",logRow.id);
    return{shipment_id:job.shipment_id,ok:false,error:message};
  }
}

async function isQuietHours(){
  const{data}=await db.from("tracking_runtime_settings")
    .select("auto_tracking_enabled,quiet_start,quiet_end")
    .eq("id","main").maybeSingle();
  if(data?.auto_tracking_enabled===false)return{quiet:false,disabled:true};
  const now=new Date();
  const local=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).format(now);
  const start=String(data?.quiet_start??"02:00:00").slice(0,5);
  const end=String(data?.quiet_end??"06:00:00").slice(0,5);
  return{quiet:local>=start&&local<end,disabled:false};
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const mode=await authorize(req);
  if(!mode)return json({error:"Unauthorized"},401);

  let body:{limit?:number;shipment_id?:string;test_tracking_number?:string;carrier?:string}={};
  try{body=await req.json()}catch{}

  // Non-mutating provider probe for authenticated Admin/Operator or trusted cron callers.
  if(body.test_tracking_number){
    const carrier=String(body.carrier??"SPX").trim()||"SPX";
    try{
      const config=await loadProvider(carrier);
      const events=await fetchProvider(config,{
        shipment_id:"",order_id:"",tracking_number:String(body.test_tracking_number).trim(),
        carrier,current_tracking_status:"UNKNOWN",
      });
      const latest=events.slice().sort((a,b)=>new Date(b.event_time).getTime()-new Date(a.event_time).getTime())[0]??null;
      return json({
        ok:true,test:true,carrier,event_count:events.length,
        latest_status:latest?.normalized_status??"UNKNOWN",
        latest_raw_code:latest?.raw_status_code??null,
        latest_description:latest?.raw_description??null,
        destination_hub:latest?.destination_hub??null,
      });
    }catch(error){
      return json({ok:false,test:true,error:error instanceof Error?error.message:String(error)},502);
    }
  }

  if(mode==="MANUAL"){
    if(!body.shipment_id)return json({error:"shipment_id is required for manual sync"},400);
    const{data:jobs,error}=await db.rpc("claim_manual_shipment",{p_shipment_id:body.shipment_id});
    if(error)return json({error:error.message},409);
    if(!jobs?.length)return json({error:"Shipment is not available for manual sync"},409);
    const result=await processJob((jobs as Job[])[0],"MANUAL");
    return json({ok:result.ok,manual:true,result},result.ok?200:502);
  }

  const quiet=await isQuietHours();
  if(quiet.disabled)return json({ok:true,auto_tracking_enabled:false,claimed:0,results:[]});
  if(quiet.quiet)return json({ok:true,quiet_hours:true,claimed:0,results:[]});

  const limit=Math.min(Math.max(Number(body.limit??30),1),50);
  const{data:jobs,error:claimError}=await db.rpc("claim_due_shipments",{p_limit:limit});
  if(claimError)return json({error:claimError.message},500);
  if(!jobs?.length)return json({ok:true,quiet_hours:false,claimed:0,results:[]});

  const results:unknown[]=[];
  const concurrency=5;
  for(let i=0;i<jobs.length;i+=concurrency){
    const chunk=(jobs as Job[]).slice(i,i+concurrency);
    results.push(...await Promise.all(chunk.map(job=>processJob(job,"AUTO"))));
  }
  return json({ok:true,quiet_hours:false,claimed:jobs.length,results});
});
