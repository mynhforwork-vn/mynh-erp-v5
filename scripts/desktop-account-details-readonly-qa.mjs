/**
 * Read-only, authenticated regression for MYNH ERP desktop account editor.
 * QA auth identity is temporary and deleted by workflow cleanup.
 * Never outputs sensitive account data or user session tokens.
 */
import fs from 'node:fs'
import {createBrowserClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'

const base=process.env.PREVIEW_URL
const supabaseUrl=process.env.SUPABASE_URL
const publishable=process.env.SUPABASE_KEY
const qa=JSON.parse(fs.readFileSync('qa-session.json','utf8'))
if(!base||!supabaseUrl||!publishable||!qa.access_token||!qa.refresh_token)throw Error('Missing read-only QA session')

const client=createClient(supabaseUrl,publishable,{auth:{persistSession:false,autoRefreshToken:false}})
const {data:auth,error:sessionError}=await client.auth.setSession({
  access_token:qa.access_token,refresh_token:qa.refresh_token
})
if(sessionError||!auth.session)throw Error('Cannot initialize QA auth session')

const {data:users,error:usersError}=await client.from('erp_users')
  .select('id,created_at,archived_at').eq('platform','SHOPEE')
  .order('created_at',{ascending:false}).limit(3)
if(usersError||!users?.length)throw Error('Cannot read account IDs for authorized QA')
console.log('ACCOUNT_DATA_READ '+JSON.stringify({available:users.length,selected_created_at:users[0]?.created_at,latest_is_archived:Boolean(users[0]?.archived_at)}))

const cookieMap=new Map()
const cookieClient=createBrowserClient(supabaseUrl,publishable,{cookies:{
  getAll(){return [...cookieMap.values()].map(x=>({name:x.name,value:x.value}))},
  setAll(items){for(const item of items)cookieMap.set(item.name,item)},
}})
const {error:cookieError}=await cookieClient.auth.setSession({
  access_token:auth.session.access_token,refresh_token:auth.session.refresh_token
})
if(cookieError||!cookieMap.size)throw Error('Unable to format Supabase SSR cookies')
const cookie=[...cookieMap.values()].map(x=>x.name+'='+encodeURIComponent(x.value)).join('; ')
const links=[
  {name:'list',path:'/purchase/accounts?range=all'},
  {name:'create_panel',path:'/purchase/accounts?range=all&mode=create'},
  {name:'newest_detail',expectPanel:!users[0].archived_at,path:'/purchase/accounts?range=all&user='+encodeURIComponent(users[0].id)+'&tab=info'},
  {name:'newest_archived_detail',expectPanel:Boolean(users[0].archived_at),path:'/purchase/accounts?range=all&archive=archived&user='+encodeURIComponent(users[0].id)+'&tab=info'},
  {name:'newest_edit',expectPanel:!users[0].archived_at,path:'/purchase/accounts?range=all&user='+encodeURIComponent(users[0].id)+'&mode=edit'},
  ...(users[1]?[{name:'previous_detail',path:'/purchase/accounts?range=all&user='+encodeURIComponent(users[1].id)+'&tab=info'}]:[]),
]
let failed=false
for(const {name,path,expectPanel} of links){
  try{
    const r=await fetch(base+path,{headers:{cookie,accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(25000)})
    const body=await r.text()
    const digest=body.match(/(?:digest|ERROR)[^0-9]{0,50}([0-9]{8,12})/i)?.[1]??null
    const errorPage=/This page couldn.t load|A server error occurred|Application error: a server-side|Internal Server Error/i.test(body)
    const hasAccountPanel=body.includes('CHI TIẾT USER')||body.includes('TÀI KHOẢN MUA HÀNG')&&body.includes('Lưu thay đổi')
    const hasCreatePanel=body.includes('Thêm tài khoản')
    const pass=r.status===200&&!errorPage&&(expectPanel!==true||hasAccountPanel)
    console.log('ACCOUNT_ROUTE '+JSON.stringify({name,status:r.status,pass,digest,hasAccountPanel,hasCreatePanel,
      redirect:r.status>=300&&r.status<400,htmlBytes:body.length}))
    if(!pass)failed=true
  }catch(e){
    console.log('ACCOUNT_ROUTE '+JSON.stringify({name,pass:false,errorType:e?.name||'FetchError'}))
    failed=true
  }
}
if(failed)process.exitCode=1
