'use client'

import { useMemo,useState } from 'react'
import { formatDateTime,formatMoney } from '@/lib/format'
import { mapWarehouseOrderItem,receiveOrdersIntoWarehouse } from '@/lib/actions/warehouse'

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
  inventory_multiplier?:number|null
  product_variants?:Variant|null
}
type ReceiveDetail={
  receive_batches?:{received_at?:string|null}|null
}
type Row={
  id:string
  shopee_order_id?:string|null
  cod?:number|string|null
  order_date?:string|null
  receive_batch_details?:ReceiveDetail[]|null
  order_items:Item[]
}
type Warehouse={id:string,code:string,name:string}
type AuditLog={
  id:number|string
  entity_id?:string|null
  action:string
  created_at:string
  new_value?:Record<string,unknown>|null
}

function receivedAt(row:Row){
  return row.receive_batch_details?.[0]?.receive_batches?.received_at??row.order_date??null
}

export function WarehouseIntakeWorkspace({
  rows,
  variants,
  warehouses,
  auditLogs,
  defaultReceivingWarehouseId,
}:{
  rows:Row[]
  variants:Variant[]
  warehouses:Warehouse[]
  auditLogs:AuditLog[]
  defaultReceivingWarehouseId?:string|null
}){
  const [activeId,setActiveId]=useState<string|null>(rows[0]?.id??null)
  const [selected,setSelected]=useState<string[]>([])
  const [panelTab,setPanelTab]=useState<'products'|'info'|'history'>('products')
  const [editingItem,setEditingItem]=useState<string|null>(null)

  const active=rows.find(row=>row.id===activeId)??null
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const eligible=rows.filter(row=>
    row.order_items.length>0&&row.order_items.every(item=>Boolean(item.product_variant_id))
  )
  const allSelected=eligible.length>0&&eligible.every(row=>selectedSet.has(row.id))

  function toggleSelected(id:string){
    setSelected(current=>current.includes(id)
      ? current.filter(x=>x!==id)
      : [...current,id])
  }
  function toggleAll(){
    setSelected(allSelected?[]:eligible.map(row=>row.id))
  }

  const activeLogs=active
    ? auditLogs.filter(log=>String(log.entity_id??'')===active.id)
    : []

  return <div className={'whx-intake-layout '+(active?'with-panel':'')}>
    <section className="whx-intake-main">
      {selected.length>0&&<form action={receiveOrdersIntoWarehouse} className="whx-bulk-bar">
        <div>
          <b>{selected.length} đơn đã chọn</b>
          <span>Chỉ các đơn đã mapping đủ SKU mới được nhập kho</span>
        </div>
        {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
        <label>
          <span>Kho nhận</span>
          <select name="warehouse_id" required defaultValue={defaultReceivingWarehouseId??''}>
            <option value="" disabled>Chọn kho</option>
            {warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} · {warehouse.name}
            </option>)}
          </select>
        </label>
        <label className="whx-bulk-note">
          <span>Ghi chú</span>
          <input name="note" placeholder="Không bắt buộc"/>
        </label>
        <button className="button primary small" type="submit">Xác nhận nhập kho</button>
        <button className="button small" type="button" onClick={()=>setSelected([])}>Bỏ chọn</button>
      </form>}

      <div className="whx-table-card">
        <div className="whx-table-head">
          <div>
            <h2>Đơn đã nhận chờ bóc tách</h2>
            <span>{rows.length} đơn · {eligible.length} đơn sẵn sàng nhập kho</span>
          </div>
        </div>

        <div className="whx-table-scroll">
          <table className="table whx-table">
            <thead><tr>
              <th className="whx-check-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={!eligible.length}
                  aria-label="Chọn tất cả đơn sẵn sàng nhập kho"
                />
              </th>
              <th>Mã đơn</th>
              <th>Ngày nhận</th>
              <th>Sản phẩm</th>
              <th>SL mua</th>
              <th>SL nhập</th>
              <th>COD</th>
              <th>Trạng thái</th>
            </tr></thead>
            <tbody>
              {!rows.length
                ? <tr><td colSpan={8} className="empty">Không có đơn đã nhận đang chờ nhập kho.</td></tr>
                : rows.map(row=>{
                    const mapped=row.order_items.filter(item=>item.product_variant_id).length
                    const complete=row.order_items.length>0&&mapped===row.order_items.length
                    const purchaseQty=row.order_items.reduce((sum,item)=>sum+Number(item.quantity??0),0)
                    const stockQty=row.order_items.reduce(
                      (sum,item)=>sum+Number(item.quantity??0)*Number(item.inventory_multiplier??1),
                      0
                    )
                    return <tr
                      key={row.id}
                      className={activeId===row.id?'active-row':''}
                      onClick={()=>{setActiveId(row.id);setPanelTab('products')}}
                    >
                      <td className="whx-check-col" onClick={event=>event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedSet.has(row.id)}
                          onChange={()=>toggleSelected(row.id)}
                          disabled={!complete}
                          aria-label={'Chọn '+(row.shopee_order_id??row.id)}
                        />
                      </td>
                      <td><b className="whx-link-text">{row.shopee_order_id??row.id.slice(0,8)}</b></td>
                      <td>{formatDateTime(receivedAt(row))}</td>
                      <td>
                        <div className="whx-product-cell">
                          <b>{row.order_items[0]?.product_name??'—'}</b>
                          <span>{row.order_items.length>1?('+'+(row.order_items.length-1)+' sản phẩm khác'):'1 sản phẩm'}</span>
                        </div>
                      </td>
                      <td>{purchaseQty}</td>
                      <td className="whx-stock-number">{stockQty}</td>
                      <td className="money">{formatMoney(row.cod)}</td>
                      <td>{complete
                        ? <span className="status-pill green">Sẵn sàng nhập</span>
                        : <span className="status-pill orange">Thiếu mapping {row.order_items.length-mapped}</span>}
                      </td>
                    </tr>
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {active&&<aside className="whx-detail-panel">
      <div className="whx-panel-head">
        <div>
          <span className="module-eyebrow">ĐƠN ĐÃ NHẬN</span>
          <h2>{active.shopee_order_id??active.id.slice(0,8)}</h2>
          <p>{formatDateTime(receivedAt(active))} · {formatMoney(active.cod)}</p>
        </div>
        <button className="close" type="button" onClick={()=>setActiveId(null)} aria-label="Đóng">×</button>
      </div>

      <div className="whx-panel-tabs">
        <button className={panelTab==='products'?'active':''} onClick={()=>setPanelTab('products')}>Sản phẩm</button>
        <button className={panelTab==='info'?'active':''} onClick={()=>setPanelTab('info')}>Thông tin đơn</button>
        <button className={panelTab==='history'?'active':''} onClick={()=>setPanelTab('history')}>Lịch sử</button>
      </div>

      <div className="whx-panel-scroll">
        {panelTab==='products'&&<div className="whx-item-list">
          {active.order_items.map(item=>{
            const mapped=Boolean(item.product_variant_id&&item.product_variants)
            const stockQty=Number(item.quantity??0)*Number(item.inventory_multiplier??1)
            const editing=editingItem===item.id||!mapped
            return <div className={'whx-item-card '+(mapped?'mapped':'unmapped')} key={item.id}>
              <div className="whx-item-source">
                <div>
                  <b>{item.product_name}</b>
                  <span>{item.sku??'Không SKU'} · {item.variant??'Mặc định'} · SL mua {item.quantity}</span>
                </div>
                {mapped&&<button className="whx-text-button" type="button" onClick={()=>setEditingItem(editing?null:item.id)}>
                  {editing?'Đóng':'Đổi mapping'}
                </button>}
              </div>

              {mapped&&!editing&&<div className="whx-mapping-result">
                <span>→</span>
                <div>
                  <b>{item.product_variants?.products?.sku??'SKU bán'}</b>
                  <small>{item.product_variants?.products?.name} · {item.product_variants?.variant_name}</small>
                </div>
                <div className="whx-convert-chip">
                  <span>Quy đổi</span>
                  <b>× {item.inventory_multiplier??1}</b>
                </div>
                <div className="whx-convert-chip">
                  <span>SL nhập</span>
                  <b>{stockQty}</b>
                </div>
              </div>}

              {editing&&<form action={mapWarehouseOrderItem} className="whx-map-form">
                <input type="hidden" name="item_id" value={item.id}/>
                <label className="full">
                  <span>Dùng SKU bán đã có</span>
                  <select name="existing_variant_id" defaultValue={item.product_variant_id??''}>
                    <option value="">— Tạo SKU bán mới —</option>
                    {variants.map(variant=><option key={variant.id} value={variant.id}>
                      {variant.products?.sku} · {variant.products?.name} · {variant.variant_name}
                    </option>)}
                  </select>
                </label>
                <label>
                  <span>SKU bán mới</span>
                  <input name="sale_sku" placeholder="VD: AO-TRANG-L"/>
                </label>
                <label>
                  <span>Tên sản phẩm</span>
                  <input name="sale_product_name" defaultValue={item.product_name}/>
                </label>
                <label>
                  <span>Phân loại</span>
                  <input name="sale_variant_name" defaultValue={item.variant??'Mặc định'}/>
                </label>
                <label>
                  <span>Giá bán</span>
                  <input name="sale_price" type="number" min="0" step="1" placeholder="0"/>
                </label>
                <label>
                  <span>1 SP mua =</span>
                  <input name="inventory_multiplier" type="number" min="1" step="1" defaultValue={item.inventory_multiplier??1}/>
                </label>
                <div className="whx-map-actions">
                  <button className="button primary small" type="submit">Lưu mapping</button>
                </div>
              </form>}
            </div>
          })}
        </div>}

        {panelTab==='info'&&<div className="whx-info-grid">
          <div><span>Mã đơn</span><b>{active.shopee_order_id??'—'}</b></div>
          <div><span>Ngày nhận</span><b>{formatDateTime(receivedAt(active))}</b></div>
          <div><span>COD</span><b>{formatMoney(active.cod)}</b></div>
          <div><span>Số dòng SP</span><b>{active.order_items.length}</b></div>
          <div className="full"><span>Trạng thái</span><b>Đã nhận · chờ nhập kho</b></div>
        </div>}

        {panelTab==='history'&&<div className="whx-history-list">
          {!activeLogs.length
            ? <div className="empty compact">Chưa có lịch sử kho cho đơn này.</div>
            : activeLogs.map(log=><div key={log.id}>
                <i/>
                <div>
                  <b>{log.action}</b>
                  <span>{formatDateTime(log.created_at)}</span>
                </div>
              </div>)}
        </div>}
      </div>
    </aside>}
  </div>
}
