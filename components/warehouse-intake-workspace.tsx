'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
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
  warehouse_status?:string|null
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
type TableCol='order'|'received'|'warehouse'|'product'|'progress'|'cod'|'status'
const TABLE_COLUMNS:TableCol[]=['order','received','warehouse','product','progress','cod','status']
const TABLE_LABELS:Record<TableCol,string>={
  order:'Mã đơn',received:'Ngày nhận',warehouse:'Kho nhận',product:'Sản phẩm',
  progress:'Bóc tách',cod:'COD',status:'Trạng thái',
}
// Preserve the seven original table fields at every breakpoint. Resize the
// columns *inside the table*, not the row structure, whenever a slidebar opens.
const COLUMN_BASE:Record<TableCol,number>={
  order:130,received:120,warehouse:70,product:210,progress:80,cod:100,status:130,
}
const COLUMN_GROW:Record<TableCol,number>={
  order:1,received:0.45,warehouse:0.1,product:6,progress:0.15,cod:0.4,status:0.9,
}
function autoFitColumnWidths(columns:TableCol[], availableWidth:number){
  const width=Math.max(1,availableWidth)
  const base=columns.map(column=>COLUMN_BASE[column])
  const baseSum=base.reduce((sum,value)=>sum+value,0)
  const extra=Math.max(0,width-baseSum)
  const weightTotal=columns.reduce((sum,column)=>sum+COLUMN_GROW[column],0)
  const adjusted=base.map((size,index)=>extra>0
    ? size+extra*COLUMN_GROW[columns[index]]/weightTotal
    : size*width/baseSum)
  const total=adjusted.reduce((sum,value)=>sum+value,0)
  return adjusted.map(value=>100*value/total)
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
  return batchOf(row)?.received_at??null
}
function isDone(row:Row){
  return ['WAREHOUSE_RECEIVED','WAREHOUSE_SKIPPED','WAREHOUSE_MIXED'].includes(String(row.warehouse_status??''))
}
function phaseLabel(row:Row){
  if(row.warehouse_status==='WAREHOUSE_SKIPPED')return 'Đã bỏ qua kho'
  if(row.warehouse_status==='WAREHOUSE_RECEIVED')return 'Đã nhập kho'
  if(isDone(row))return 'Đã xử lý'
  return isComplete(row)?'Chờ nhập kho':'Chờ bóc tách'
}
function isComplete(row:Row){
  return row.order_items.length>0&&row.order_items.every(item=>Boolean(item.product_variant_id))
}

