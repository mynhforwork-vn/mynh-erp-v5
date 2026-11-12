'use server'

import {revalidatePath} from 'next/cache'
import {requireUser} from '@/lib/supabase/auth'

const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function validate(itemId:string,targetId:string,multiplier:number){
  if(!uuid.test(itemId)||!uuid.test(targetId)){
    throw new Error('Chọn sản phẩm và phân loại SKU hợp lệ')
  }
  if(!Number.isInteger(multiplier)||multiplier<1||multiplier>100000){
    throw new Error('Hệ số quy đổi phải là số nguyên từ 1 đến 100.000')
  }
}
async function requireCorrectionAdmin(allowReadOnlyPreview=false){
  const isLive=process.env.ERP_POST_RECEIPT_SKU_LIVE==='true'
  const isReadOnlyPreview=process.env.ERP_WAREHOUSE_V2_LIVE!=='true'&&
    process.env.ERP_POST_RECEIPT_SKU_PREVIEW_UI==='true'
  if(!isLive&&!(allowReadOnlyPreview&&isReadOnlyPreview)){
    throw new Error('Điều chỉnh SKU sau nhập kho đang khóa; không ghi dữ liệu')
  }
  const {supabase,user}=await requireUser()
  if(String(user.app_metadata?.role??'viewer')!=='admin'){
    throw new Error('Chỉ quản trị viên được điều chỉnh SKU đã nhập kho')
  }
  return supabase
}
function raise(error:{message:string}|null){
  if(!error)return
  // Keep operator-facing validation messages, not SQL engine diagnostics.
  const text=error.message
  if(/^(SKU |Chỉ |Không |Cần |Đơn |Tồn kho |Thiếu |Số lượng |Liên kết |Quyết định |Dữ liệu |Hệ số |Nhập |Giá |Không xác định)/u.test(text)){
    throw new Error(text)
  }
  throw new Error('Không thể điều chỉnh SKU; cần kiểm tra dữ liệu và thử lại')
}
export type ReceivedSkuCorrectionPreview={
  order_id:string,order_item_id:string,warehouse_id:string,warehouse_code:string,
  old_decision:'IN'|'SKIP',old_variant_id:string|null,
  old_multiplier:number,old_sale_price:number,old_quantity:number,
  source_balance:number,new_variant_id:string,new_sku:string,
  new_product_name:string,new_variant_name:string,new_sale_price:number,
  new_multiplier:number,new_quantity:number,sale_history:number,
  transfer_history:number,receipt_found:boolean,
  fingerprint:string,can_correct:boolean
}
export async function previewReceivedSkuCorrection(
  orderItemId:string,targetVariantId:string,multiplier:number
):Promise<ReceivedSkuCorrectionPreview>{
  validate(orderItemId,targetVariantId,multiplier)
  const supabase=await requireCorrectionAdmin(true)
  const {data,error}=await supabase.rpc('preview_received_sku_correction',{
    p_order_item_id:orderItemId,p_target_variant_id:targetVariantId,p_multiplier:multiplier
  })
  raise(error)
  return data as ReceivedSkuCorrectionPreview
}
export async function confirmReceivedSkuCorrection(input:{
  orderItemId:string,targetVariantId:string,multiplier:number,
  fingerprint:string,reason:string
}){
  validate(input.orderItemId,input.targetVariantId,input.multiplier)
  const reason=String(input.reason??'').trim()
  if(reason.length<8||reason.length>500){
    throw new Error('Nhập lý do điều chỉnh từ 8 đến 500 ký tự')
  }
  if(!/^[a-f0-9]{32}$/i.test(input.fingerprint)){
    throw new Error('Dữ liệu xem trước không hợp lệ; vui lòng xem lại')
  }
  const supabase=await requireCorrectionAdmin()
  const {data,error}=await supabase.rpc('confirm_received_sku_correction',{
    p_order_item_id:input.orderItemId,
    p_target_variant_id:input.targetVariantId,
    p_multiplier:input.multiplier,
    p_fingerprint:input.fingerprint,
    p_note:reason
  })
  raise(error)
  for(const path of [
    '/warehouse/receive','/warehouse/inventory','/warehouse/history',
    '/warehouse/skus','/warehouse','/sales/pos'
  ])revalidatePath(path)
  return data as {id:string,order_item_id:string,old_quantity:number,new_quantity:number,
    warehouse_id:string,warehouse_status:string}
}
