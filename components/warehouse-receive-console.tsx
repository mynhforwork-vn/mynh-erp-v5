'use client'

import { useMemo,useState } from 'react'
import {
  createInboundWarehouseTransfer,
  mapOrderItemToInventory,
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

  return <div className="warehouse-receive-console">
    {selected.length>0&&<form action={createInboundWarehouseTransfer} className="warehouse-bulk-bar">
      <div>
        <b>{selected.length} đơn sẵn sàng chuyển</b>
        <span>Đã map đủ SKU bán</span>
      </div>
      {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
      <select name="to_warehouse_id" required defaultValue="">
        <option value="" disabled>Chọn kho đích</option>
        {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
      </select>
      <input name="note" placeholder="Ghi chú phiếu chuyển"/>
      <button className="button primary small" type="submit">Tạo phiếu chuyển</button>
      <button className="button small" type="button" onClick={()=>setSelected([])}>Bỏ chọn</button>
    </form>}

    <div className="card warehouse-receive-table-card">
      <table className="table warehouse-receive-table">
        <thead><tr>
          <th className="bulk-select-col">
            <input
              type="checkbox"
              checked={allEligibleSelected}
              onChange={toggleAll}
              disabled={!eligibleRows.length}
              aria-label="Chọn tất cả đơn sẵn sàng chuyển"
            />
          </th>
          <th>Mã đơn</th>
          <th>HUB</th>
          <th>COD</th>
          <th>Sản phẩm mua vào → SKU bán</th>
          <th>Trạng thái kho</th>
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={6} className="empty">Không có đơn đã nhận đang chờ xử lý kho.</td></tr>
            : rows.map(row=>{
                const mapped=row.order_items.filter(i=>i.product_variant_id).length
                const complete=row.order_items.length>0&&mapped===row.order_items.length
                const selectable=complete&&!row.active_transfer_id
                return <tr key={row.id}>
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
                      <small>{row.order_items.length} dòng SP</small>
                    </div>
                  </td>
                  <td>{row.destination_hub??'—'}</td>
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
                  <td>
                    {row.active_transfer_id
                      ? <span className={'status-pill '+(row.active_transfer_status==='IN_TRANSIT'?'orange':'gray')}>Đã có phiếu · {row.active_transfer_status}</span>
                      : complete
                        ? <span className="status-pill green">Sẵn sàng chuyển</span>
                        : <span className="status-pill orange">Chờ bóc tách {row.order_items.length-mapped}</span>}
                  </td>
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </div>
}
