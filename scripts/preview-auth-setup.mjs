import fs from 'node:fs'

const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing Supabase QA environment')

async function post(path,body,token=SUPABASE_KEY){
  const res=await fetch(SUPABASE_URL+path,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'apikey':SUPABASE_KEY,
      'authorization':'Bearer '+token,
    },
    body:JSON.stringify(body),
  })
  const text=await res.text()
  let json={}; try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,json,text}
}
async function getUser(token){
  const res=await fetch(SUPABASE_URL+'/auth/v1/user',{
    headers:{'apikey':SUPABASE_KEY,'authorization':'Bearer '+token},
  })
  const text=await res.text()
  let json={}; try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,json,text}
}

const signup=await post('/auth/v1/signup',{data:{purpose:'cloudflare-preview-ui-qa'}})
if(!signup.ok){
  console.log('QA_ANON_UNAVAILABLE status='+signup.status+' body='+signup.text.slice(0,400))
  process.exit(2)
}
const user=signup.json?.user??signup.json
const access=signup.json?.access_token
const refresh=signup.json?.refresh_token
const id=user?.id
if(!id||!access||!refresh){
  console.log('QA_ANON_UNAVAILABLE status=200 body_shape='+JSON.stringify(Object.keys(signup.json||{})))
  process.exit(2)
}

console.log('QA_ANON_CREATED id='+id)
console.log('QA_ANON_WAITING_FOR_OPERATOR_ROLE')

let currentAccess=access
let currentRefresh=refresh
let ready=false
for(let i=0;i<48;i++){
  const u=await getUser(currentAccess)
  const role=u.json?.app_metadata?.role
  if(role==='operator'||role==='admin'){
    const refreshed=await post('/auth/v1/token?grant_type=refresh_token',{refresh_token:currentRefresh})
    if(refreshed.ok&&refreshed.json?.access_token){
      currentAccess=refreshed.json.access_token
      currentRefresh=refreshed.json.refresh_token??currentRefresh
      const verified=await getUser(currentAccess)
      const refreshedRole=verified.json?.app_metadata?.role
      if(refreshedRole==='operator'||refreshedRole==='admin'){
        ready=true
        console.log('QA_ANON_READY role='+refreshedRole)
        break
      }
    }
  }
  await new Promise(r=>setTimeout(r,5000))
}
if(!ready)throw new Error('QA anonymous user was not promoted to operator within 240 seconds')

fs.writeFileSync('qa-session.json',JSON.stringify({
  user_id:id,
  access_token:currentAccess,
  refresh_token:currentRefresh,
}))
console.log('QA_SESSION_WRITTEN id='+id)