export function WarehouseIntakeWorkspace({
  rows,
  variants,
  auditLogs,
  suggestions,
  previewOnly=false,
}:{
  rows:Row[]
  variants:Variant[]
  auditLogs:AuditLog[]
  suggestions:Record<string,Suggestion>
  previewOnly?:boolean
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
  // Independent column visibility/order and sorting for each real receiving warehouse.
  const bgColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-bg-columns-v1',TABLE_COLUMNS,['order'])
  const hnColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-hn-columns-v1',TABLE_COLUMNS,['order'])
  const otherColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-other-columns-v1',TABLE_COLUMNS,['order'])
  const bgSort=useManagedSort<TableCol>('mynh-warehouse-intake-bg-sort-v1','received','desc')
  const hnSort=useManagedSort<TableCol>('mynh-warehouse-intake-hn-sort-v1','received','desc')
  const otherSort=useManagedSort<TableCol>('mynh-warehouse-intake-other-sort-v1','received','desc')
  const laneRef=useRef<HTMLElement|null>(null)
  const [laneWidth,setLaneWidth]=useState(1100)
  useEffect(()=>{
    const node=laneRef.current
    if(!node)return
    const measure=()=>{
      const next=Math.round(node.getBoundingClientRect().width)
      if(next>0)setLaneWidth(current=>current===next?current:next)
    }
    measure()
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure)
    observer?.observe(node)
    window.addEventListener('resize',measure)
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure)}
  },[])

  const active=rows.find(row=>row.id===activeId)??null
  const activeDone=active?isDone(active):false
  const activeComplete=active?!isDone(active)&&isComplete(active):false
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

  return <div className={'whx-intake-layout warehouse-intake-layout warehouse-intake-preview-layout '+(active?'with-panel':'')}>
    <section ref={laneRef} className="whx-intake-main tracking-hub-stack tracking-hub-stack-v2 warehouse-receive-groups warehouse-receive-table-lane">
      {!groups.length
        ? <div className="card empty">Không có đơn đã nhận trong khoảng thời gian và trạng thái đang chọn.</div>
        : groups.map(group=>{
            const open=openGroups.includes(group.id)
            const waiting=group.rows.filter(row=>!isDone(row))
            const splitRows=waiting.filter(row=>!isComplete(row))
            const readyRows=waiting.filter(isComplete)
            const doneRows=group.rows.filter(isDone)
            const tableColumns=group.code==='BG'?bgColumns:group.code==='HN'?hnColumns:otherColumns
            const tableSort=group.code==='BG'?bgSort:group.code==='HN'?hnSort:otherSort
            const sorted=[...group.rows].sort((left,right)=>{
              const key=(row:Row,col:TableCol):number|string=>{
                if(col==='order')return String(row.shopee_order_id??row.id)
                if(col==='received')return new Date(receivedAt(row)??0).getTime()
                if(col==='warehouse')return String(batchOf(row)?.warehouses?.code??'')
                if(col==='product')return row.order_items[0]?.product_name??''
                if(col==='progress')return row.order_items.filter(item=>item.product_variant_id).length
                if(col==='cod')return Number(row.cod??0)
                return phaseLabel(row)
              }
              const x=key(left,tableSort.key),y=key(right,tableSort.key)
              const cmp=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'vi')
              return tableSort.dir==='asc'?cmp:-cmp
            })
            const totalCod=group.rows.reduce((sum,row)=>sum+Number(row.cod??0),0)
            const readyIds=readyRows.map(row=>row.id)
            const allReadySelected=readyIds.length>0&&selectedGroup===group.id&&readyIds.every(id=>selectedSet.has(id))
            const groupSelected=selectedGroup===group.id?selected.filter(id=>readyIds.includes(id)).length:0
            const columnWidths=autoFitColumnWidths(tableColumns.visible,laneWidth)
            const cell=(row:Row,col:TableCol)=>{
              const attributes={'data-col':col,'data-label':TABLE_LABELS[col]}
              if(col==='order')return <td key={col} {...attributes}>
                <div className="warehouse-unified-order">
                  {!isDone(row)&&isComplete(row)&&<input type="checkbox"
                    checked={selectedGroup===group.id&&selectedSet.has(row.id)}
                    onChange={()=>toggleReady(group.id,row.id)}
                    onClick={event=>event.stopPropagation()}
                    aria-label={'Chọn '+(row.shopee_order_id??row.id)}/>}
                  <button type="button" className="table-link" onClick={event=>{event.stopPropagation();setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                    {row.shopee_order_id??row.id.slice(0,8)}
                  </button>
                </div>
              </td>
              if(col==='received')return <td key={col} {...attributes} className="warehouse-unified-date">{receivedAt(row)?formatDateTime(receivedAt(row)):'Chưa có ngày nhận'}</td>
              if(col==='warehouse')return <td key={col} {...attributes}>{batchOf(row)?.warehouses?.code??'Chưa xác định'}</td>
              if(col==='product')return <td key={col} {...attributes} className="warehouse-unified-products">
                {row.order_items.length?row.order_items.map(item=><div key={item.id} className="warehouse-unified-product-line"
                  title={[item.product_name,item.variant,'SL '+item.quantity].filter(Boolean).join(' · ')}>
                  <span className="warehouse-unified-product-name">{item.product_name}{item.variant?' · '+item.variant:''}</span>
                  <span className="warehouse-unified-product-qty">×{item.quantity}</span>
                </div>):'Chưa có sản phẩm'}
              </td>
              if(col==='progress')return <td key={col} {...attributes} className="warehouse-unified-progress">
                {row.order_items.filter(item=>item.product_variant_id).length}/{row.order_items.length}
              </td>
              if(col==='cod')return <td key={col} {...attributes} className="money">{formatMoney(row.cod)}</td>
              return <td key={col} {...attributes}><span className={'status-pill '+(isDone(row)?'green':isComplete(row)?'status-ready_to_ship':'orange')}>{phaseLabel(row)}</span></td>
            }
            return <section className={'card tracking-hub-card tracking-hub-card-v2 warehouse-receive-card warehouse-unified-group '+(open?'open':'collapsed')} key={group.id}>
              <div className="tracking-hub-head-v2 warehouse-unified-group-head">
                <button type="button" className="tracking-hub-toggle" aria-label={(open?'Thu gọn ':'Mở ')+group.code}
                  aria-expanded={open} onClick={()=>toggleGroup(group.id)}><span>{open?'⌄':'›'}</span></button>
                <div className="tracking-hub-identity">
                  <span className={'tracking-hub-priority-dot '+(splitRows.length?'attention':'')}/>
                  <div><b>{group.code==='BG'?'BG - 320 Nguyễn Công Hãng':group.code==='HN'?'HN - 164 Hồng Mai':group.code+' · '+(group.address||group.name)}</b>
                    <small>Kho nhận thực tế theo phiếu nhận hàng</small></div>
                </div>
                <div className="tracking-hub-metrics-v2 warehouse-unified-metrics">
                  <span><b>{group.rows.length}</b> đơn</span>
                  <span className={splitRows.length?'warning':''}><b>{splitRows.length}</b> chờ bóc tách</span>
                  <span className={readyRows.length?'info':''}><b>{readyRows.length}</b> chờ nhập kho</span>
                  <span className={doneRows.length?'success':''}><b>{doneRows.length}</b> đã xử lý</span>
                  <span className="money"><b>{formatMoney(totalCod)}</b> COD</span>
                </div>
                <div className="warehouse-unified-group-column-control">
                  <ManagedColumnsMenu labels={TABLE_LABELS} manager={tableColumns} buttonLabel="Cột"/>
                </div>
              </div>
              {open&&<>
                <div className="warehouse-unified-table-wrap">
                  <table className="table warehouse-unified-table"
                    aria-label={'Danh sách Nhập kho '+group.code}>
                    <colgroup>{tableColumns.visible.map((col,index)=><col key={col}
                      style={{width:columnWidths[index]+'%'}}/>)}</colgroup>
                    <thead><tr>{tableColumns.visible.map(col=><th key={col}>
                      <SortableHeader column={col} label={TABLE_LABELS[col]} sort={tableSort} onSort={tableSort.toggle}/>
                      {col==='order'&&readyIds.length>0&&<input type="checkbox" checked={allReadySelected}
                        onChange={()=>toggleAllReady(group.id,readyIds)} aria-label={'Chọn toàn bộ đơn chờ nhập '+group.code}/>}
                    </th>)}</tr></thead>
                    <tbody>{sorted.length
                      ? sorted.map(row=><tr key={row.id} className={activeId===row.id?'active-row':''}
                          onClick={()=>{setActiveId(row.id);setPanelTab('products');setEditingItem(null)}}>
                          {tableColumns.visible.map(col=>cell(row,col))}
                        </tr>)
                      : <tr><td colSpan={tableColumns.visible.length} className="empty compact">Không có đơn phù hợp.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {groupSelected>0&&<form action={previewOnly?undefined:receiveOrdersIntoWarehouse}
                  onSubmit={previewOnly?event=>event.preventDefault():undefined}
                  className="warehouse-confirm-stock-bar">
                  <div><b>{groupSelected} đơn đã chọn · {group.code}</b>
                    <span>Kho nhận dựa trên phiếu xác nhận thực tế. {previewOnly?'Preview chỉ xem, không ghi tồn kho.':'Nhập kho chỉ sau khi xác nhận.'}</span></div>
                  {selected.filter(id=>readyIds.includes(id)).map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
                  <label><span>Ghi chú nhập kho</span><input name="note" placeholder="Không bắt buộc"/></label>
                  <button className="button primary small" type="submit" disabled={previewOnly}>Xác nhận nhập kho</button>
                  <button className="button small" type="button" onClick={()=>{setSelected([]);setSelectedGroup(null)}}>Bỏ chọn</button>
                </form>}
              </>}
            </section>
          })}
    </section>
    {active&&<aside className="whx-detail-panel warehouse-intake-panel">
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
              <form action={previewOnly?undefined:receiveOrdersIntoWarehouse} onSubmit={previewOnly?event=>event.preventDefault():undefined}>
                <input type="hidden" name="order_ids" value={active.id}/>
                <input type="hidden" name="note" value="Nhập kho nhanh sau khi xác nhận SKU"/>
                <button className="button primary small" type="submit" disabled={previewOnly}>Nhập kho</button>
              </form>
              <form
                action={previewOnly?undefined:skipWarehouseOrder}
                onSubmit={event=>{
                  if(previewOnly||!window.confirm('Bỏ qua kho cho đơn này? Đơn sẽ không ghi tăng tồn kho.')){
                    event.preventDefault()
                  }
                }}
              >
                <input type="hidden" name="order_id" value={active.id}/>
                <input type="hidden" name="note" value="Bỏ qua kho sau khi xác nhận SKU"/>
                <button className="button small warehouse-skip-button" type="submit" disabled={previewOnly}>Bỏ qua kho</button>
              </form>
            </div>
          </div>}

          {active.order_items.map(item=>{
            const mapped=Boolean(item.product_variant_id&&item.product_variants)
            const suggestion=suggestions[item.id]
            const stockQty=Number(item.quantity??0)*Number(item.inventory_multiplier??1)
            const editable=!activeDone&&!activeComplete&&(editingItem===item.id||!mapped)

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

                <form action={previewOnly?undefined:mapWarehouseOrderItem} onSubmit={previewOnly?event=>event.preventDefault():undefined} className="whx-map-form">
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
                    <button className="button primary small" type="submit" disabled={previewOnly}>Lưu bóc tách</button>
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
          <div><span>Trạng thái</span><b>{phaseLabel(active)}</b></div>
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
    </aside>}
  </div>
}
