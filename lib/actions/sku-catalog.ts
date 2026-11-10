'use server'

import {revalidatePath} from 'next/cache'
import {requireUser} from '@/lib/supabase/auth'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function checkId(value:string){if(!uuid.test(value??''))throw new Error('Mã SKU không hợp lệ')}
function checkPrice(value:number){
  if(!Number.isFinite(value)||value<0||value>999999999||
    Math.abs(value*100-Math.round(value*100))>0.00001){
    throw new Error('Giá bán phải hợp lệ, tối đa hai chữ số thập phân')
  }
}
function refresh(){
  for(const path of ['/warehouse/skus','/warehouse/receive','/warehouse/inventory',
    '/warehouse/history','/warehouse','/sales/pos'])revalidatePath(path)
}
async function session(admin=false){
  // Migration 0078 + isolated DB QA are required before enabling writes.
  if(process.env.ERP_SKU_CATALOG_LIVE!=='true'){
    throw new Error('Quản lý SKU đang ở chế độ xem trước; chưa cho phép ghi dữ liệu')
  }
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  if(admin?role!=='admin':!['admin','operator'].includes(role)){
    throw new Error('Bạn không có quyền thực hiện thao tác SKU này')
  }
  return supabase
}
function wrapError(error:{message:string}|null){
  if(!error)return
  const message=error.message
  if(/^(SKU |Mã SKU |Phân loại |Giá bán |Dữ liệu |Chọn |Cần |Nhập |Thiếu |Không |Sản phẩm )/u.test(message)){
    throw new Error(message)
  }
  throw new Error('Không thể lưu SKU. Hãy kiểm tra dữ liệu và thử lại.')
}
export async function addSkuClassification(input:{
  productId:string,variantName:string,salePrice:number
}){
  const supabase=await session()
  checkId(input.productId)
  const name=String(input.variantName??'').trim()
  if(name.length<1||name.length>255)throw new Error('Phân loại SKU phải có từ 1 đến 255 ký tự')
  checkPrice(input.salePrice)
  const {data,error}=await supabase.rpc('add_catalog_variant',{
    p_product_id:input.productId,p_variant_name:name,p_sale_price:input.salePrice
  })
  wrapError(error)
  refresh()
  return data
}
export async function editSkuClassification(input:{
  variantId:string,sku:string,productName:string,variantName:string,salePrice:number
}){
  const supabase=await session()
  checkId(input.variantId)
  const sku=String(input.sku??'').trim().toUpperCase()
  const name=String(input.productName??'').trim()
  const variant=String(input.variantName??'').trim()
  if(!sku||sku.length>100||!name||name.length>255||
    !variant||variant.length>255)throw new Error('Mã SKU, tên sản phẩm hoặc phân loại không hợp lệ')
  checkPrice(input.salePrice)
  const {data,error}=await supabase.rpc('update_catalog_variant',{
    p_variant_id:input.variantId,p_sku:sku,p_product_name:name,
    p_variant_name:variant,p_sale_price:input.salePrice
  })
  wrapError(error)
  refresh()
  return data
}
export type SkuMergePreview={
  source:{id:string,sku:string,name:string,variant:string,price:number}
  target:{id:string,sku:string,name:string,variant:string,price:number}
  warehouses:Array<{warehouse_id:string,warehouse:string,quantity:number}>
  quantity:number,open_orders:number,drafts:number,pending_transfers:number,
  sale_history:number,negative_balances:number,fingerprint:string,can_merge:boolean
}
export async function previewSkuMerge(sourceId:string,targetId:string):Promise<SkuMergePreview>{
  const supabase=await session(true)
  checkId(sourceId);checkId(targetId)
  if(sourceId===targetId)throw new Error('Chọn hai phân loại khác nhau')
  const {data,error}=await supabase.rpc('preview_sku_merge',{
    p_source:sourceId,p_target:targetId
  })
  wrapError(error)
  return data as SkuMergePreview
}
export async function confirmSkuMerge(input:{
  sourceId:string,targetId:string,fingerprint:string,
  confirmation:string,sameUnit:boolean,note:string
}){
  const supabase=await session(true)
  checkId(input.sourceId);checkId(input.targetId)
  if(input.sourceId===input.targetId)throw new Error('Không thể gộp SKU vào chính nó')
  if(!input.sameUnit)throw new Error('Cần xác nhận hai SKU có cùng đơn vị tồn kho')
  const note=String(input.note??'').trim()
  if(note.length<5||note.length>500)throw new Error('Nhập lý do gộp SKU từ 5 đến 500 ký tự')
  if(!/^[0-9a-f]{32}$/i.test(input.fingerprint)){
    throw new Error('Dữ liệu xem trước không hợp lệ. Vui lòng kiểm tra lại')
  }
  const {data,error}=await supabase.rpc('merge_catalog_sku',{
    p_source:input.sourceId,p_target:input.targetId,
    p_fingerprint:input.fingerprint,p_confirmation:input.confirmation,
    p_same_unit:input.sameUnit,p_note:note
  })
  wrapError(error)
  refresh()
  return data as {merge_id:string,quantity_moved:number}
}
