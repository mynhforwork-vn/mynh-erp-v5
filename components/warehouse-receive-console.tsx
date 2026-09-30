'use client'

import { useMemo,useState } from 'react'
import {
  mapOrderItemToInventory,
  receiveOrdersIntoWarehouse,
} from '@/lib/actions/core'
import { formatMoney } from '@/lib/format'

type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{sku?:string|null,name?:string|null}|null
}
type Item={
  id:string
  sku?:string|null
  product_name:string
  variant?:string|null
  quantity:number
  original_price?:number|string|null
  final_price?:number|string|null
  product_variant_id?:string|null
  product_variants?:Variant|null
}
type Row={
  id:string
  shopee_order_id?:string|null
  destination_hub?:string|null
  cod?:number|string|null
  warehouse_status?:string|null
  order_date?:string|null
  active_transfer_id?:string|null
  active_transfer_status?:string|null
  order_items:Item[]
}
type Warehouse={id:string,code:string,name:string}

export function WarehouseReceiveConsole({
  rows,
  variants,
  warehouses,
}:{
  rows:Row[]
  variants:Variant[]
  warehouses:Warehouse[]
}){
  const [selected,setSelected]=useState<string[]>([])
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const eligibleRows=rows.filter(r=>
    !r.active_transfer_id &&
    r.order_items.length>0 &&
    r.order_items.every(i=>Boolean(i.product_variant_id))
  )
  const allEligibleSelected=eligibleRows.length>0&&eligibleRows.every(r=>selectedSet.has(r.id))

  function toggle(id:string){
    setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
  }
  function toggleAll(){
    setSelected(allEligibleSelected?[]:eligibleRows.map(r=>r.id))
  }

  return <div className="warehouse-receive-console warehouse-receive-console-v2">
    {selected.length>0&&<form action={receiveOrdersIntoWarehouse} className="warehouse-bulk-bar warehouse-intake-bar">
      <div className="warehouse-intake-summary">
        <b>{selected.length} đơn sẵn sàng nhập kho</b>
        <span>Đã mapping đầy đủ SKU bán</span>
      </div>
      {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
      <label>Kho nhận
        <select name="warehouse_id" required defaultValue="">
          <option value="" disabled>Chọn Kho nhận</option>
          {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
      </label>
      <label className="warehouse-intake-note">Ghi chú
        <input name="note" placeholder="Không bắt buộc"/>
      </label>
      <button className="button primary small" type="submit">Xác nhận nhập kho</button>
      <button className="button small" type="button" onClick={()=>setSelected([])}>Bỏ chọn</button>
    </form>}

    <div className="card warehouse-receive-table-card warehouse-table-surface">
      <div className="warehouse-table-head">
        <div>
          <h2>Đơn đã nhận chờ nhập kho</h2>
          <span>{rows.length} đơn · chọn các đơn đã mapping đủ SKU để nhập cùng lúc</span>
        </div>
        <span className="warehouse-table-meta">{eligibleRows.length} sẵn sàng</span>
      </div>
      <table className="table warehouse-receive-table">
        <thead><tr>
          <th className="bulk-select-col">
            <input
              type="checkbox"
              checked={allEligibleSelected}
              onChange={toggleAll}
              disabled={!eligibleRows.length}
              aria-label="Chọn tất cả đơn sẵn sàng nhập kho"
            />
          </th>
          <th>Mã đơn</th>
          <th>COD</th>
          <th>Sản phẩm mua vào → SKU bán</th>
          <th>Tổng SL</th>
          <th>Trạng thái</th>
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={6} className="empty">Không có đơn đã nhận đang chờ bóc tách nhập kho.</td></tr>
            : rows.map(row=>{
                const mapped=row.order_items.filter(i=>i.product_variant_id).length
                const complete=row.order_items.length>0&&mapped===row.order_items.length
                const selectable=complete&&!row.active_transfer_id
                const totalQty=row.order_items.reduce((sum,i)=>sum+Number(i.quantity??0),0)
                return <tr key={row.id} className={selectable?'warehouse-row-ready':''}>
                  <td className="bulk-select-col">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(row.id)}
                      onChange={()=>toggle(row.id)}
                      disabled={!selectable}
                      aria-label={'Chọn '+(row.shopee_order_id??row.id)}
                    />
                  </td>
                  <td>
                    <div className="warehouse-order-cell">
                      <b>{row.shopee_order_id??row.id.slice(0,8)}</b>
                      <small>{row.order_items.length} dòng sản phẩm</small>
                    </div>
                  </td>
                  <td className="money">{formatMoney(row.cod)}</td>
                  <td>
                    <div className="warehouse-item-stack">
                      {row.order_items.map(item=><div className={'warehouse-item-map '+(item.product_variant_id?'mapped':'unmapped')} key={item.id}>
                        <div className="warehouse-purchase-item">
                          <b>{item.product_name}</b>
                          <span>{item.sku??'Không SKU'} · {item.variant??'Mặc định'} · SL {item.quantity}</span>
                        </div>
                        {item.product_variant_id&&item.product_variants
                          ? <div className="warehouse-map-result">
                              <span>→</span>
                              <div>
                                <b>{item.product_variants.products?.sku??'SKU bán'}</b>
                                <small>{item.product_variants.products?.name} · {item.product_variants.variant_name} · {formatMoney(item.product_variants.sale_price)}</small>
                              </div>
                            </div>
                          : <details className="warehouse-map-editor">
                              <summary>Bóc tách SKU bán</summary>
                              <form action={mapOrderItemToInventory}>
                                <input type="hidden" name="item_id" value={item.id}/>
                                <label>Dùng SKU đã có
                                  <select name="existing_variant_id" defaultValue="">
                                    <option value="">— Tạo SKU bán mới —</option>
                                    {variants.map(v=><option key={v.id} value={v.id}>
                                      {v.products?.sku} · {v.products?.name} · {v.variant_name}
                                    </option>)}
                                  </select>
                                </label>
                                <div className="warehouse-map-grid">
                                  <label>SKU bán<input name="sale_sku" placeholder="VD: SALE-OMO-3KG"/></label>
                                  <label>Tên SP bán<input name="sale_product_name" defaultValue={item.product_name}/></label>
                                  <label>Phân loại<input name="sale_variant_name" defaultValue={item.variant??'Mặc định'}/></label>
                                  <label>Giá bán<input name="sale_price" type="number" min="0" step="1" placeholder="0"/></label>
                                </div>
                                <button className="button small primary" type="submit">Lưu mapping</button>
                              </form>
                            </details>}
                      </div>)}
                    </div>
                  </td>
                  <td className="warehouse-stock-number">{totalQty}</td>
                  <td>
                    {row.active_transfer_id
                      ? <span className="status-pill archived">Phiếu chuyển cũ · {row.active_transfer_status}</span>
                      : complete
                        ? <span className="status-pill green">Sẵn sàng nhập kho</span>
                        : <span className="status-pill orange">Thiếu mapping {row.order_items.length-mapped}</span>}
                  </td>
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </div>
}
