'use server'

import {revalidatePath} from 'next/cache'
import {requireUser} from '@/lib/supabase/auth'

// Bound one batch to protect the Worker request budget and ensure operators can
// inspect/retry individual failures without repeating successful stock writes.
const WAREHOUSE_BULK_LIMIT=25

type BulkInput={
  warehouseId:string
  orderIds:string[]
  note?:string
}
type Failure={orderId:string;message:string}
export type WarehouseBulkResult={
  succeeded:string[]
  failed:Failure[]
  legacyOrders:number
  itemDecisionOrders:number
  stockItemLines:number
  skippedItemLines:number
}

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function safeMessage(value:string){
  return /^(Đơn |Sản phẩm |SKU |Mã SKU |Giá bán |Cần |Chưa |Không |Thông tin |Số lượng |Thiếu |Hệ số )/u.test(value)
    ? value.slice(0,220)
    : 'Không thể xử lý đơn. Hãy kiểm tra trạng thái và thử lại.'
}
function revalidateWarehouse(){
  for(const page of ['/warehouse','/warehouse/receive','/warehouse/inventory',
    '/warehouse/history','/purchase/orders','/purchase/tracking'])revalidatePath(page)
}

export async function bulkReceiveWarehouseOrders(input:BulkInput):Promise<WarehouseBulkResult>{
  if(process.env.ERP_WAREHOUSE_V2_LIVE!=='true'){
    throw new Error('Preview chỉ xem, không ghi dữ liệu kho')
  }
  const {supabase,user}=await requireUser()
  if(!['admin','operator'].includes(String(user.app_metadata?.role??'viewer'))){
    throw new Error('Không có quyền nhập kho')
  }
  const unique=[...new Set(input?.orderIds??[])]
  const note=String(input?.note??'').trim()
  if(!input?.warehouseId||!ID.test(input.warehouseId)||
    !Array.isArray(input.orderIds)||unique.length<1||unique.length>WAREHOUSE_BULK_LIMIT||
    unique.some(id=>typeof id!=='string'||!ID.test(id))||note.length>500){
    throw new Error('Danh sách đơn, kho nhận hoặc ghi chú không hợp lệ')
  }

  // Authoritative warehouse is the confirmed receiving batch, NEVER the HUB.
  const {data:wh,error:whError}=await supabase.from('warehouses')
    .select('id,code,is_active').eq('id',input.warehouseId).maybeSingle()
  if(whError||!wh||!wh.is_active||!['BG','HN'].includes(wh.code)){
    throw new Error('Kho nhận thực tế không hợp lệ')
  }
  const [ordersRes,receiptsRes,decisionsRes]=await Promise.all([
    supabase.from('orders')
      .select('id,receive_status,warehouse_status,archived_at,order_items(id,quantity,product_variant_id,inventory_multiplier)')
      .in('id',unique),
    supabase.from('receive_batch_details')
      .select('order_id,receive_batches(warehouse_id)').in('order_id',unique),
    supabase.from('warehouse_item_decisions')
      .select('order_id,order_item_id,product_variant_id,multiplier,sale_price,decision,skip_reason,processing_state')
      .in('order_id',unique),
  ])
  if(ordersRes.error||receiptsRes.error||decisionsRes.error){
    throw new Error('Không thể kiểm tra điều kiện nhập kho. Chưa ghi dữ liệu.')
  }

  const rows=new Map((ordersRes.data??[]).map(row=>[row.id,row]))
  const receipts=new Map<string,string[]>()
  for(const entry of receiptsRes.data??[]){
    const batch=entry.receive_batches as unknown as
      {warehouse_id:string}|Array<{warehouse_id:string}>|null
    const warehouse=Array.isArray(batch)?batch[0]?.warehouse_id:batch?.warehouse_id
    const list=receipts.get(entry.order_id)??[]
    list.push(String(warehouse??''))
    receipts.set(entry.order_id,list)
  }
  const decisions=new Map<string,Array<{
    order_item_id:string;product_variant_id:string|null;multiplier:number;
    sale_price:number;decision:string;skip_reason:string|null;processing_state:string
  }>>()
  for(const decision of decisionsRes.data??[]){
    const list=decisions.get(decision.order_id)??[]
    list.push(decision)
    decisions.set(decision.order_id,list)
  }

  const result:WarehouseBulkResult={
    succeeded:[],failed:[],legacyOrders:0,itemDecisionOrders:0,
    stockItemLines:0,skippedItemLines:0,
  }
  const legacy:string[]=[]
  const itemLevel:{id:string;inLines:number;skipLines:number}[]=[]
  for(const id of unique){
    const row=rows.get(id)
    const items=row?.order_items??[]
    const decisionsFor=decisions.get(id)??[]
    const warehouseRefs=receipts.get(id)??[]
    let reason=''
    if(!row||row.archived_at||row.receive_status!=='RECEIVED'||
      row.warehouse_status!=='READY_TO_TRANSFER'){
      reason='Đơn không còn ở trạng thái chờ nhập kho'
    }else if(warehouseRefs.length!==1||warehouseRefs[0]!==input.warehouseId){
      reason='Đơn không thuộc đúng một phiếu nhận của kho đã chọn'
    }else if(!items.length||items.some(item=>
      !Number.isInteger(Number(item.quantity))||Number(item.quantity)<1)){
      reason='Số lượng sản phẩm không hợp lệ'
    }else if(decisionsFor.length){
      const map=new Map(decisionsFor.map(d=>[d.order_item_id,d]))
      if(map.size!==items.length||items.some(item=>{
        const d=map.get(item.id)
        if(!d||d.processing_state!=='DRAFT')return true
        const skipped=d.decision==='SKIP'&&!!String(d.skip_reason??'').trim()
        const skipWithoutSku=skipped&&!item.product_variant_id&&d.product_variant_id===null&&
          Number(d.sale_price)===0&&Number(d.multiplier)===1
        if(skipWithoutSku)return false
        const factor=Number(d.multiplier)
        return !item.product_variant_id||d.product_variant_id!==item.product_variant_id||
          !Number.isInteger(factor)||factor<1||factor!==Number(item.inventory_multiplier)||
          !Number.isFinite(Number(d.sale_price))||Number(d.sale_price)<0||
          !['IN','SKIP'].includes(d.decision)||
          (d.decision==='SKIP'&&!skipped)||
          Number(item.quantity)*factor>2147483647
      })){
        reason='Cần xác nhận SKU cho dòng nhập hoặc lý do cho dòng bỏ qua kho'
      }else{
        itemLevel.push({
          id,
          inLines:decisionsFor.filter(d=>d.decision==='IN').length,
          skipLines:decisionsFor.filter(d=>d.decision==='SKIP').length,
        })
      }
    }else if(items.some(item=>!item.product_variant_id||
      !Number.isInteger(Number(item.inventory_multiplier))||Number(item.inventory_multiplier)<1)){
      reason='Cần ghép SKU và hệ số quy đổi đầy đủ'
    }else legacy.push(id)
    if(reason)result.failed.push({orderId:id,message:reason})
  }

  // Existing RPC is atomic for all legacy orders. It cannot bypass item-level
  // choices, which are sent only through the proven V2 finalization RPC.
  if(legacy.length){
    const {error}=await supabase.rpc('receive_orders_into_warehouse',{
      p_order_ids:legacy,p_note:note||null,
    })
    if(error){
      for(const id of legacy)result.failed.push({orderId:id,message:safeMessage(error.message)})
    }else{
      result.succeeded.push(...legacy)
      result.legacyOrders=legacy.length
    }
  }
  // V2 RPC is atomic *per order*. Partial batch outcomes must be reported
  // explicitly; do not retry successful receipts, and keep failed ones selected.
  for(const row of itemLevel){
    const {error}=await supabase.rpc('finalize_warehouse_item_decisions',{
      p_order_id:row.id,p_note:note||null,
    })
    if(error)result.failed.push({orderId:row.id,message:safeMessage(error.message)})
    else{
      result.succeeded.push(row.id)
      result.itemDecisionOrders++
      result.stockItemLines+=row.inLines
      result.skippedItemLines+=row.skipLines
    }
  }
  if(result.succeeded.length)revalidateWarehouse()
  return result
}
