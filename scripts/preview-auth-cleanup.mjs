import fs from 'node:fs'

const SUPABASE_URL=process.env.SUPABASE_URL
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL||!SERVICE_KEY){
  console.log('QA_CLEANUP_SKIPPED missing environment')
  process.exit(0)
}

async function del(id){
  const res=await fetch(SUPABASE_URL+'/auth/v1/admin/users/'+encodeURIComponent(id),{
    method:'DELETE',
    headers:{'apikey':SERVICE_KEY,'authorization':'Bearer '+SERVICE_KEY},
  })
  const body=await res.text()
  console.log('QA_CLEANUP '+id+' status='+res.status+(res.ok?'':' body='+body.slice(0,300)))
}

let session=null
try{session=JSON.parse(fs.readFileSync('qa-session.json','utf8'))}catch{}
if(session?.user_id)await del(session.user_id)

const list=await fetch(SUPABASE_URL+'/auth/v1/admin/users?page=1&per_page=100',{
  headers:{'apikey':SERVICE_KEY,'authorization':'Bearer '+SERVICE_KEY},
})
if(list.ok){
  const json=await list.json()
  const staleBefore=Date.now()-2*60*60*1000
  for(const user of (json?.users??[])){
    if(user?.id===session?.user_id)continue
    if(user?.user_metadata?.purpose!=='cloudflare-preview-ui-qa')continue
    const createdAt=Date.parse(String(user?.created_at??''))
    if(!Number.isFinite(createdAt)||createdAt>=staleBefore)continue
    await del(user.id)
  }
}
