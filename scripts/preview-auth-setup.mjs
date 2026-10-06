import fs from 'node:fs'
import crypto from 'node:crypto'

const SUPABASE_URL=process.env.SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_KEY
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL||!SUPABASE_KEY||!SERVICE_KEY)throw new Error('Missing Supabase QA environment')

async function request(path,{method='GET',body,key=SUPABASE_KEY,token=key}={}){
  const res=await fetch(SUPABASE_URL+path,{
    method,
    headers:{
      'content-type':'application/json',
      'apikey':key,
      'authorization':'Bearer '+token,
    },
    body:body===undefined?undefined:JSON.stringify(body),
  })
  const text=await res.text()
  let json={}; try{json=JSON.parse(text)}catch{}
  return {ok:res.ok,status:res.status,json,text}
}

async function cleanupOldQaUsers(){
  const list=await request('/auth/v1/admin/users?page=1&per_page=100',{key:SERVICE_KEY,token:SERVICE_KEY})
  if(!list.ok)return
  const users=Array.isArray(list.json?.users)?list.json.users:[]
  const staleBefore=Date.now()-2*60*60*1000
  for(const user of users){
    if(user?.user_metadata?.purpose!=='cloudflare-preview-ui-qa')continue
    const createdAt=Date.parse(String(user?.created_at??''))
    if(!Number.isFinite(createdAt)||createdAt>=staleBefore)continue
    await request('/auth/v1/admin/users/'+encodeURIComponent(user.id),{
      method:'DELETE',key:SERVICE_KEY,token:SERVICE_KEY,
    })
    console.log('QA_OLD_USER_REMOVED id='+user.id)
  }
}

await cleanupOldQaUsers()

const suffix=Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex')
const email='qa-preview-'+suffix+'@mynh-v5.internal'
const password='Qa!'+crypto.randomBytes(12).toString('base64url')+'9'

const created=await request('/auth/v1/admin/users',{
  method:'POST',
  key:SERVICE_KEY,
  token:SERVICE_KEY,
  body:{
    email,
    password,
    email_confirm:true,
    app_metadata:{role:'operator'},
    user_metadata:{purpose:'cloudflare-preview-ui-qa'},
  },
})
if(!created.ok)throw new Error('QA user create failed status='+created.status+' body='+created.text.slice(0,500))

const id=created.json?.id??created.json?.user?.id
if(!id)throw new Error('QA user create returned no id')
console.log('QA_USER_CREATED id='+id+' role=operator')

const login=await request('/auth/v1/token?grant_type=password',{
  method:'POST',
  body:{email,password},
})
if(!login.ok)throw new Error('QA sign-in failed status='+login.status+' body='+login.text.slice(0,500))

const access=login.json?.access_token
const refresh=login.json?.refresh_token
if(!access||!refresh)throw new Error('QA sign-in returned no session')

fs.writeFileSync('qa-session.json',JSON.stringify({
  user_id:id,
  access_token:access,
  refresh_token:refresh,
}))
console.log('QA_SESSION_WRITTEN id='+id)
