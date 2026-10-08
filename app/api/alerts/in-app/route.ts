import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const noCache={ 'Cache-Control':'private, no-store, max-age=0' }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const views=new Set(['all','unread','action'])
const categories=new Set(['all','tracking','purchase','warehouse','sales','finance','system'])

export async function GET(request:Request){
  const supabase=await createClient()
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return NextResponse.json({error:'Chưa đăng nhập'}, {status:401,headers:noCache})
  const url=new URL(request.url)
  const view=url.searchParams.get('view')||'all'
  const category=url.searchParams.get('category')||'all'
  const limit=Number(url.searchParams.get('limit')??20)
  const offset=Number(url.searchParams.get('offset')??0)
  if(!views.has(view)||!categories.has(category)||!Number.isInteger(limit)||limit<1||limit>40||
    !Number.isInteger(offset)||offset<0||offset>500){
    return NextResponse.json({error:'Bộ lọc hoặc phân trang không hợp lệ'}, {status:400,headers:noCache})
  }
  const {data,error}=await supabase.rpc('get_notification_feed',{
    p_limit:limit,p_offset:offset,p_view:view,p_category:category,
  })
  if(error){
    // Keep existing transportation notifications operational until the additive
    // migration is applied; no other business action relies on this new RPC.
    if(error.code==='PGRST202'||error.code==='42883'){
      const legacy=await supabase.rpc('get_in_app_alerts',{p_limit:100})
      if(legacy.error){
        return NextResponse.json({error:'Không tải được cảnh báo vận chuyển'}, {status:503,headers:noCache})
      }
      const items=(legacy.data??[]).map((r:{
        alert_ids:string[];alert_type:string;label:string;destination_hub:string;
        alert_count:number;order_codes:string[];primary_order_id:string;
        reason_summary:string|null;created_at:string;is_read:boolean
      })=>({
        id:'tracking:'+r.alert_ids.join(':'),
        source:'tracking',category:'tracking',
        severity:['PICKUP_FAILED','DELIVERY_FAILED'].includes(r.alert_type)?'critical':r.alert_type==='DELIVERED'?'info':'warning',
        title:r.label,message:[r.order_codes?.slice(0,2).join(' · '),r.destination_hub,r.reason_summary].filter(Boolean).join(' · '),
        event_type:r.alert_type,created_at:r.created_at,is_read:r.is_read,
        requires_action:false,is_resolved:false,
        legacy_ids:r.alert_ids,notification_id:null,order_id:r.primary_order_id,
        destination_hub:r.destination_hub,group_count:r.alert_count,target_path:null,
      }))
      const relevant=items.filter((x:{is_read:boolean})=>category==='all'||category==='tracking')
        .filter((x:{is_read:boolean})=>view==='all'||(view==='unread'&&!x.is_read))
      return NextResponse.json({
        items:relevant.slice(offset,offset+limit),
        total:relevant.length,unread_total:items.filter((x:{is_read:boolean})=>!x.is_read).length,action_total:0,
        migration_pending:true,
      },{headers:noCache})
    }
    return NextResponse.json({error:'Không tải được trung tâm thông báo'}, {status:503,headers:noCache})
  }
  return NextResponse.json(data??{items:[],total:0,unread_total:0,action_total:0},{headers:noCache})
}

export async function POST(request:Request){
  const supabase=await createClient()
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return NextResponse.json({error:'Chưa đăng nhập'}, {status:401,headers:noCache})
  let body:Record<string,unknown>
  try{
    const value=await request.json()
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid')
    body=value as Record<string,unknown>
  }catch{
    return NextResponse.json({error:'Nội dung yêu cầu không hợp lệ'}, {status:400,headers:noCache})
  }

  const action=typeof body.action==='string'?body.action:body.all===true?'read_all':'read'
  let error:{message:string;code?:string}|null=null
  if(action==='read_all'){
    // Keep separate legacy tracking read states intact.
    const legacy=await supabase.rpc('mark_all_in_app_alerts_read')
    const newer=await supabase.rpc('mark_all_system_notifications_read')
    error=legacy.error||(newer.error?.code==='PGRST202'?null:newer.error)
  }else if(action==='read'&&(body.source==='tracking'||Array.isArray(body.alert_ids))){
    const ids=body.alert_ids
    if(!Array.isArray(ids)||ids.length<1||ids.length>100||ids.some(x=>typeof x!=='string'||!uuid.test(x))){
      return NextResponse.json({error:'Mã cảnh báo không hợp lệ'}, {status:400,headers:noCache})
    }
    const response=await supabase.rpc('mark_in_app_alerts_read',{p_alert_ids:ids})
    error=response.error
  }else if(['read','resolve'].includes(action)&&body.source==='system'){
    const id=body.notification_id
    if(typeof id!=='string'||!uuid.test(id)){
      return NextResponse.json({error:'Thông báo không hợp lệ'}, {status:400,headers:noCache})
    }
    const response=await supabase.rpc(action==='read'?'mark_system_notification_read':'resolve_system_notification',{p_id:id})
    error=response.error
  }else{
    return NextResponse.json({error:'Thao tác không hợp lệ'}, {status:400,headers:noCache})
  }
  if(error)return NextResponse.json({error:'Không cập nhật được thông báo. Vui lòng thử lại.'}, {status:error.code==='42501'?403:503,headers:noCache})
  return NextResponse.json({ok:true},{headers:noCache})
}
