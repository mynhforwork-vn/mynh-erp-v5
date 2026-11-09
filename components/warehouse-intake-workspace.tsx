'use client'

import { useEffect,useMemo,useRef,useState,type CSSProperties } from 'react'
import { formatDateTime,formatMoney } from '@/lib/format'
import { receiveOrdersIntoWarehouse } from '@/lib/actions/warehouse'
import { WarehouseIntakeDetailPreview } from '@/components/warehouse-intake-detail-preview'
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
  prepaid_amount?:number|string|null
  prepaid_source_label?:string|null
  recipient_name?:string|null
  recipient_phone?:string|null
  recipient_address?:string|null
  area?:string|null
  destination_hub?:string|null
  order_status?:string|null
  payment_status?:string|null
  erp_users?:{username?:string|null}|null
  shipments?:Array<{carrier?:string|null,tracking_number?:string|null,current_tracking_status?:string|null,is_active?:boolean}>|null
  order_vouchers?:Array<{voucher_code?:string|null,voucher_name?:string|null,voucher_type?:string|null,voucher_tag?:string|null}>|null
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
type ItemDecision={
  order_item_id:string
  order_id:string
  product_variant_id:string
  decision:'IN'|'SKIP'
  sale_price:number|string
  multiplier:number
  skip_reason?:string|null
  processing_state:'DRAFT'|'FINALIZED'
  updated_at?:string
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
  itemDecisions={},
  simulate=true,
  previewOnly=false,
  showProcessedOnly=false,
}:{
  rows:Row[]
  variants:Variant[]
  auditLogs:AuditLog[]
  suggestions:Record<string,Suggestion>
  itemDecisions?:Record<string,ItemDecision>
  simulate?:boolean
  previewOnly?:boolean
  showProcessedOnly?:boolean
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
    // Active workspaces only render warehouses with orders requiring action.
    // The completed KPI remains available to inspect every historical receipt.
    return [...map.values()]
      .filter(group=>showProcessedOnly||group.rows.some(row=>!isDone(row)))
      .sort((a,b)=>a.code.localeCompare(b.code,'vi'))
  },[rows,showProcessedOnly])

  const visibleRows=useMemo(()=>groups.flatMap(group=>group.rows),[groups])
  const firstIncomplete=visibleRows.find(row=>!isDone(row)&&!isComplete(row))
    ??visibleRows.find(row=>!isDone(row))
    ??visibleRows[0]??null
  const [activeId,setActiveId]=useState<string|null>(firstIncomplete?.id??null)
  const [openGroups,setOpenGroups]=useState<string[]>(()=>groups.map(group=>group.id))
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null)
  const [selected,setSelected]=useState<string[]>([])
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

  const active=visibleRows.find(row=>row.id===activeId)??null
  useEffect(()=>{
    if(activeId&&!visibleRows.some(row=>row.id===activeId))setActiveId(null)
  },[activeId,visibleRows])
  const selectedSet=useMemo(()=>new Set(selected),[selected])
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
        ? <div className="card empty">{showProcessedOnly
          ? 'Chưa có đơn đã xử lý trong khoảng thời gian đang chọn.'
          : rows.length
            ? 'Các kho đã hết đơn cần xử lý. Chọn KPI Đã xử lý để xem những đơn đã hoàn tất.'
            : 'Không có đơn cần xử lý trong khoảng thời gian và trạng thái đang chọn.'}</div>
        : groups.map(group=>{
            const open=openGroups.includes(group.id)
            const waiting=group.rows.filter(row=>!isDone(row))
            const splitRows=waiting.filter(row=>!isComplete(row))
            // Orders with per-item drafts must use the V2 atomic finalization,
            // never the legacy bulk receipt (which would include skipped items).
            const readyRows=waiting.filter(row=>isComplete(row)
              &&!row.order_items.some(item=>!!itemDecisions[item.id]))
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
                  <button type="button" className="table-link" onClick={event=>{event.stopPropagation();setActiveId(row.id)}}>
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
            return <section className={'card tracking-hub-card tracking-hub-card-v2 warehouse-receive-card warehouse-unified-group '+(open?'open':'collapsed')}
              key={group.id} data-warehouse-code={group.code}
              data-warehouse-rows={group.rows.length}
              data-warehouse-actionable={waiting.length}
              style={{'--warehouse-row-weight':Math.min(group.rows.length,30)} as CSSProperties}>
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
                  <table className="warehouse-unified-table"
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
                          onClick={()=>{setActiveId(row.id)}}>
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
    {active&&<WarehouseIntakeDetailPreview key={active.id}
      order={active} variants={variants} auditLogs={auditLogs}
      suggestions={suggestions} itemDecisions={itemDecisions}
      previewOnly={previewOnly} simulate={simulate}
      onClose={()=>setActiveId(null)}/>}

  </div>
}
