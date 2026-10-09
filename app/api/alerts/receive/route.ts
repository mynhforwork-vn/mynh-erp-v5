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

  const orderId=String(input.order_id??'')
  const warehouseId=String(input.warehouse_id??'')
  const mode=String(input.payment_mode??'')
  const note=typeof input.note==='string'?input.note.trim():''

  if(!uuid.test(orderId)||!uuid.test(warehouseId))return response('Mã đơn hoặc kho không hợp lệ',400)
  if(!['receive_only','with_payment'].includes(mode))return response('Chưa chọn hình thức xác nhận',400)
  if(note.length>240)return response('Ghi chú tối đa 240 ký tự',400)

  const [{data:order,error:orderError},{data:warehouse,error:warehouseError}]=await Promise.all([
    supabase.from('orders')
      .select('id,shopee_order_id,receive_status,shipping_service,order_status,destination_hub,cod,archived_at,shipments(current_tracking_status)')
      .eq('id',orderId).maybeSingle(),
    supabase.from('warehouses').select('id,code,is_active')
      .eq('id',warehouseId).eq('is_active',true).maybeSingle(),
  ])
  if(orderError||warehouseError)return response('Không thể kiểm tra thông tin nhận hàng',503)
  if(!warehouse)return response('Kho nhận không tồn tại hoặc ngừng hoạt động',400)
  if(!order||order.archived_at)return response('Đơn không tồn tại hoặc đã lưu trữ',404)
  if(order.receive_status!=='WAITING_RECEIVE'){
    return response('Đơn không còn ở trạng thái chờ xác nhận. Hãy tải lại thông báo.',409)
  }
  if(order.shipping_service==='EXPRESS')return response('Đơn Hỏa tốc cần xác nhận ở luồng riêng',409)
  if(['CANCELLED','RETURNED'].includes(String(order.order_status??'').toUpperCase())){
    return response('Không thể xác nhận đơn hủy/hoàn',409)
  }
  const shipments=Array.isArray(order.shipments)?order.shipments:[]
  if(!shipments.some(x=>x.current_tracking_status==='DELIVERED')){
    return response('Chỉ xác nhận khi vận đơn đã giao thành công',409)
  }

  let result
  if(mode==='with_payment'){
    const actual=input.actual_transferred
    const amount=typeof actual==='number'?actual:Number(actual)
    const cod=Number(order.cod??0)
    if(actual===null||actual===undefined||actual===''||
       !Number.isSafeInteger(amount)||amount<0||amount>1_000_000_000_000){
      return response('Số tiền thực chuyển không hợp lệ',400)
    }
    if(!Number.isFinite(cod)||amount<cod){
      return response('Tiền thực chuyển không được thấp hơn COD',400)
    }
    const hub=String(order.destination_hub??'').trim()
    if(!hub)return response('Đơn chưa có HUB kho đích để đối soát',409)
    const {data:hubConfig,error:hubError}=await supabase
      .from('destination_hub_configs').select('id')
      .eq('hub_code',hub).eq('is_active',true).maybeSingle()
    if(hubError)return response('Không kiểm tra được cấu hình HUB',503)
    if(!hubConfig)return response('HUB kho đích chưa có cấu hình hoạt động',409)
    result=await supabase.rpc('confirm_receive_and_pay_hub',{
      p_order_ids:[orderId],
      p_warehouse_id:warehouseId,
      p_destination_hub:hub,
      p_actual_transferred:amount,
      p_note:note||null,
    })
  }else{
    result=await supabase.rpc('confirm_receive_orders',{
      p_order_ids:[orderId],
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
    ok:true,order_id:orderId,receive_status:'RECEIVED',
    receive_batch_id:result.data?.receive_batch_id??null,
    shipper_payment_id:result.data?.shipper_payment_id??null,
    tip:result.data?.tip??null,
  },{headers:noCache})
}
