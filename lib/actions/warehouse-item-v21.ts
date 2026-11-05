'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'

function text(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}
function money(value: string, label: string) {
  if (value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(label + ' không hợp lệ')
  return number
}
function uuidOrNull(value: string) {
  return value || null
}
async function operator() {
  const { supabase, user } = await requireUser()
  if (!['admin', 'operator'].includes(String(user.app_metadata?.role ?? 'viewer'))) {
    throw new Error('Bạn không có quyền thay đổi dữ liệu kho')
  }
  return supabase
}
function refreshWarehouse() {
  for (const path of [
    '/warehouse', '/warehouse/receive', '/warehouse/inventory', '/warehouse/history',
    '/purchase/orders', '/purchase/tracking', '/sales/pos',
  ]) revalidatePath(path)
}

/**
 * RPC is the only write path for V2.1. The DB transaction updates the mapping,
 * optional global SKU price and the order audit together.
 */
export async function saveWarehouseSkuV21(formData: FormData) {
  const supabase = await operator()
  const itemId = text(formData.get('item_id'))
  if (!itemId) throw new Error('Chưa chọn sản phẩm để bóc tách')
  const multiplier = Number(text(formData.get('inventory_multiplier')) || '1')
  if (!Number.isInteger(multiplier) || multiplier <= 0) {
    throw new Error('Hệ số quy đổi phải là số nguyên dương')
  }
  const existingId = text(formData.get('existing_variant_id'))
  const updatePrice = text(formData.get('update_existing_price')) === 'true'
  const salePrice = money(text(formData.get('sale_price')), 'Giá bán')
  const expectedPrice = money(text(formData.get('expected_sale_price')), 'Giá bán ban đầu')
  if (updatePrice && !existingId) throw new Error('Chỉ xác nhận đổi giá khi chọn SKU đã có')
  if (updatePrice && salePrice === null) throw new Error('Chưa nhập giá bán mới')

  const { error } = await supabase.rpc('map_warehouse_order_item_v21', {
    p_item_id: itemId,
    p_existing_variant_id: uuidOrNull(existingId),
    p_sale_sku: text(formData.get('sale_sku')) || null,
    p_product_name: text(formData.get('sale_product_name')) || null,
    p_variant_name: text(formData.get('sale_variant_name')) || null,
    p_sale_price: salePrice,
    p_expected_sale_price: expectedPrice,
    p_update_existing_price: updatePrice,
    p_multiplier: multiplier,
  })
  if (error) throw new Error(error.message)
  refreshWarehouse()
  return { ok: true as const }
}

/** Confirm one or more distinct order-item decisions in a single transaction. */
export async function processWarehouseItemsV21(formData: FormData) {
  const supabase = await operator()
  const orderId = text(formData.get('order_id'))
  if (!orderId) throw new Error('Chưa xác định được đơn hàng')
  const raw = text(formData.get('decisions'))
  let decisions: Array<{ item_id: string; action: 'IN' | 'SKIP'; reason?: string }>
  try { decisions = JSON.parse(raw) } catch { throw new Error('Danh sách xử lý không hợp lệ') }
  if (!Array.isArray(decisions) || decisions.length < 1 || decisions.length > 200) {
    throw new Error('Chọn từ 1 đến 200 sản phẩm mỗi lần xử lý')
  }
  if (new Set(decisions.map(x => x.item_id)).size !== decisions.length) {
    throw new Error('Một sản phẩm được chọn nhiều lần')
  }
  for (const entry of decisions) {
    if (!entry || typeof entry.item_id !== 'string'
      || !['IN', 'SKIP'].includes(entry.action)
      || (entry.action === 'SKIP' && !String(entry.reason ?? '').trim())) {
      throw new Error('Cần chọn Nhập kho hoặc Bỏ qua kèm lý do cho từng sản phẩm')
    }
  }
  const { data, error } = await supabase.rpc('process_warehouse_order_items_v21', {
    p_order_id: orderId,
    p_decisions: decisions,
    p_note: text(formData.get('note')) || null,
  })
  if (error) throw new Error(error.message)
  refreshWarehouse()
  return { ok: true as const, result: data }
}
