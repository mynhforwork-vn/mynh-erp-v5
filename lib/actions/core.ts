'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { nextTrackAt } from '@/lib/tracking/schedule'

function text(v:FormDataEntryValue|null){return String(v??'').trim()}
async function actor(){
  const {supabase,user}=await requireUser(); const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role))throw new Error('Không có quyền thực hiện thao tác này')
  return {supabase,user,role}
}

export async function createERPUser(formData:FormData){
  const {supabase}=await actor(); const username=text(formData.get('username'))
  if(!username)throw new Error('Tên đăng nhập là bắt buộc')
  const {error}=await supabase.from('erp_users').insert({username,phone:text(formData.get('phone'))||null,email:text(formData.get('email'))||null,status:text(formData.get('status'))||'Active',note:text(formData.get('note'))||null})
  if(error)throw new Error(error.message); revalidatePath('/users'); redirect('/users')
}

export async function createOrder(formData:FormData){
  const {supabase}=await actor()
  const shopeeOrderId=text(formData.get('shopee_order_id'))||null
  const erpUserId=text(formData.get('erp_user_id'))||null
  const trackingNumber=text(formData.get('tracking_number'))
  const carrier=text(formData.get('carrier'))||null
  const cod=Number(text(formData.get('cod'))||0)
  const {data:order,error}=await supabase.from('orders').insert({
    shopee_order_id:shopeeOrderId,erp_user_id:erpUserId,
    recipient_name:text(formData.get('recipient_name'))||null,
    recipient_phone:text(formData.get('recipient_phone'))||null,
    recipient_address:text(formData.get('recipient_address'))||null,
    destination_hub:text(formData.get('destination_hub'))||null,
    cod:Number.isFinite(cod)?cod:0,
  }).select('id').single()
  if(error||!order)throw new Error(error?.message??'Không tạo được đơn')
  if(trackingNumber){
    const next=nextTrackAt(new Date(),'READY_TO_SHIP')
    const {error:shipError}=await supabase.from('shipments').insert({order_id:order.id,tracking_number:trackingNumber,carrier,current_tracking_status:'READY_TO_SHIP',tracking_enabled:true,tracking_interval_minutes:120,next_track_at:next?.toISOString()??null})
    if(shipError){await supabase.from('orders').delete().eq('id',order.id);throw new Error(shipError.message)}
  }
  revalidatePath('/orders'); revalidatePath('/tracking'); redirect(`/orders?order=${order.id}`)
}

export async function replaceShipment(formData:FormData){
  const {supabase}=await actor(); const orderId=text(formData.get('order_id')); const trackingNumber=text(formData.get('tracking_number')); const carrier=text(formData.get('carrier'))||null
  if(!orderId||!trackingNumber)throw new Error('Thiếu đơn hàng hoặc mã vận đơn')
  const {data:old,error:oldError}=await supabase.from('shipments').select('id').eq('order_id',orderId).eq('is_active',true)
  if(oldError)throw new Error(oldError.message)
  const ids=(old??[]).map(x=>x.id)
  if(ids.length){const {error}=await supabase.from('shipments').update({is_active:false,replaced_at:new Date().toISOString(),tracking_enabled:false,next_track_at:null}).in('id',ids);if(error)throw new Error(error.message)}
  const next=nextTrackAt(new Date(),'READY_TO_SHIP')
  const {error:newError}=await supabase.from('shipments').insert({order_id:orderId,tracking_number:trackingNumber,carrier,current_tracking_status:'READY_TO_SHIP',tracking_enabled:true,tracking_interval_minutes:120,next_track_at:next?.toISOString()??null,is_active:true})
  if(newError){if(ids.length)await supabase.from('shipments').update({is_active:true,tracking_enabled:true}).in('id',ids);throw new Error(newError.message)}
  revalidatePath('/orders'); revalidatePath('/tracking'); redirect(`/orders?order=${orderId}&tab=tracking`)
}
