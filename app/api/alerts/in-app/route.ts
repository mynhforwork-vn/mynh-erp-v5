import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(){
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})

  const {data,error}=await supabase.rpc('get_in_app_alerts',{p_limit:40})
  if(error)return NextResponse.json({error:error.message},{status:500})

  return NextResponse.json(
    {alerts:data??[]},
    {headers:{'Cache-Control':'no-store, max-age=0'}}
  )
}

export async function POST(request:Request){
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})

  let body:{alert_ids?:string[];all?:boolean}={}
  try{body=await request.json()}catch{}

  const result=body.all
    ? await supabase.rpc('mark_all_in_app_alerts_read')
    : await supabase.rpc('mark_in_app_alerts_read',{
        p_alert_ids:Array.isArray(body.alert_ids)?body.alert_ids:[],
      })

  if(result.error)return NextResponse.json({error:result.error.message},{status:500})
  return NextResponse.json({ok:true})
}
