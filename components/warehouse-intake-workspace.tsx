'use client'

import { useMemo,useState } from 'react'
import { SystemSlidebar } from '@/components/system-slidebar'
import { formatDateTime,formatMoney } from '@/lib/format'
import { mapWarehouseOrderItem,receiveOrdersIntoWarehouse,skipWarehouseOrder } from '@/lib/actions/warehouse'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

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
type ReceiptWarehouse={id?:string|null,code?:string|null,name?:string|null,address?:string|null}
type ReceiveBatch={
  id?:string|null
  warehouse_id?:string|null
  received_at?:string|null
  warehouses?:ReceiptWarehouse|null
}
type ReceiveDetail={
  receive_batches?:ReceiveBatch|ReceiveBatch[]|null
}
type Row={
  id:string
  shopee_order_id?:string|null
  cod?:number|string|null
  order_date?:string|null
  receive_batch_details?:ReceiveDetail|ReceiveDetail[]|null
  order_items:Item[]
}
type AuditLog={
  id:number|string
  entity_id?:string|null
  action:string
  created_at:string
  new_value?:Record<string,unknown>|null
}
type SplitCol='order'|'received'|'product'|'cod'|'missing'|'status'
const SPLIT_COLUMNS:SplitCol[]=['order','received','product','cod','missing','status']
const SPLIT_LABELS:Record<SplitCol,string>={
  order:'Mã đơn',received:'Ngày nhận',product:'Sản phẩm',cod:'COD',missing:'SKU chưa map',status:'Trạng thái',
}
type ReadyCol='order'|'received'|'product'|'qty'|'cod'|'status'
const READY_COLUMNS:ReadyCol[]=['order','received','product','qty','cod','status']
const READY_LABELS:Record<ReadyCol,string>={
  order:'Mã đơn',received:'Ngày nhận',product:'Sản phẩm',qty:'SL nhập',cod:'COD',status:'Trạng thái',
}

type Suggestion={
  variant_id:string
  sku?:string|null
  product_name?:string|null
  variant_name?:string|null
  multiplier:number
}

function batchOf(row:Row){
  const detail=Array.isArray(row.receive_batch_details)
    ? row.receive_batch_details[0]
    : row.receive_batch_details
  const raw=detail?.receive_batches
  if(Array.isArray(raw))return raw[0]??null
  return raw??null
}
function receivedAt(row:Row){
  return batchOf(row)?.received_at??row.order_date??null
}
function isComplete(row:Row){
  return row.order_items.length>0&&row.order_items.every(item=>Boolean(item.product_variant_id))
}

