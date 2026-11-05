'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'

function text(value:FormDataEntryValue|null){
  return String(value??'').trim()
}

function number(value:FormDataEntryValue|null){
  const parsed=Number(text(value))
  return Number.isFinite(parsed)?parsed:NaN
}

async function actor(){
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  if(!['admin','operator'].includes(role)){
    throw new Error('Không có quyền thực hiện thao tác kho')
  }
  return {supabase,user}
}

function revalidateWarehouse(){
  revalidatePath('/warehouse')
  revalidatePath('/warehouse/receive')
  revalidatePath('/warehouse/inventory')
  revalidatePath('/warehouse/history')
  revalidatePath('/purchase/orders')
  revalidatePath('/purchase/tracking')
}

// Compatibility entry point for older warehouse forms. No direct upsert is
// allowed to overwrite an existing SKU or bypass the atomic V2.1 audit.
export async function mapWarehouseOrderItem(formData: FormData) {
  const { saveWarehouseSkuV21 } = await import('@/lib/actions/warehouse-item-v21')
  await saveWarehouseSkuV21(formData)
}

export async function receiveOrdersIntoWarehouse(formData:FormData){
  const {supabase}=await actor()

  const orderIds=[...new Set(formData.getAll('order_ids').map(text).filter(Boolean))]
  const note=text(formData.get('note'))||null

  if(!orderIds.length)throw new Error('Chưa chọn đơn cần nhập kho')
  if(orderIds.length>200)throw new Error('Tối đa 200 đơn mỗi lần nhập kho')

  const {error}=await supabase.rpc('receive_orders_into_warehouse',{
    p_order_ids:orderIds,
    p_note:note,
  })
  if(error)throw new Error(error.message)

  revalidateWarehouse()
}


// Compatibility entry point for whole-order skip: pass through the same
// row-level RPC. This cannot silently mark an order SKIPPED while leaving
// its order_items in PENDING.
export async function skipWarehouseOrder(formData: FormData) {
  const { supabase } = await actor()
  const orderId = text(formData.get('order_id'))
  const reason = text(formData.get('note'))
  if (!orderId) throw new Error('Thiếu đơn hàng')
  if (!reason) throw new Error('Cần nhập lý do bỏ qua kho')
  const { data: items, error } = await supabase.from('order_items')
    .select('id,product_variant_id,warehouse_item_status')
    .eq('order_id', orderId)
  if (error) throw new Error(error.message)
  if (!items?.length) throw new Error('Đơn không có sản phẩm')
  if (items.some(item => !item.product_variant_id || item.warehouse_item_status !== 'PENDING')) {
    throw new Error('Có sản phẩm chưa xác nhận SKU hoặc đã xử lý kho')
  }
  const decisions = items.map(item => ({
    item_id: item.id, action: 'SKIP' as const, reason,
  }))
  const { processWarehouseItemsV21 } = await import('@/lib/actions/warehouse-item-v21')
  const payload = new FormData()
  payload.set('order_id', orderId)
  payload.set('decisions', JSON.stringify(decisions))
  await processWarehouseItemsV21(payload)
}

export async function saveReceivingWarehouseSettings(formData:FormData){
  const {supabase,user}=await actor()

  const warehouseId=text(formData.get('default_receiving_warehouse_id'))
  if(!warehouseId)throw new Error('Chưa chọn Kho nhận mặc định')

  const {data:warehouse,error:warehouseError}=await supabase
    .from('warehouses')
    .select('id,code,name,is_active')
    .eq('id',warehouseId)
    .maybeSingle()
  if(warehouseError)throw new Error(warehouseError.message)
  if(!warehouse||!warehouse.is_active)throw new Error('Kho nhận đã chọn không còn hoạt động')

  const {data:current,error:currentError}=await supabase
    .from('warehouse_settings')
    .select('default_receiving_warehouse_id')
    .eq('id','main')
    .single()
  if(currentError)throw new Error(currentError.message)

  const {error}=await supabase
    .from('warehouse_settings')
    .update({
      default_receiving_warehouse_id:warehouseId,
      updated_at:new Date().toISOString(),
    })
    .eq('id','main')
  if(error)throw new Error(error.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'WAREHOUSE',
    action:'UPDATE_RECEIVING_WAREHOUSE',
    entity_type:'SYSTEM',
    entity_id:null,
    old_value:{default_receiving_warehouse_id:current.default_receiving_warehouse_id},
    new_value:{
      default_receiving_warehouse_id:warehouseId,
      warehouse_code:warehouse.code,
      warehouse_name:warehouse.name,
    },
    source:'USER',
  })

  revalidateWarehouse()
}

