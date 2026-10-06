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

export async function mapWarehouseOrderItem(formData:FormData){
  const {supabase,user}=await actor()

  const itemId=text(formData.get('item_id'))
  const existingVariantId=text(formData.get('existing_variant_id'))
  const saleSku=text(formData.get('sale_sku')).toUpperCase()
  const productName=text(formData.get('sale_product_name'))
  const variantName=text(formData.get('sale_variant_name'))||'Mặc định'
  const salePrice=number(formData.get('sale_price'))
  const multiplier=number(formData.get('inventory_multiplier'))

  if(!itemId)throw new Error('Thiếu dòng sản phẩm cần bóc tách')
  if(!Number.isInteger(multiplier)||multiplier<=0){
    throw new Error('Quy đổi tồn kho phải là số nguyên lớn hơn 0')
  }

  let variantId=existingVariantId

  if(variantId){
    const {data:variant,error}=await supabase
      .from('product_variants')
      .select('id')
      .eq('id',variantId)
      .maybeSingle()
    if(error)throw new Error(error.message)
    if(!variant)throw new Error('SKU bán đã chọn không còn tồn tại')
  }else{
    if(!saleSku||!productName)throw new Error('Thiếu SKU bán hoặc tên sản phẩm')
    if(!Number.isFinite(salePrice)||salePrice<0)throw new Error('Giá bán không hợp lệ')

    const {data:product,error:productError}=await supabase
      .from('products')
      .upsert({
        sku:saleSku,
        name:productName,
        note:'Tạo từ Bóc tách nhập kho',
        updated_at:new Date().toISOString(),
      },{onConflict:'sku'})
      .select('id')
      .single()
    if(productError)throw new Error(productError.message)

    const {data:variant,error:variantError}=await supabase
      .from('product_variants')
      .upsert({
        product_id:product.id,
        variant_name:variantName,
        sale_price:salePrice,
        updated_at:new Date().toISOString(),
      },{onConflict:'product_id,variant_name'})
      .select('id')
      .single()
    if(variantError)throw new Error(variantError.message)
    variantId=String(variant.id)
  }

  const {data:item,error:itemError}=await supabase
    .from('order_items')
    .select('id,order_id,product_variant_id,inventory_multiplier')
    .eq('id',itemId)
    .single()
  if(itemError)throw new Error(itemError.message)

  const {error:updateError}=await supabase
    .from('order_items')
    .update({
      product_variant_id:variantId,
      inventory_multiplier:multiplier,
    })
    .eq('id',itemId)
  if(updateError)throw new Error(updateError.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'WAREHOUSE',
    action:'MAP_INVENTORY_SKU',
    entity_type:'ORDER',
    entity_id:String(item.order_id),
    old_value:{
      product_variant_id:item.product_variant_id,
      inventory_multiplier:item.inventory_multiplier,
    },
    new_value:{
      order_item_id:itemId,
      product_variant_id:variantId,
      inventory_multiplier:multiplier,
    },
    source:'USER',
  })

  revalidateWarehouse()
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


export async function skipWarehouseOrder(formData:FormData){
  const {supabase,user}=await actor()

  const orderId=text(formData.get('order_id'))
  const note=text(formData.get('note'))||'Bỏ qua kho sau khi xác nhận SKU'
  if(!orderId)throw new Error('Thiếu đơn cần bỏ qua kho')

  const {data:order,error:orderError}=await supabase
    .from('orders')
    .select('id,receive_status,warehouse_status,order_items(id,product_variant_id)')
    .eq('id',orderId)
    .is('archived_at',null)
    .maybeSingle()
  if(orderError)throw new Error(orderError.message)
  if(!order)throw new Error('Đơn hàng không tồn tại hoặc đã lưu trữ')
  if(order.receive_status!=='RECEIVED'){
    throw new Error('Đơn chưa được xác nhận nhận hàng')
  }
  if(order.warehouse_status!=='READY_TO_TRANSFER'){
    throw new Error('Đơn không còn ở trạng thái chờ xử lý kho')
  }

  const items=(order.order_items??[]) as any[]
  if(!items.length||items.some(item=>!item.product_variant_id)){
    throw new Error('Cần xác nhận đầy đủ SKU trước khi bỏ qua kho')
  }

  const {error:updateError}=await supabase
    .from('orders')
    .update({warehouse_status:'WAREHOUSE_SKIPPED'})
    .eq('id',orderId)
  if(updateError)throw new Error(updateError.message)

  await supabase.from('audit_logs').insert({
    actor_user_id:user.id,
    module:'WAREHOUSE',
    action:'SKIP_WAREHOUSE',
    entity_type:'ORDER',
    entity_id:orderId,
    old_value:{warehouse_status:order.warehouse_status},
    new_value:{
      warehouse_status:'WAREHOUSE_SKIPPED',
      note,
    },
    source:'USER',
  })

  revalidateWarehouse()
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
