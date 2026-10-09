import {NextResponse} from 'next/server'
import {revalidatePath} from 'next/cache'
import {createClient} from '@/lib/supabase/server'

const noCache={'Cache-Control':'private, no-store, max-age=0'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const response=(message:string,status:number)=>NextResponse.json({ok:false,error:message},{status,headers:noCache})

export async function POST(request:Request){
  // Explicit click-only mutation. Notification polling remains GET-only.
  const origin=request.headers.get('origin')
  if(origin&&origin!==new URL(request.url).origin)return response('Nguồn yêu cầu không hợp lệ',403)
  const supabase=await createClient()
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return response('Vui lòng đăng nhập lại',401)
  if(!['admin','operator'].includes(String(user.app_metadata?.role??''))){
    return response('Không có quyền xác nhận nhận hàng',403)
  }

  let input:Record<string,unknown>
  try{
    const raw=await request.json()
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid body')
    input=raw as Record<string,unknown>
  }catch{return response('Yêu cầu không hợp lệ',400)}

  const submittedIds=input.order_ids??(input.order_id?[input.order_id]:[])
  if(!Array.isArray(submittedIds)||submittedIds.length<1||submittedIds.length>40||
     submittedIds.some(id=>typeof id!=='string'||!uuid.test(id))||
     new Set(submittedIds).size!==submittedIds.length){
    return response('Danh sách đơn không hợp lệ, trùng hoặc quá 40 đơn',400)
  }
  const orderIds=submittedIds as string[]
  const warehouseId=String(input.warehouse_id??'')
  const mode=String(input.payment_mode??'')
  const note=typeof input.note==='string'?input.note.trim():''

  if(!uuid.test(warehouseId))return response('Mã kho không hợp lệ',400)
  if(!['receive_only','with_payment'].includes(mode))return response('Chưa chọn hình thức xác nhận',400)
  if(note.length>240)return response('Ghi chú tối đa 240 ký tự',400)

  const [{data:orders,error:ordersError},{data:warehouse,error:warehouseError}]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,receive_status,shipping_service,order_status,destination_hub,cod,archived_at,shipments(current_tracking_status)')
      .in('id',orderIds),
    supabase.from('warehouses').select('id,code,is_active')
      .eq('id',warehouseId).eq('is_active',true).maybeSingle(),
  ])
  if(ordersError||warehouseError)return response('Không thể kiểm tra thông tin nhận hàng',503)
  if(!warehouse)return response('Kho nhận không tồn tại hoặc ngừng hoạt động',400)
  if(!orders||orders.length!==orderIds.length)return response('Một hoặc nhiều đơn không tồn tại',404)
  if(orders.some(o=>o.archived_at||
      o.receive_status!=='WAITING_RECEIVE'||
      o.shipping_service==='EXPRESS'||
      ['CANCELLED','RETURNED'].includes(String(o.order_status??'').toUpperCase())||
      !Array.isArray(o.shipments)||
      !o.shipments.some((shipment:{current_tracking_status?:string})=>
        shipment.current_tracking_status==='DELIVERED'))){
    return response('Có đơn chưa giao thành công, không chờ nhận hoặc đã nhận. Hãy kiểm tra lại.',409)
  }
  const hubs=[...new Set(orders.map(o=>String(o.destination_hub??'').trim()))]
  if(hubs.length!==1||!hubs[0]){
    return response('Chỉ nhận hàng loạt các đơn cùng một HUB kho đích có cấu hình.',409)
  }
  const totalCod=orders.reduce((sum,o)=>sum+Number(o.cod??0),0)
  if(!Number.isFinite(totalCod)||totalCod<0)return response('COD không hợp lệ',409)

  let result
  if(mode==='with_payment'){
    const actual=input.actual_transferred
    const amount=typeof actual==='number'?actual:Number(actual)
    const cod=totalCod
    if(actual===null||actual===undefined||actual===''||
       !Number.isSafeInteger(amount)||amount<0||amount>1_000_000_000_000){
      return response('Số tiền thực chuyển không hợp lệ',400)
    }
    if(!Number.isFinite(cod)||amount<cod){
      return response('Tiền thực chuyển không được thấp hơn COD',400)
    }
    const hub=hubs[0]
    const {data:hubConfig,error:hubError}=await supabase
      .from('destination_hub_configs').select('id')
      .eq('hub_code',hub).eq('is_active',true).maybeSingle()
    if(hubError)return response('Không kiểm tra được cấu hình HUB',503)
    if(!hubConfig)return response('HUB kho đích chưa có cấu hình hoạt động',409)
    result=await supabase.rpc('confirm_receive_and_pay_hub',{
      p_order_ids:orderIds,
      p_warehouse_id:warehouseId,
      p_destination_hub:hub,
      p_actual_transferred:amount,
      p_note:note||null,
    })
  }else{
    result=await supabase.rpc('confirm_receive_orders',{
      p_order_ids:orderIds,
      p_warehouse_id:warehouseId,
      p_note:note||null,
    })
  }
  if(result.error){
    // The DB procedure is authoritative for idempotency and concurrency.
    return response('Không thể xác nhận nhận hàng. Đơn có thể đã được nhận hoặc dữ liệu đã thay đổi.',409)
  }

  for(const path of ['/purchase/tracking','/purchase/orders','/purchase','/warehouse','/warehouse/receive','/finance/shipper-payments']){
    revalidatePath(path)
  }
  return NextResponse.json({
    ok:true,order_ids:orderIds,order_count:orderIds.length,total_cod:totalCod,
    receive_status:'RECEIVED',
    receive_batch_id:result.data?.receive_batch_id??null,
    shipper_payment_id:result.data?.shipper_payment_id??null,
    tip:result.data?.tip??null,
  },{headers:noCache})
}