export async function stocktakeWarehouseSku(formData:FormData){
  const {supabase,user}=await actor()

  const warehouseId=text(formData.get('warehouse_id'))
  const variantId=text(formData.get('product_variant_id'))
  const actualQuantity=number(formData.get('actual_quantity'))
  const note=text(formData.get('note'))||null

  if(!warehouseId||!variantId)throw new Error('Thiếu kho hoặc SKU cần kiểm kê')
  if(!Number.isInteger(actualQuantity)||actualQuantity<0){
    throw new Error('Tồn thực tế không hợp lệ')
  }

  const {data:balance,error:balanceError}=await supabase
    .from('inventory_balances')
    .select('quantity')
    .eq('warehouse_id',warehouseId)
    .eq('product_variant_id',variantId)
    .maybeSingle()
  if(balanceError)throw new Error(balanceError.message)

  const systemQuantity=Number(balance?.quantity??0)
  const difference=actualQuantity-systemQuantity
  const sessionId=crypto.randomUUID()

  if(difference!==0){
    const {error}=await supabase.from('inventory_transactions').insert({
      warehouse_id:warehouseId,
      product_variant_id:variantId,
      tx_type:difference>0?'ADJUSTMENT_IN':'ADJUSTMENT_OUT',
      quantity:Math.abs(difference),
      reference_type:'STOCKTAKE',
      reference_id:sessionId,
      created_by:user.id,
    })
    if(error)throw new Error(error.message)
  }

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'WAREHOUSE',
    action:'STOCKTAKE',
    entity_type:'PRODUCT_VARIANT',
    entity_id:variantId,
    old_value:{warehouse_id:warehouseId,quantity:systemQuantity},
    new_value:{
      warehouse_id:warehouseId,
      quantity:actualQuantity,
      difference,
      stocktake_id:sessionId,
      note,
    },
    source:'USER',
  })

  revalidateWarehouse()
}

export async function adjustWarehouseStock(formData:FormData){
  const {supabase,user}=await actor()

  const warehouseId=text(formData.get('warehouse_id'))
  const variantId=text(formData.get('product_variant_id'))
  const direction=text(formData.get('direction'))
  const quantity=number(formData.get('quantity'))
  const note=text(formData.get('note'))

  if(!warehouseId||!variantId)throw new Error('Thiếu kho hoặc SKU')
  if(!['IN','OUT'].includes(direction))throw new Error('Loại điều chỉnh không hợp lệ')
  if(!Number.isInteger(quantity)||quantity<=0)throw new Error('Số lượng điều chỉnh không hợp lệ')
  if(!note)throw new Error('Cần nhập lý do điều chỉnh')

  if(direction==='OUT'){
    const {data:balance,error}=await supabase
      .from('inventory_balances')
      .select('quantity')
      .eq('warehouse_id',warehouseId)
      .eq('product_variant_id',variantId)
      .maybeSingle()
    if(error)throw new Error(error.message)
    if(Number(balance?.quantity??0)<quantity){
      throw new Error('Tồn kho không đủ để điều chỉnh giảm')
    }
  }

  const {error}=await supabase.from('inventory_transactions').insert({
    warehouse_id:warehouseId,
    product_variant_id:variantId,
    tx_type:direction==='IN'?'ADJUSTMENT_IN':'ADJUSTMENT_OUT',
    quantity,
    reference_type:'MANUAL_ADJUSTMENT: '+note,
    reference_id:null,
    created_by:user.id,
  })
  if(error)throw new Error(error.message)

  revalidateWarehouse()
}

export async function createWarehouseTransfer(formData:FormData){
  const {supabase}=await actor()

  const fromWarehouseId=text(formData.get('from_warehouse_id'))
  const toWarehouseId=text(formData.get('to_warehouse_id'))
  const variantId=text(formData.get('product_variant_id'))
  const quantity=number(formData.get('quantity'))
  const note=text(formData.get('note'))||null

  if(!fromWarehouseId||!toWarehouseId||!variantId){
    throw new Error('Thiếu kho nguồn, kho đích hoặc SKU')
  }
  if(fromWarehouseId===toWarehouseId)throw new Error('Kho nguồn và kho đích phải khác nhau')
  if(!Number.isInteger(quantity)||quantity<=0)throw new Error('Số lượng chuyển không hợp lệ')

  const {error}=await supabase.rpc('create_stock_transfer',{
    p_from_warehouse_id:fromWarehouseId,
    p_to_warehouse_id:toWarehouseId,
    p_items:[{product_variant_id:variantId,quantity}],
    p_note:note,
  })
  if(error)throw new Error(error.message)

  revalidateWarehouse()
}

export async function dispatchWarehouseTransfer(formData:FormData){
  const {supabase}=await actor()
  const transferId=text(formData.get('transfer_id'))
  if(!transferId)throw new Error('Thiếu phiếu chuyển kho')

  const {error}=await supabase.rpc('dispatch_transfer',{p_transfer_id:transferId})
  if(error)throw new Error(error.message)

  revalidateWarehouse()
}

export async function receiveWarehouseTransfer(formData:FormData){
  const {supabase}=await actor()
  const transferId=text(formData.get('transfer_id'))
  if(!transferId)throw new Error('Thiếu phiếu chuyển kho')

  const {error}=await supabase.rpc('receive_transfer',{p_transfer_id:transferId})
  if(error)throw new Error(error.message)

  revalidateWarehouse()
}
