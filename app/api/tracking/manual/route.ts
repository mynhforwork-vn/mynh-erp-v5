import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { trackingNumberMeansCancelled } from '@/lib/purchase-order-cancellation'

function apiError(message:string,status=500,detail?:string){
  return NextResponse.json({error:message,detail:detail??null},{status})
}

export async function POST(req:Request){
  try{
    const supabase=await createClient()
    const {data:{user},error:userError}=await supabase.auth.getUser()
    if(userError||!user)return apiError('Unauthorized',401)

    const role=String(user.app_metadata?.role??'viewer')
    if(!['admin','operator'].includes(role)){
      return apiError('Bạn không có quyền đồng bộ vận chuyển thủ công',403)
    }

    const body=await req.json().catch(()=>({}))
    if(!body.shipment_id)return apiError('shipment_id is required',400)

    const {data:shipment,error:shipmentError}=await supabase
      .from('shipments')
      .select('id,tracking_number,current_tracking_status,orders(archived_at,order_status)')
      .eq('id',body.shipment_id)
      .maybeSingle()

    if(shipmentError)return apiError(shipmentError.message,400)
    if(!shipment)return apiError('Không tìm thấy vận đơn',404)
    if((shipment.orders as any)?.archived_at){
      return apiError('Đơn đã lưu trữ nên không thể đồng bộ Tracking',409)
    }
    const orderStatus=String((shipment.orders as any)?.order_status??'').toUpperCase()
    if(trackingNumberMeansCancelled(shipment.tracking_number)
       ||['CANCELLED','CANCELED'].includes(orderStatus)
       ||shipment.current_tracking_status==='CANCELLED'){
      return apiError('Đơn đã huỷ hoặc mã vận đơn KHÔNG CÓ, không cần đồng bộ Tracking',409)
    }

    const {data:{session}}=await supabase.auth.getSession()
    if(!session?.access_token)return apiError('Session unavailable',401)

    const url=`${SUPABASE_URL}/functions/v1/tracking-dispatcher`
    let response:Response
    try{
      response=await fetch(url,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'authorization':`Bearer ${session.access_token}`,
        },
        body:JSON.stringify({shipment_id:body.shipment_id}),
        cache:'no-store',
      })
    }catch(error){
      return apiError(
        'Không thể kết nối dịch vụ Tracking',
        502,
        error instanceof Error?error.message:String(error),
      )
    }

    const raw=await response.text()
    let data:any={}
    if(raw){
      try{data=JSON.parse(raw)}
      catch{
        data={error:'Dịch vụ Tracking trả về dữ liệu không hợp lệ',detail:raw.slice(0,300)}
      }
    }

    if(!response.ok){
      const message=String(data?.error??'Đồng bộ vận chuyển thất bại')
      const friendly=response.status===409
        ? 'Vận đơn đang được hệ thống xử lý hoặc đã kết thúc. Hãy tải lại trạng thái.'
        : message
      return apiError(friendly,response.status,message)
    }

    // Read the latest persisted shipment, not the entire Tracking page.
    const {data:updated}=await supabase.from('shipments')
      .select('id,tracking_number,current_tracking_status,tracking_events(event_time,raw_description,raw_status_name,raw_status,reason_description),orders(receive_status)')
      .eq('id',body.shipment_id)
      .order('event_time',{referencedTable:'tracking_events',ascending:false})
      .limit(1,{referencedTable:'tracking_events'})
      .maybeSingle()
    const event=(updated?.tracking_events??[])[0]??null
    const detail=event
      ?[event.raw_description,event.raw_status_name,event.reason_description,event.raw_status]
        .map(value=>typeof value==='string'?value.trim():'').find(Boolean)??null
      :null
    const snapshot=updated?{
      shipment_id:updated.id,
      tracking_number:updated.tracking_number,
      current_tracking_status:updated.current_tracking_status,
      tracking_detail:detail,
      tracking_event_time:event?.event_time??null,
      receive_status:(updated.orders as any)?.receive_status??null,
    }:null
    return NextResponse.json({...data,snapshot},{status:response.status})
  }catch(error){
    return apiError(
      'Không thể đồng bộ vận chuyển',
      500,
      error instanceof Error?error.message:String(error),
    )
  }
}
