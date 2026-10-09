import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {buildOrderNotices,type LegacyAlert,type TrackingOrderNotice} from '@/lib/notification-order-presentation'

const noCache={ 'Cache-Control':'private, no-store, max-age=0' }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const views=new Set(['all','unread','action'])
const categories=new Set(['all','tracking','purchase','warehouse','sales','finance','system'])

export async function GET(request:Request){
  const supabase=await createClient()
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return NextResponse.json({error:'Chưa đăng nhập'},{status:401,headers:noCache})
  const url=new URL(request.url)
  const view=url.searchParams.get('view')||'all'
  const category=url.searchParams.get('category')||'all'
  const limit=Number(url.searchParams.get('limit')??20)
  const offset=Number(url.searchParams.get('offset')??0)
  if(!views.has(view)||!categories.has(category)||!Number.isInteger(limit)||limit<1||limit>40||
    !Number.isInteger(offset)||offset<0||offset>500){
    return NextResponse.json({error:'Bộ lọc hoặc phân trang không hợp lệ'},{status:400,headers:noCache})
  }
  // Continue to use the already-deployed secure legacy RPC; migration 0068
  // must never be a prerequisite for tracking alerts to load in Preview.
  const legacy=await supabase.rpc('get_in_app_alerts',{p_limit:100})
  if(legacy.error)return NextResponse.json({error:'Không tải được cảnh báo vận chuyển'},{status:503,headers:noCache})
  const legacyRows=(legacy.data??[]) as LegacyAlert[]
  const orderCodes=[...new Set(legacyRows.flatMap(row=>row.order_codes??[]).filter(Boolean))]
  const orderResult=orderCodes.length
    ?await supabase.from('orders').select('id,shopee_order_id,receive_status')
      .in('shopee_order_id',orderCodes).is('archived_at',null)
    :{data:[],error:null}
  const tracking=buildOrderNotices(legacyRows,orderResult.error?[]:(orderResult.data??[]))

  // Migration 0068 is additive. Pull system notices only when its RPC exists.
  // Ignore its legacy tracking rows; they group by alert type rather than order.
  const newer=await supabase.rpc('get_notification_feed',{
    p_limit:40,p_offset:0,p_view:'all',p_category:'all',
  })
  type SystemNotice={id:string;source:'system';category:string;created_at:string;
    is_read:boolean;requires_action:boolean;is_resolved:boolean;[key:string]:unknown}
  const systems=(!newer.error&&Array.isArray(newer.data?.items)
    ?newer.data.items.filter((x:Record<string,unknown>)=>x.source==='system')
    :[]) as SystemNotice[]
  const combined:(TrackingOrderNotice|SystemNotice)[]=[...tracking,...systems]
  const newest=combined.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
  const relevant=newest.filter(x=>category==='all'||x.category===category)
    .filter(x=>view==='all'||(view==='unread'&&!x.is_read)||
      (view==='action'&&x.requires_action&&!x.is_resolved))
  return NextResponse.json({
    items:relevant.slice(offset,offset+limit),total:relevant.length,
    unread_total:newest.filter(x=>!x.is_read).length,
    action_total:newest.filter(x=>x.requires_action&&!x.is_resolved).length,
    migration_pending:Boolean(newer.error),
  },{headers:noCache})
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
