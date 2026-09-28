import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function POST(req:Request){
  const supabase=await createClient(); const {data:{user},error:userError}=await supabase.auth.getUser()
  if(userError||!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const role=String(user.app_metadata?.role??'viewer'); if(!['admin','operator'].includes(role))return NextResponse.json({error:'Bạn không có quyền đồng bộ vận chuyển thủ công'},{status:403})
  const body=await req.json().catch(()=>({})); if(!body.shipment_id)return NextResponse.json({error:'shipment_id is required'},{status:400})
  const {data:{session}}=await supabase.auth.getSession(); if(!session?.access_token)return NextResponse.json({error:'Session unavailable'},{status:401})
  const url=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tracking-dispatcher`
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},body:JSON.stringify({shipment_id:body.shipment_id}),cache:'no-store'})
  const data=await response.json().catch(()=>({error:'Invalid tracking response'})); return NextResponse.json(data,{status:response.status})
}