export function WarehouseIntakeWorkspace({
  rows,
  variants,
  auditLogs,
  suggestions,
}:{
  rows:Row[]
  variants:Variant[]
  auditLogs:AuditLog[]
  suggestions:Record<string,Suggestion>
}){
  const groups=useMemo(()=>{
    const map=new Map<string,{
      id:string
      code:string
      name:string
      address:string
      rows:Row[]
    }>()
    for(const row of rows){
      const batch=batchOf(row)
      const warehouse=batch?.warehouses
      const id=String(batch?.warehouse_id??warehouse?.id??'unknown')
      const existing=map.get(id)??{
        id,
        code:String(warehouse?.code??'CHƯA XÁC ĐỊNH'),
        name:String(warehouse?.name??'Kho nhận chưa xác định'),
        address:String(warehouse?.address??''),
        rows:[],
      }
      existing.rows.push(row)
      map.set(id,existing)
    }
    return [...map.values()].sort((a,b)=>a.code.localeCompare(b.code,'vi'))
  },[rows])

  const firstIncomplete=rows.find(row=>!isComplete(row))??rows[0]??null
  const [activeId,setActiveId]=useState<string|null>(firstIncomplete?.id??null)
  const [openGroups,setOpenGroups]=useState<string[]>(()=>groups.map(group=>group.id))
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null)
  const [selected,setSelected]=useState<string[]>([])
  const [panelTab,setPanelTab]=useState<'products'|'info'|'history'>('products')
  const [editingItem,setEditingItem]=useState<string|null>(null)
  const splitColumns=useManagedColumns<SplitCol>('mynh-warehouse-intake-split-columns-v2',SPLIT_COLUMNS,['order'])
  const splitSort=useManagedSort<SplitCol>('mynh-warehouse-intake-split-sort-v2','received','asc')
  const readyColumns=useManagedColumns<ReadyCol>('mynh-warehouse-intake-ready-columns-v2',READY_COLUMNS,['order'])
  const readySort=useManagedSort<ReadyCol>('mynh-warehouse-intake-ready-sort-v2','received','asc')

  const active=rows.find(row=>row.id===activeId)??null
  const activeComplete=active?isComplete(active):false
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const activeLogs=active
    ? auditLogs.filter(log=>String(log.entity_id??'')===active.id)
    : []

  function toggleGroup(id:string){
    setOpenGroups(current=>current.includes(id)
      ? current.filter(x=>x!==id)
      : [...current,id])
  }

  function toggleReady(groupId:string,id:string){
    if(selectedGroup!==groupId){
      setSelectedGroup(groupId)
      setSelected([id])
      return
    }
    setSelected(current=>current.includes(id)
      ? current.filter(x=>x!==id)
      : [...current,id])
  }

  function toggleAllReady(groupId:string,readyIds:string[]){
    const all=selectedGroup===groupId&&readyIds.every(id=>selectedSet.has(id))
    if(all){
      setSelected([])
      setSelectedGroup(null)
      return
    }
    setSelectedGroup(groupId)
    setSelected(readyIds)
  }

  return <div className={'whx-intake-layout warehouse-intake-layout '+(active?'with-panel':'')}>
    <section className="whx-intake-main tracking-hub-stack tracking-hub-stack-v2 warehouse-receive-groups">
      {!groups.length
        ? <div className="card empty">Không có đơn đã nhận đang chờ bóc tách hoặc nhập kho.</div>
        : groups.map(group=>{
            const open=openGroups.includes(group.id)
            const splitRows=group.rows.filter(row=>!isComplete(row))
            const readyRows=group.rows.filter(isComplete)
            const splitSorted=[...splitRows].sort((a,b)=>{
              const value=(row:Row,key:SplitCol)=>{
                if(key==='order')return String(row.shopee_order_id??row.id)
                if(key==='received')return new Date(receivedAt(row)??0).getTime()
                if(key==='product')return String(row.order_items[0]?.product_name??'')
                if(key==='cod')return Number(row.cod??0)
                if(key==='missing')return row.order_items.filter(item=>!item.product_variant_id).length
                return isComplete(row)?'ready':'missing'
              }
              const av=value(a,splitSort.key),bv=value(b,splitSort.key)
              const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
              return splitSort.dir==='asc'?cmp:-cmp
            })
            const readySorted=[...readyRows].sort((a,b)=>{
              const value=(row:Row,key:ReadyCol)=>{
                if(key==='order')return String(row.shopee_order_id??row.id)
                if(key==='received')return new Date(receivedAt(row)??0).getTime()
                if(key==='product')return String(row.order_items[0]?.product_name??'')
                if(key==='qty')return row.order_items.reduce((sum,item)=>sum+Number(item.quantity??0)*Number(item.inventory_multiplier??1),0)
                if(key==='cod')return Number(row.cod??0)
                return 'ready'
              }
              const av=value(a,readySort.key),bv=value(b,readySort.key)
              const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
              return readySort.dir==='asc'?cmp:-cmp
            })
            const totalCod=group.rows.reduce((sum,row)=>sum+Number(row.cod??0),0)
            const readyIds=readyRows.map(row=>row.id)
            const allReadySelected=readyIds.length>0&&selectedGroup===group.id&&readyIds.every(id=>selectedSet.has(id))
            const groupSelected=selectedGroup===group.id?selected.length:0

            return <section className={'card tracking-hub-card tracking-hub-card-v2 warehouse-receive-card '+(open?'open':'collapsed')} key={group.id}>
              <div className="tracking-hub-head-v2">
                <button
                  type="button"
                  className="tracking-hub-toggle"
                  aria-label={open?'Thu gọn Kho nhận':'Mở Kho nhận'}
                  aria-expanded={open}
                  onClick={()=>toggleGroup(group.id)}
                >
                  <span>{open?'⌄':'›'}</span>
                </button>

                <div className="tracking-hub-identity">
                  <span className={'tracking-hub-priority-dot '+(splitRows.length?'attention':'')}/>
                  <div>
                    <b>{group.code} · {group.address||group.name}</b>
                    <small>{group.name} · {group.rows.length} đơn đã xác nhận nhận hàng</small>
                  </div>
                </div>

                <div className="tracking-hub-metrics-v2">
                  <span><b>{group.rows.length}</b> đơn</span>
                  <span className={splitRows.length?'warning':''}><b>{splitRows.length}</b> chờ bóc tách</span>
                  <span className={readyRows.length?'info':''}><b>{readyRows.length}</b> chờ nhập</span>
                  <span className="money"><b>{formatMoney(totalCod)}</b> COD</span>
                </div>

                <div className="tracking-hub-summary-state">
                  {readyRows.length>0&&<span className="success">{readyRows.length} sẵn sàng</span>}
                  <span>{open?'Thu gọn':'Xem đơn'}</span>
                </div>
              </div>

              {open&&<>
                <div className="warehouse-intake-section-head">
                  <div>
                    <b>Chưa bóc tách</b>
                    <span>Chỉ hiển thị đơn còn ít nhất 1 sản phẩm chưa xác nhận SKU tồn kho</span>
                  </div>
                  <strong>{splitRows.length}</strong>
                </div>

                <div className="mobile-entity-list mobile-warehouse-split-list">
                  {!splitRows.length
                    ? <div className="mobile-empty-state">Không còn đơn cần bóc tách tại kho này.</div>
                    : splitRows.map(row=>{
                        const missing=row.order_items.filter(item=>!item.product_variant_id).length
                        return <button
                          type="button"
                          className={'mobile-warehouse-order-card '+(activeId===row.id?'selected':'')}
                          key={'mobile-split-'+row.id}
                          onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}
                        >
                          <div className="mobile-warehouse-order-head">
                            <div><b>{row.shopee_order_id??row.id.slice(0,8)}</b><span>{formatDateTime(receivedAt(row))}</span></div>
                            <span className="status-pill orange">Cần bóc tách</span>
                          </div>
                          <div className="mobile-warehouse-order-product">
                            <b>{row.order_items[0]?.product_name??'—'}</b>
                            <span>{row.order_items.length>1?('+'+(row.order_items.length-1)+' sản phẩm khác'):'1 sản phẩm'}</span>
                          </div>
                          <div className="mobile-warehouse-order-metrics">
                            <div><span>COD</span><b>{formatMoney(row.cod)}</b></div>
                            <div><span>SKU chưa map</span><b>{missing}</b></div>
                          </div>
                        </button>
                      })}
                </div>

                <div className="managed-table-toolbar warehouse-intake-managed-toolbar">
                  <span className="managed-table-meta">Bảng chờ bóc tách · áp dụng mọi kho nhận</span>
                  <ManagedColumnsMenu labels={SPLIT_LABELS} manager={splitColumns}/>
                </div>
                <div className="tracking-hub-table-wrap tracking-hub-table-wrap-v2">
                  <table className="table tracking-hub-table tracking-hub-table-v2 warehouse-split-table">
                    <thead><tr>{splitColumns.visible.map(col=><th key={col}><SortableHeader column={col} label={SPLIT_LABELS[col]} sort={splitSort} onSort={splitSort.toggle}/></th>)}</tr></thead>
                    <tbody>
                      {!splitSorted.length
                        ? <tr><td colSpan={splitColumns.visible.length} className="empty compact">Không còn đơn cần bóc tách tại kho này.</td></tr>
                        : splitSorted.map(row=>{
                            const missing=row.order_items.filter(item=>!item.product_variant_id).length
                            const cell=(col:SplitCol)=>{
                              if(col==='order')return <td key={col}><b className="table-link">{row.shopee_order_id??row.id.slice(0,8)}</b></td>
                              if(col==='received')return <td key={col}>{formatDateTime(receivedAt(row))}</td>
                              if(col==='product')return <td key={col}><div className="tracking-order-id"><b>{row.order_items[0]?.product_name??'—'}</b><span>{row.order_items.length>1?('+'+(row.order_items.length-1)+' sản phẩm khác'):'1 sản phẩm'}</span></div></td>
                              if(col==='cod')return <td key={col} className="money">{formatMoney(row.cod)}</td>
                              if(col==='missing')return <td key={col}><b className="warehouse-missing-count">{missing}</b></td>
                              return <td key={col}><span className="status-pill orange">Cần bóc tách</span></td>
                            }
                            return <tr key={row.id} className={activeId===row.id?'active-row':''} onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                              {splitColumns.visible.map(cell)}
                            </tr>
                          })}
                    </tbody>
                  </table>
                </div>

                <div className="warehouse-intake-section-head ready">
                  <div>
                    <b>Chờ nhập kho</b>
                    <span>Đã bóc tách đủ SKU nhưng chưa ghi tăng tồn; bắt buộc xác nhận thủ công</span>
                  </div>
                  <strong>{readyRows.length}</strong>
                </div>

                <div className="mobile-entity-list mobile-warehouse-ready-list">
                  {!readyRows.length
                    ? <div className="mobile-empty-state">Chưa có đơn đã bóc tách chờ nhập kho.</div>
                    : readyRows.map(row=>{
                        const stockQty=row.order_items.reduce(
                          (sum,item)=>sum+Number(item.quantity??0)*Number(item.inventory_multiplier??1),
                          0
                        )
                        const checked=selectedGroup===group.id&&selectedSet.has(row.id)
                        return <article
                          className={'mobile-warehouse-order-card '+(activeId===row.id?'selected':'')}
                          key={'mobile-ready-'+row.id}
                        >
                          <div className="mobile-warehouse-order-head">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={()=>toggleReady(group.id,row.id)}
                              aria-label={'Chọn '+(row.shopee_order_id??row.id)}
                            />
                            <button type="button" onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                              <b>{row.shopee_order_id??row.id.slice(0,8)}</b>
                              <span>{formatDateTime(receivedAt(row))}</span>
                            </button>
                            <span className="status-pill green">Chờ nhập</span>
                          </div>
                          <button type="button" className="mobile-warehouse-order-product" onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                            <b>{row.order_items.length} dòng sản phẩm</b>
                            <span>Đã bóc tách đủ SKU</span>
                          </button>
                          <div className="mobile-warehouse-order-metrics">
                            <div><span>SL nhập</span><b>{stockQty}</b></div>
                            <div><span>COD</span><b>{formatMoney(row.cod)}</b></div>
                          </div>
                        </article>
                      })}
                </div>

                <div className="managed-table-toolbar warehouse-intake-managed-toolbar">
                  <span className="managed-table-meta">Bảng chờ nhập kho · áp dụng mọi kho nhận</span>
                  <ManagedColumnsMenu labels={READY_LABELS} manager={readyColumns}/>
                </div>
                <div className="tracking-hub-table-wrap tracking-hub-table-wrap-v2">
                  <table className="table tracking-hub-table tracking-hub-table-v2 warehouse-ready-table">
                    <thead><tr>
                      <th className="select-col">
                        <input type="checkbox" checked={allReadySelected} onChange={()=>toggleAllReady(group.id,readyIds)} disabled={!readyRows.length} aria-label={'Chọn toàn bộ đơn chờ nhập '+group.code}/>
                      </th>
                      {readyColumns.visible.map(col=><th key={col}><SortableHeader column={col} label={READY_LABELS[col]} sort={readySort} onSort={readySort.toggle}/></th>)}
                    </tr></thead>
                    <tbody>
                      {!readySorted.length
                        ? <tr><td colSpan={readyColumns.visible.length+1} className="empty compact">Chưa có đơn đã bóc tách chờ nhập kho.</td></tr>
                        : readySorted.map(row=>{
                            const stockQty=row.order_items.reduce((sum,item)=>sum+Number(item.quantity??0)*Number(item.inventory_multiplier??1),0)
                            const cell=(col:ReadyCol)=>{
                              if(col==='order')return <td key={col}><b className="table-link">{row.shopee_order_id??row.id.slice(0,8)}</b></td>
                              if(col==='received')return <td key={col}>{formatDateTime(receivedAt(row))}</td>
                              if(col==='product')return <td key={col}>{row.order_items.length} dòng SP</td>
                              if(col==='qty')return <td key={col} className="warehouse-stock-qty">{stockQty}</td>
                              if(col==='cod')return <td key={col} className="money">{formatMoney(row.cod)}</td>
                              return <td key={col}><span className="status-pill green">Chờ xác nhận nhập</span></td>
                            }
                            return <tr key={row.id} className={activeId===row.id?'active-row':''} onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                              <td className="select-col" onClick={event=>event.stopPropagation()}>
                                <input type="checkbox" checked={selectedGroup===group.id&&selectedSet.has(row.id)} onChange={()=>toggleReady(group.id,row.id)} aria-label={'Chọn '+(row.shopee_order_id??row.id)}/>
                              </td>
                              {readyColumns.visible.map(cell)}
                            </tr>
                          })}
                    </tbody>
                  </table>
                </div>

                {groupSelected>0&&<form action={receiveOrdersIntoWarehouse} className="warehouse-confirm-stock-bar">
                  <div>
                    <b>{groupSelected} đơn đã chọn · {group.code}</b>
                    <span>Kho nhận đã khóa theo lần xác nhận nhận hàng. Không thể đổi kho ở bước này.</span>
                  </div>
                  {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
                  <label>
                    <span>Ghi chú nhập kho</span>
                    <input name="note" placeholder="Không bắt buộc"/>
                  </label>
                  <button className="button primary small" type="submit">Xác nhận nhập kho</button>
                  <button className="button small" type="button" onClick={()=>{setSelected([]);setSelectedGroup(null)}}>Bỏ chọn</button>
                </form>}
              </>}
            </section>
          })}
    </section>

    {active&&<SystemSlidebar className="whx-detail-panel warehouse-intake-panel">
      <div className="whx-panel-head">
        <div>
          <span className="module-eyebrow">{activeComplete?'CHỜ NHẬP KHO':'BÓC TÁCH SKU'}</span>
          <h2>{active.shopee_order_id??active.id.slice(0,8)}</h2>
          <p>{batchOf(active)?.warehouses?.code??'Kho'} · {batchOf(active)?.warehouses?.address??batchOf(active)?.warehouses?.name??''} · {formatDateTime(receivedAt(active))} · {formatMoney(active.cod)}</p>
        </div>
        <button className="close" type="button" onClick={()=>setActiveId(null)} aria-label="Đóng">×</button>
      </div>

      <div className="whx-panel-tabs">
        <button className={panelTab==='products'?'active':''} onClick={()=>setPanelTab('products')}>Sản phẩm</button>
        <button className={panelTab==='info'?'active':''} onClick={()=>setPanelTab('info')}>Thông tin</button>
        <button className={panelTab==='history'?'active':''} onClick={()=>setPanelTab('history')}>Lịch sử</button>
      </div>

      <div className="whx-panel-scroll">
        {panelTab==='products'&&<div className="whx-item-list">
          {activeComplete&&<div className="warehouse-ready-note warehouse-ready-actions">
            <div>
              <b>Đã bóc tách đủ SKU.</b>
              <span>Chọn thao tác nhanh cho đơn này.</span>
            </div>
            <div className="warehouse-quick-actions">
              <form action={receiveOrdersIntoWarehouse}>
                <input type="hidden" name="order_ids" value={active.id}/>
                <input type="hidden" name="note" value="Nhập kho nhanh sau khi xác nhận SKU"/>
                <button className="button primary small" type="submit">Nhập kho</button>
              </form>
              <form
                action={skipWarehouseOrder}
                onSubmit={event=>{
                  if(!window.confirm('Bỏ qua kho cho đơn này? Đơn sẽ không ghi tăng tồn kho.')){
                    event.preventDefault()
                  }
                }}
              >
                <input type="hidden" name="order_id" value={active.id}/>
                <input type="hidden" name="note" value="Bỏ qua kho sau khi xác nhận SKU"/>
                <button className="button small warehouse-skip-button" type="submit">Bỏ qua kho</button>
              </form>
            </div>
          </div>}

          {active.order_items.map(item=>{
            const mapped=Boolean(item.product_variant_id&&item.product_variants)
            const suggestion=suggestions[item.id]
            const stockQty=Number(item.quantity??0)*Number(item.inventory_multiplier??1)
            const editable=!activeComplete&&(editingItem===item.id||!mapped)

            return <div className={'whx-item-card '+(mapped?'mapped':'unmapped')} key={item.id}>
              <div className="whx-item-source">
                <div>
                  <b>{item.product_name}</b>
                  <span>{item.sku??'Không SKU mua'} · {item.variant??'Mặc định'} · SL mua {item.quantity}</span>
                </div>
                {mapped&&!activeComplete&&<button className="whx-text-button" type="button" onClick={()=>setEditingItem(editable?null:item.id)}>
                  {editable?'Đóng':'Sửa mapping'}
                </button>}
              </div>

              {mapped&&!editable&&<div className="whx-mapping-result">
                <span>→</span>
                <div>
                  <b>{item.product_variants?.products?.sku??'SKU bán'}</b>
                  <small>{item.product_variants?.products?.name} · {item.product_variants?.variant_name}</small>
                </div>
                <div className="whx-convert-chip"><span>Quy đổi</span><b>× {item.inventory_multiplier??1}</b></div>
                <div className="whx-convert-chip"><span>SL nhập</span><b>{stockQty}</b></div>
              </div>}

              {editable&&<>
                {suggestion&&<div className="whx-sku-suggestion">
                  <div>
                    <span>GỢI Ý TỪ LẦN BÓC TÁCH TRƯỚC</span>
                    <b>{suggestion.sku??'SKU bán'} · {suggestion.product_name??''}</b>
                    <small>{suggestion.variant_name??'Mặc định'} · quy đổi từng dùng × {suggestion.multiplier}</small>
                  </div>
                  <i>Chỉ gợi ý · chưa lưu</i>
                </div>}

                <form action={mapWarehouseOrderItem} className="whx-map-form">
                  <input type="hidden" name="item_id" value={item.id}/>
                  <label className="full">
                    <span>SKU tồn kho</span>
                    <select name="existing_variant_id" defaultValue={item.product_variant_id??''}>
                      <option value="">— Chọn SKU bán hoặc tạo mới —</option>
                      {suggestion&&<option value={suggestion.variant_id}>
                        ★ Gợi ý: {suggestion.sku} · {suggestion.product_name} · {suggestion.variant_name}
                      </option>}
                      {variants.filter(variant=>variant.id!==suggestion?.variant_id).map(variant=><option key={variant.id} value={variant.id}>
                        {variant.products?.sku} · {variant.products?.name} · {variant.variant_name}
                      </option>)}
                    </select>
                  </label>
                  <label>
                    <span>SKU bán mới</span>
                    <input name="sale_sku" placeholder="Chỉ nhập khi tạo SKU mới"/>
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
                    <span>Chọn gợi ý không tự nhập kho. Bấm lưu để xác nhận bóc tách.</span>
                    <button className="button primary small" type="submit">Lưu bóc tách</button>
                  </div>
                </form>
              </>}
            </div>
          })}
        </div>}

        {panelTab==='info'&&<div className="whx-info-grid">
          <div><span>Mã đơn</span><b>{active.shopee_order_id??'—'}</b></div>
          <div><span>Kho nhận</span><b>{batchOf(active)?.warehouses?.code??'—'} · {batchOf(active)?.warehouses?.address??batchOf(active)?.warehouses?.name??''}</b></div>
          <div><span>Ngày nhận</span><b>{formatDateTime(receivedAt(active))}</b></div>
          <div><span>COD</span><b>{formatMoney(active.cod)}</b></div>
          <div><span>Số dòng SP</span><b>{active.order_items.length}</b></div>
          <div><span>Trạng thái</span><b>{activeComplete?'Chờ nhập kho':'Chờ bóc tách'}</b></div>
        </div>}

        {panelTab==='history'&&<div className="whx-history-list">
          {!activeLogs.length
            ? <div className="empty compact">Chưa có lịch sử bóc tách cho đơn này.</div>
            : activeLogs.map(log=><div key={log.id}>
                <i/>
                <div>
                  <b>{log.action==='MAP_INVENTORY_SKU'?'Bóc tách / mapping SKU':log.action}</b>
                  <span>{formatDateTime(log.created_at)}</span>
                </div>
              </div>)}
        </div>}
      </div>
    </SystemSlidebar>}
  </div>
}
