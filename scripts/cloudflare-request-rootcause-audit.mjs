/**
 * Read-only Cloudflare Workers request audit.
 * Prints only aggregate counts and permission flags.
 * Never prints tokens, cookies, IPs, query strings, usernames or raw request URLs.
 */
const token=process.env.CLOUDFLARE_API_TOKEN
const account=process.env.CLOUDFLARE_ACCOUNT_ID
if(!token||!account){console.log('AUDIT_BLOCKED: credentials missing');process.exit(0)}
const root='https://api.cloudflare.com/client/v4'
const headers={authorization:'Bearer '+token,'content-type':'application/json'}
const query='query($accountTag:string,$start:string,$end:string){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){dimensions{scriptName} sum{requests errors subrequests}}}}}'
async function graph(source,variables){
  const r=await fetch(root+'/graphql',{method:'POST',headers,body:JSON.stringify({query:source,variables})})
  const data=await r.json()
  return {status:r.status,result:data.data,errors:(data.errors||[]).map(e=>String(e.message||'GraphQL error').slice(0,120))}
}
function counts(resp){
  const groups=resp.result?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
  if(!Array.isArray(groups))return null
  const map={}
  for(const g of groups){
    const name=g.dimensions?.scriptName||'(unassigned)'
    const old=map[name]||{requests:0,errors:0,subrequests:0}
    for(const field of ['requests','errors','subrequests'])old[field]+=Number(g.sum?.[field]||0)
    map[name]=old
  }
  return map
}
const targets=['mynh-erp-v5','erp-auto-tracking','mynh-erp','ghn-proxy','mynh-erp-notify-v1']
const now=Date.now()
const utcStart=Math.floor(now/86400000)*86400000
const windows=[
  {label:'previous_utc_day',start:utcStart-86400000,end:utcStart},
  {label:'today_utc_so_far',start:utcStart,end:now},
]
for(const p of windows){
  const answer=await graph(query,{accountTag:account,start:new Date(p.start).toISOString(),end:new Date(p.end).toISOString()})
  const data=counts(answer)
  console.log('DAILY '+JSON.stringify({period:p.label,from:new Date(p.start).toISOString(),to:new Date(p.end).toISOString(),
    available:!!data,http:answer.status,errors:answer.errors.length?answer.errors.map(()=> 'QUERY_ERROR'):[],
    workers:targets.map(name=>({name,...(data?.[name]||{requests:0,errors:0,subrequests:0})})),
    total_requests:data?Object.values(data).reduce((sum,row)=>sum+row.requests,0):null}))
}
const hours=[]
// GraphQL analytics requests do not invoke the Worker.
const lastHour=Math.floor(now/3600000)*3600000
for(let i=36;i>0;i--){
  const start=lastHour-i*3600000
  const end=start+3600000
  const result=await graph(query,{accountTag:account,start:new Date(start).toISOString(),end:new Date(end).toISOString()})
  const data=counts(result)
  if(!data){console.log('HOURLY_UNAVAILABLE '+JSON.stringify({hour:new Date(start).toISOString(),http:result.status}));break}
  const production=data['mynh-erp-v5']||{requests:0,errors:0,subrequests:0}
  hours.push({hour:new Date(start).toISOString(),requests:production.requests,errors:production.errors,subrequests:production.subrequests})
}
const top=[...hours].sort((a,b)=>b.requests-a.requests).slice(0,10)
console.log('TOP_HOURLY '+JSON.stringify({hours_examined:hours.length,top10:top,
  hours_over_5000:hours.filter(x=>x.requests>5000).length,
  hours_over_10000:hours.filter(x=>x.requests>10000).length}))
for(const typeName of ['WorkersInvocationsAdaptiveDimensions','WorkersInvocationsAdaptiveSum']){
  const g=await graph('query($name:String!){__type(name:$name){name fields{name}}}',{name:typeName})
  const fields=(g.result?.__type?.fields||[]).map(x=>x.name)
  console.log('ANALYTICS_SCHEMA '+JSON.stringify({type:typeName,available:!!g.result?.__type,http:g.status,
    relevant_fields:fields.filter(x=>/status|source|route|country|path|method|script|request|error/i.test(x)).slice(0,30),
    errorCount:g.errors.length}))
}
try{
  const res=await fetch(root+'/accounts/'+account+'/workers/observability/telemetry/keys',
    {method:'POST',headers,body:JSON.stringify({limit:1})})
  const body=await res.json()
  console.log('OBSERVABILITY_ACCESS '+JSON.stringify({http:res.status,success:!!body.success,
    error_codes:(body.errors||[]).map(x=>x.code??'UNKNOWN').slice(0,5)}))
}catch{console.log('OBSERVABILITY_ACCESS '+JSON.stringify({network_error:true}))}
console.log('AUDIT_COMPLETE: Cloudflare unchanged; use Workers Observability to see route/status/source breakdown.')
