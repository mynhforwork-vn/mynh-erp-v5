'use server'

import {revalidatePath} from 'next/cache'
import {requireUser} from '@/lib/supabase/auth'

type SaveInput={
  orderItemId:string
  variantId:string|null
  newSku:string|null
  newName:string|null
  newVariant:string|null
  salePrice:number
  multiplier:number
  decision:'IN'|'SKIP'
  skipReason:string|null
}
function assertLive(){
  if(process.env.ERP_WAREHOUSE_V2_LIVE!=='true'){
    throw new Error('Chức năng lưu bóc tách chưa được bật cho môi trường này')
  }
}
async function authorize(){
  assertLive()
  const {supabase,user}=await requireUser()
  if(!['admin','operator'].includes(String(user.app_metadata?.role??'viewer'))){
    throw new Error('Không có quyền xử lý kho')
  }
  return supabase
}
function revalidateWarehouse(){
  for(const route of [
    '/warehouse','/warehouse/receive','/warehouse/inventory','/warehouse/history',
    '/purchase/orders','/purchase/tracking'
  ])revalidatePath(route)
}
export async function saveWarehouseItemDecision(input:SaveInput){
  const supabase=await authorize()
  if(!input || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.orderItemId)){
    throw new Error('Thiếu dòng sản phẩm cần lưu')
  }
  if(!Number.isInteger(input.multiplier)||input.multiplier<1||input.multiplier>100000){
    throw new Error('Hệ số quy đổi phải là số nguyên dương hợp lệ')
  }
  if(!Number.isFinite(input.salePrice)||input.salePrice<0||input.salePrice>999999999){
    throw new Error('Giá bán không hợp lệ')
  }
  if(!['IN','SKIP'].includes(input.decision)){
    throw new Error('Vui lòng chọn quyết định xử lý kho')
  }
  const reason=input.decision==='SKIP'?String(input.skipReason??'').trim():''
  if(input.decision==='SKIP'&&(!reason||reason.length>500)){
    throw new Error('Cần nhập lý do bỏ qua kho (tối đa 500 ký tự)')
  }
  const {data,error}=await supabase.rpc('save_warehouse_item_decision',{
    p_order_item_id:input.orderItemId,
    p_variant_id:input.variantId||null,
    p_new_sku:input.variantId?null:input.newSku?.trim().toUpperCase()||null,
    p_new_name:input.variantId?null:input.newName?.trim()||null,
    p_new_variant:input.variantId?null:input.newVariant?.trim()||null,
    p_sale_price:input.salePrice,
    p_multiplier:input.multiplier,
    p_decision:input.decision,
    p_skip_reason:reason||null,
  })
  if(error){
    // Prevent leaking SQL identifiers, full queries, credentials or RLS internals
    // into the UI. Expected business validation messages may be shown verbatim.
    const safe=/^(Đơn |Sản phẩm |SKU |Mã SKU |Giá bán |Cần |Chưa |Không |Thông tin |Số lượng |Thiếu |Hệ số )/u.test(error.message)
    throw new Error(safe?error.message:'Không thể lưu bóc tách. Hãy kiểm tra dữ liệu và thử lại.')
  }
  revalidateWarehouse()
  return data as {
    order_item_id:string;order_id:string;product_variant_id:string;
    sale_price:number;decision:'IN'|'SKIP';multiplier:number;
    quantity:number;skip_reason:string|null;status:string
  }
}
// Explicit skip for a purchase item without any mapped sale SKU.
 // The DB RPC requires a reason, validates the confirmed receiving order and
 // creates an audit-backed DRAFT only; it cannot create inventory transactions.
export async function skipWarehouseItemWithoutSku(input:{
  orderItemId:string;reason:string
}){
  const supabase=await authorize()
  if(!input||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.orderItemId)){
    throw new Error('Thiếu sản phẩm cần bỏ qua kho')
  }
  const reason=String(input.reason??'').trim()
  if(!reason||reason.length>500){
    throw new Error('Cần nhập lý do bỏ qua kho (tối đa 500 ký tự)')
  }
  const {data,error}=await supabase.rpc('skip_warehouse_item_without_sku',{
    p_order_item_id:input.orderItemId,
    p_skip_reason:reason,
  })
  if(error){
    const safe=/^(Đơn |Sản phẩm |SKU |Mã SKU |Giá bán |Cần |Chưa |Không |Thông tin |Số lượng |Thiếu |Hệ số )/u.test(error.message)
    throw new Error(safe?error.message:'Không thể bỏ qua sản phẩm. Hãy kiểm tra dữ liệu và thử lại.')
  }
  revalidateWarehouse()
  return data as {order_item_id:string;order_id:string;product_variant_id:null;
    decision:'SKIP';sale_price:0;multiplier:1;quantity:0;skip_reason:string;status:'DRAFT'}
}

export async function finalizeWarehouseItemDecisions(orderId:string,note:string=''){
  const supabase=await authorize()
  if(!orderId||note.length>500)throw new Error('Đơn hàng hoặc ghi chú không hợp lệ')
  const {data,error}=await supabase.rpc('finalize_warehouse_item_decisions',{
    p_order_id:orderId,p_note:note.trim()||null
  })
  if(error){
    const safe=/^(Đơn |Sản phẩm |SKU |Mã SKU |Giá bán |Cần |Chưa |Không |Thông tin |Số lượng |Thiếu |Hệ số )/u.test(error.message)
    throw new Error(safe?error.message:'Không thể chốt nhập kho. Vui lòng kiểm tra lại trước khi thử.')
  }
  revalidateWarehouse()
  return data as {
    order_id:string;warehouse_status:string;warehouse_id:string;
    in_items:number;skip_items:number;transaction_count:number
  }
}
