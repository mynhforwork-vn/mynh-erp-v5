'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateTime,formatMoney } from '@/lib/format'
import { resolveOrderValue } from '@/lib/order-prepaid'
import { WarehouseBulkReceiveBar,type BulkOrderPreview } from '@/components/warehouse-bulk-receive-bar'
import { WarehouseInlineSkuHistoryPicker } from '@/components/warehouse-inline-sku-history-picker'
import { WarehouseInlineSkipItem } from '@/components/warehouse-inline-skip-item'
import { bulkReceiveWarehouseOrders,type WarehouseBulkResult } from '@/lib/actions/warehouse-bulk-receive'
import { saveWarehouseItemDecision } from '@/lib/actions/warehouse-item-decisions'
import { WarehouseIntakeDetailPreview } from '@/components/warehouse-intake-detail-preview'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'
import type {HistoricalSuggestion} from '@/lib/warehouse-sku-suggestions'

type SkuProduct={id:string;sku:string;name:string}
type Variant={
  id:string
  variant_name:string
  sale_price?:number|string|null
  products?:{id?:string|null,sku?:string|null,name?:string|null}|null
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
  product_variant_id:string|null
  decision:'IN'|'SKIP'
  sale_price:number|string
  multiplier:number
  skip_reason?:string|null
  processing_state:'DRAFT'|'FINALIZED'
  updated_at?:string
}
type TableCol='order'|'sku'|'product'|'purchase'|'sale'|'status'
const TABLE_COLUMNS:TableCol[]=['order','sku','product','purchase','sale','status']
const TABLE_LABELS:Record<TableCol,string>={
  order:'Mã đơn / Ngày nhận',sku:'SKU bán',product:'Sản phẩm mua',
  purchase:'Giá gốc',sale:'Giá bán',status:'Trạng thái',
}
// Six native columns: receiving date is nested beneath each order code.
// Keep width fitted inside the table, including when the detail slidebar opens.
const COLUMN_BASE:Record<TableCol,number>={
  order:168,sku:190,product:210,purchase:95,sale:95,status:123,
}
const COLUMN_GROW:Record<TableCol,number>={
  order:1.2,sku:3.1,product:4.0,purchase:0.7,sale:0.7,status:1,
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

type Suggestion=HistoricalSuggestion

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
function phaseLabel(row:Row,decisions:Record<string,ItemDecision>={}){
  if(row.warehouse_status==='WAREHOUSE_SKIPPED')return 'Đã bỏ qua kho'
  if(row.warehouse_status==='WAREHOUSE_RECEIVED')return 'Đã nhập kho'
  if(isDone(row))return 'Đã xử lý'
  return isComplete(row,decisions)?'Chờ nhập kho':'Chờ bóc tách'
}
function isComplete(row:Row,decisions:Record<string,ItemDecision>={}){
  return !!bulkPreview(row,decisions)
}

// Bulk actions must validate the same stored item-level decisions that the V2
// RPC requires. An order with any draft must NEVER use legacy bulk receipt.
function bulkPreview(row:Row,decisions:Record<string,ItemDecision>):BulkOrderPreview|null{
  if(row.warehouse_status!=='READY_TO_TRANSFER'||!row.order_items.length)return null
  const saved=row.order_items.map(item=>decisions[item.id])
  const hasDraft=saved.some(Boolean)
  const isLineReady=(item:Item,record:ItemDecision|undefined)=>{
    const quantity=Number(item.quantity)
    if(!Number.isInteger(quantity)||quantity<1)return false
    if(!hasDraft)return !!item.product_variant_id&&
      Number.isInteger(Number(item.inventory_multiplier??1))&&Number(item.inventory_multiplier??1)>0
    if(!record||record.processing_state!=='DRAFT')return false
    const skipped=record.decision==='SKIP'&&!!String(record.skip_reason??'').trim()
    const noSkuSkip=skipped&&!item.product_variant_id&&record.product_variant_id===null&&
      Number(record.multiplier)===1&&Number(record.sale_price)===0
    if(noSkuSkip)return true
    return !!item.product_variant_id&&record.product_variant_id===item.product_variant_id&&
      Number(record.multiplier)===Number(item.inventory_multiplier??1)&&
      Number.isInteger(Number(record.multiplier))&&Number(record.multiplier)>0&&
      Number.isFinite(Number(record.sale_price))&&Number(record.sale_price)>=0&&
      (record.decision==='IN'||skipped)&&
      quantity*Number(record.multiplier)<=2147483647
  }
  if(row.order_items.some((item,index)=>!isLineReady(item,saved[index])))return null
  let stockUnits=0,skippedLines=0
  const items=row.order_items.map((item,index)=>{
    const decision=saved[index]
    const skip=hasDraft&&decision?.decision==='SKIP'
    if(skip)skippedLines++
    const multiplier=skip&&!item.product_variant_id?1:Number(item.inventory_multiplier??1)
    const converted=Number(item.quantity)*multiplier
    if(!skip)stockUnits+=converted
    const variant=item.product_variants
    const salePrice=decision?.sale_price??variant?.sale_price??null
    return {
      id:item.id,name:item.product_name,variant:item.variant??null,
      sku:variant?.products?.sku??null,skuName:variant?.products?.name??null,
      quantity:Number(item.quantity),multiplier,
      stockUnits:skip?0:converted,
      originalPrice:item.original_price??null,discountedPrice:item.final_price??null,
      salePrice,salePriceSource:(decision?'SAVED':variant?.sale_price!==null&&variant?.sale_price!==undefined?'CATALOG':'MISSING') as 'SAVED'|'CATALOG'|'MISSING',
      decision:(skip?'SKIP':'IN') as 'IN'|'SKIP',decisionSaved:!!decision,
      reason:decision?.skip_reason??null
    }
  })
  return {
    id:row.id,label:row.shopee_order_id??row.id.slice(0,8),
    mode:hasDraft?'V2':'LEGACY',lines:row.order_items.length,
    inLines:row.order_items.length-skippedLines,skippedLines,stockUnits,items,
  }
}

export function WarehouseIntakeWorkspace({
  rows,
  variants,
  skuProducts=[],
  auditLogs,
  suggestions,
  itemDecisions={},
  simulate=true,
  previewOnly=false,
  showProcessedOnly=false,
}:{
  rows:Row[]
  variants:Variant[]
  skuProducts?:SkuProduct[]
  auditLogs:AuditLog[]
  suggestions:Record<string,Suggestion[]>
  itemDecisions?:Record<string,ItemDecision>
  simulate?:boolean
  previewOnly?:boolean
  showProcessedOnly?:boolean
}){
  const catalogProducts=useMemo(()=>skuProducts.length?skuProducts:
    [...new Map(variants.filter(v=>v.products?.id).map(v=>[v.products!.id!,{
      id:v.products!.id!,sku:String(v.products?.sku??''),name:String(v.products?.name??'')
    }])).values()], [skuProducts,variants])

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
  // Detail slidebar is opt-in: only an explicit order-code click opens it.
  const [activeId,setActiveId]=useState<string|null>(null)
  const [openGroups,setOpenGroups]=useState<string[]>(()=>groups.map(group=>group.id))
  const knownGroupIds=useRef<Set<string>>(new Set(groups.map(group=>group.id)))
  useEffect(()=>{
    // First-time visible warehouses (e.g. switching All -> Completed)
    // should open automatically. Preserve manual collapse for known groups.
    const fresh=groups.map(group=>group.id).filter(id=>!knownGroupIds.current.has(id))
    groups.forEach(group=>knownGroupIds.current.add(group.id))
    if(fresh.length)setOpenGroups(current=>[...current,...fresh])
  },[groups])
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null)
  const [selected,setSelected]=useState<string[]>([])
  const [bulkReviewGroup,setBulkReviewGroup]=useState<string|null>(null)
  const [bulkFeedback,setBulkFeedback]=useState<WarehouseBulkResult|null>(null)
  const [quickSkuTarget,setQuickSkuTarget]=useState<{
    orderItemId:string;orderLabel:string;productName:string;
    sourceVariant:string|null;quantity:number;left:number;top:number;bottom:number
    initialVariantId:string|null;initialSalePrice:string|null
    initialMultiplier:number;initialDecision:'IN'|'SKIP'|null
    initialSkipReason:string|null;isEditing:boolean
  }|null>(null)
  const [quickSkipTarget,setQuickSkipTarget]=useState<{
    orderItemId:string;orderLabel:string;productName:string;
    left:number;top:number;bottom:number
  }|null>(null)
  const router=useRouter()
  const quickInFlight=useRef(false)
  const quickSkuInFlight=useRef(false)
  const [quickMappingId,setQuickMappingId]=useState<string|null>(null)
  const [quickReceivingId,setQuickReceivingId]=useState<string|null>(null)
  const [quickNotice,setQuickNotice]=useState<{kind:'success'|'error';message:string}|null>(null)
  useEffect(()=>{
    if(!quickNotice)return
    const timeout=setTimeout(()=>setQuickNotice(null),5000)
    return ()=>clearTimeout(timeout)
  },[quickNotice])
  // No client-side shortcut to inventory mutations: a single order goes through
  // the same authenticated, idempotent server validation as batch receipt.
  async function handleQuickReceive(row:Row,warehouseId:string){
    if(previewOnly||quickInFlight.current||!bulkPreview(row,itemDecisions))return
    quickInFlight.current=true
    setQuickReceivingId(row.id)
    setQuickNotice(null)
    setBulkFeedback(null)
    const orderLabel=row.shopee_order_id??row.id.slice(0,8)
    try{
      const result=await bulkReceiveWarehouseOrders({
        warehouseId,orderIds:[row.id],note:''
      })
      if(result.succeeded.includes(row.id)){
        setQuickNotice({kind:'success',message:'Đã nhập kho đơn '+orderLabel})
        router.refresh()
      }else{
        setQuickNotice({kind:'error',message:
          'Chưa nhập được đơn '+orderLabel+' · '+
          (result.failed.find(item=>item.orderId===row.id)?.message??'Vui lòng kiểm tra lại trạng thái đơn.')})
      }
    }catch(error){
      setQuickNotice({kind:'error',message:'Không thể nhập đơn '+orderLabel+' · '+
        (error instanceof Error?error.message:'Vui lòng thử lại.')})
    }finally{
      quickInFlight.current=false
      setQuickReceivingId(null)
    }
  }
  // Display the best ranked historic mapping as an UNSAVED draft, and write
  // only after the operator explicitly clicks its per-item confirmation.
  async function confirmSuggestedSku(row:Row,item:Item,suggestion:HistoricalSuggestion){
    if(previewOnly||isDone(row)||item.product_variant_id||quickSkuInFlight.current)return
    const variant=variants.find(value=>value.id===suggestion.variant_id)
    const rawPrice=variant?.sale_price
    const price=rawPrice===null||rawPrice===undefined||String(rawPrice).trim()===''
      ?NaN:Number(rawPrice)
    const multiplier=Number(suggestion.multiplier)
    if(!variant||!Number.isFinite(price)||price<0||price>999999999||
      !Number.isInteger(multiplier)||multiplier<1||multiplier>100000){
      setQuickNotice({kind:'error',message:'Gợi ý thiếu giá bán hoặc hệ số hợp lệ. Hãy mở Chờ ghép để kiểm tra.'})
      return
    }
    quickSkuInFlight.current=true
    setQuickMappingId(item.id)
    setQuickNotice(null)
    try{
      await saveWarehouseItemDecision({
        orderItemId:item.id,variantId:variant.id,
        newSku:null,newName:null,newVariant:null,
        salePrice:price,multiplier,decision:'IN',skipReason:null
      })
      const sku=variant.products?.sku??'SKU đã chọn'
      setQuickNotice({kind:'success',message:
        'Đã lưu ghép SKU '+sku+' · '+(row.shopee_order_id??row.id.slice(0,8))+
        '. Chưa ghi tăng tồn kho.'})
      router.refresh()
    }catch(error){
      setQuickNotice({kind:'error',message:'Không thể lưu ghép SKU · '+
        (error instanceof Error?error.message:'Vui lòng thử lại.')})
    }finally{
      quickSkuInFlight.current=false
      setQuickMappingId(null)
    }
  }
  function openSkuHistory(event:React.MouseEvent<HTMLButtonElement>,row:Row,item:Item){
    event.stopPropagation()
    const saved=itemDecisions[item.id]
    // A mapped SKU is editable until final stock receipt. The existing
    // server RPC updates only DRAFT decisions and rejects posted stock.
    if(isDone(row)||saved?.processing_state==='FINALIZED'||quickSkuInFlight.current)return
    setQuickSkipTarget(null)
    const rect=event.currentTarget.getBoundingClientRect()
    const mappedVariant=item.product_variant_id??saved?.product_variant_id??null
    const sourcePrice=saved?.sale_price??item.product_variants?.sale_price
    setQuickSkuTarget({
      orderItemId:item.id,orderLabel:row.shopee_order_id??row.id.slice(0,8),
      productName:item.product_name,sourceVariant:item.variant??null,
      quantity:Number(item.quantity),left:rect.left,top:rect.top,bottom:rect.bottom,
      initialVariantId:mappedVariant,
      initialSalePrice:sourcePrice===null||sourcePrice===undefined?'':String(sourcePrice),
      initialMultiplier:Number(saved?.multiplier??item.inventory_multiplier??1),
      initialDecision:saved?.decision??(mappedVariant?'IN':null),
      initialSkipReason:saved?.skip_reason??null,
      isEditing:Boolean(mappedVariant||saved)
    })
  }
  function openSkipItem(event:React.MouseEvent<HTMLButtonElement>,row:Row,item:Item){
    event.stopPropagation()
    if(isDone(row)||item.product_variant_id||itemDecisions[item.id])return
    setQuickSkuTarget(null)
    const rect=event.currentTarget.getBoundingClientRect()
    setQuickSkipTarget({
      orderItemId:item.id,
      orderLabel:row.shopee_order_id??row.id.slice(0,8),
      productName:item.product_name,
      left:rect.left,top:rect.top,bottom:rect.bottom,
    })
  }
  function handleBulkResult(result:WarehouseBulkResult){
    setBulkFeedback(result)
    const failedIds=new Set(result.failed.map(item=>item.orderId))
    setSelected(current=>current.filter(id=>failedIds.has(id)))
    if(!failedIds.size)setSelectedGroup(null)
    setBulkReviewGroup(null)
  }
  useEffect(()=>{
    if(selectedGroup&&!groups.some(group=>group.id===selectedGroup)){
      setSelectedGroup(null)
      setSelected([])
    }
  },[selectedGroup,groups])
  // Independent column visibility/order and sorting for each real receiving warehouse.
  const bgColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-bg-columns-v3',TABLE_COLUMNS,['order'])
  const hnColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-hn-columns-v3',TABLE_COLUMNS,['order'])
  const otherColumns=useManagedColumns<TableCol>('mynh-warehouse-intake-other-columns-v3',TABLE_COLUMNS,['order'])
  const bgSort=useManagedSort<TableCol>('mynh-warehouse-intake-bg-sort-v3','order','desc')
  const hnSort=useManagedSort<TableCol>('mynh-warehouse-intake-hn-sort-v3','order','desc')
  const otherSort=useManagedSort<TableCol>('mynh-warehouse-intake-other-sort-v3','order','desc')
  const laneRef=useRef<HTMLElement|null>(null)
  const [laneWidth,setLaneWidth]=useState(1100)
  // Compact group height is exactly its displayed order count (1 or 2),
  // including the sticky column header. Measure actual row heights because
  // product quantities and breakpoint widths affect content.
  useEffect(()=>{
    const lane=laneRef.current
    if(!lane)return
    const cleanups:(()=>void)[]=[]
    const compactGroups=lane.querySelectorAll<HTMLElement>(
      '.warehouse-unified-group.open.warehouse-rows-one, .warehouse-unified-group.open.warehouse-rows-two')
    compactGroups.forEach(group=>{
      const wrap=group.querySelector<HTMLElement>('.warehouse-unified-table-wrap')
      const table=wrap?.querySelector('table')
      const head=table?.tHead
      const body=table?.tBodies[0]
      if(!wrap||!head||!body)return
      const count=group.dataset.warehouseRowMode==='two'?2:1
      const rows=()=>Array.from(body.rows).slice(0,count)
      let tracked=rows()
      const sync=()=>{
        const actual=rows()
        if(actual.length!==count)return
        const height=Math.ceil(head.getBoundingClientRect().height+
          actual.reduce((sum,row)=>sum+row.getBoundingClientRect().height,0)+1)
        if(height>0&&height<2000){
          const value=height+'px'
          if(wrap.style.getPropertyValue('--warehouse-compact-order-height')!==value){
            wrap.style.setProperty('--warehouse-compact-order-height',value)
          }
        }
      }
      const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(sync)
      observer?.observe(head)
      tracked.forEach(row=>observer?.observe(row))
      const mutation=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{
        const next=rows()
        tracked.filter(row=>!next.includes(row)).forEach(row=>observer?.unobserve(row))
        next.filter(row=>!tracked.includes(row)).forEach(row=>observer?.observe(row))
        tracked=next
        sync()
      })
      mutation?.observe(body,{childList:true})
      sync()
      cleanups.push(()=>{observer?.disconnect();mutation?.disconnect()})
    })
    return ()=>cleanups.forEach(cleanup=>cleanup())
  },[groups,openGroups,laneWidth,activeId])
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
    setBulkReviewGroup(null)
    if(selectedGroup!==groupId){
      setSelectedGroup(groupId)
      setSelected([id])
      return
    }
    setSelected(current=>current.includes(id)
      ? current.filter(x=>x!==id)
      : current.length>=25?current:[...current,id])
  }

  function toggleAllReady(groupId:string,readyIds:string[]){
    const capped=readyIds.slice(0,25)
    const all=selectedGroup===groupId&&capped.every(id=>selectedSet.has(id))
    setBulkReviewGroup(null)
    if(all){
      setSelected([])
      setSelectedGroup(null)
      return
    }
    setSelectedGroup(groupId)
    setSelected(capped)
  }

  return <div className={'whx-intake-layout warehouse-intake-layout warehouse-intake-preview-layout '+(active?'with-panel':'')}>
    <section ref={laneRef} className={'whx-intake-main tracking-hub-stack tracking-hub-stack-v2 warehouse-receive-groups warehouse-receive-table-lane'+
      (groups.length===2&&groups.every(group=>group.rows.length>2&&openGroups.includes(group.id))
        ?' warehouse-equal-halves':'')}>
      {quickNotice&&<div className={'warehouse-quick-notice '+quickNotice.kind}
        role={quickNotice.kind==='error'?'alert':'status'}>
        <span>{quickNotice.message}</span>
        <button type="button" aria-label="Đóng thông báo nhập nhanh"
          onClick={()=>setQuickNotice(null)}>×</button>
      </div>}
      {bulkFeedback&&<div className="warehouse-bulk-feedback" role="status">
        <div>
          <b>{bulkFeedback.succeeded.length} đơn đã xử lý thành công · {bulkFeedback.failed.length} đơn chưa xử lý</b>
          <span>Đơn hoàn thành không được nhập lại. Các đơn lỗi có thể kiểm tra và chọn lại.</span>
          {bulkFeedback.failed.length>0&&<ul>{bulkFeedback.failed.map(row=>
            <li key={row.orderId}>{rows.find(order=>order.id===row.orderId)?.shopee_order_id??row.orderId} · {row.message}</li>)}</ul>}
        </div>
        <button type="button" aria-label="Đóng kết quả nhập hàng loạt" onClick={()=>setBulkFeedback(null)}>×</button>
      </div>}
      {!groups.length
        ? <div className="card empty">{showProcessedOnly
          ? 'Chưa có đơn đã xử lý trong khoảng thời gian đang chọn.'
          : rows.length
            ? 'Các kho đã hết đơn cần xử lý. Chọn KPI Đã xử lý để xem những đơn đã hoàn tất.'
            : 'Không có đơn cần xử lý trong khoảng thời gian và trạng thái đang chọn.'}</div>
        : groups.map(group=>{
            const open=openGroups.includes(group.id)
            const waiting=group.rows.filter(row=>!isDone(row))
            const splitRows=waiting.filter(row=>!isComplete(row,itemDecisions))
            // Include both orders with complete V2 decisions and legacy
            // fully mapped orders. Exclude partial or stale decisions.
            const readyRows=waiting.filter(row=>!!bulkPreview(row,itemDecisions))
            const doneRows=group.rows.filter(isDone)
            const tableColumns=group.code==='BG'?bgColumns:group.code==='HN'?hnColumns:otherColumns
            const tableSort=group.code==='BG'?bgSort:group.code==='HN'?hnSort:otherSort
            const sorted=[...group.rows].sort((left,right)=>{
              const key=(row:Row,col:TableCol):number|string=>{
                if(col==='order')return new Date(receivedAt(row)??0).getTime()
                if(col==='sku')return String(row.order_items[0]?.product_variants?.products?.sku??'')
                if(col==='product')return row.order_items[0]?.product_name??''
                if(col==='purchase')return Number(row.order_items[0]?.original_price??0)
                if(col==='sale')return Number(itemDecisions[row.order_items[0]?.id]?.sale_price??row.order_items[0]?.product_variants?.sale_price??0)
                return phaseLabel(row,itemDecisions)
              }
              const x=key(left,tableSort.key),y=key(right,tableSort.key)
              const cmp=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'vi')
              return tableSort.dir==='asc'?cmp:-cmp
            })
            const totalCod=group.rows.reduce((sum,row)=>sum+Number(row.cod??0),0)
            const readyIds=readyRows.map(row=>row.id)
            const cappedIds=readyIds.slice(0,25)
            const allReadySelected=cappedIds.length>0&&selectedGroup===group.id&&cappedIds.every(id=>selectedSet.has(id))
            const partiallyReadySelected=selectedGroup===group.id
              &&cappedIds.some(id=>selectedSet.has(id))&&!allReadySelected
            const selectedOrders=(selectedGroup===group.id
              ? selected.filter(id=>readyIds.includes(id))
              : []).map(id=>readyRows.find(row=>row.id===id))
                .filter((row):row is Row=>!!row)
                .map(row=>bulkPreview(row,itemDecisions))
                .filter((item):item is BulkOrderPreview=>!!item)
            const groupSelected=selectedOrders.length
            // 0: hidden, 1–2: exact height of all listed orders, 3+: elastic.
            // Two dense warehouses share equal halves of the available lane.
            const groupRowMode=group.rows.length===1?'one':group.rows.length===2?'two':'many'
            const columnWidths=autoFitColumnWidths(tableColumns.visible,laneWidth)
            const cell=(row:Row,col:TableCol)=>{
              const attributes={'data-col':col,'data-label':TABLE_LABELS[col]}
              if(col==='order')return <td key={col} {...attributes}>
                <div className="warehouse-unified-order">
                  {readyIds.length>0&&(!!bulkPreview(row,itemDecisions)
                    ?<label className="warehouse-bulk-select-control" onClick={event=>event.stopPropagation()}>
                      <input type="checkbox" className="warehouse-bulk-select-checkbox"
                        checked={selectedGroup===group.id&&selectedSet.has(row.id)}
                        onChange={()=>toggleReady(group.id,row.id)}
                        aria-label={'Chọn '+(row.shopee_order_id??row.id)}/>
                      <span className="warehouse-bulk-select-mark" aria-hidden="true"/>
                    </label>
                    :<span className="warehouse-bulk-select-spacer" aria-hidden="true"/>)}
                  <div className="warehouse-unified-order-details">
                    <div className="warehouse-unified-order-inline">
                      <button type="button" className="table-link"
                        onClick={event=>{event.stopPropagation();setActiveId(row.id)}}>
                        {row.shopee_order_id??row.id.slice(0,8)}
                      </button>
                      {!showProcessedOnly&&!!bulkPreview(row,itemDecisions)&&
                        <button type="button" className="warehouse-order-quick-receive"
                          title={previewOnly?'Preview chỉ xem, không ghi tồn kho':'Nhập nhanh đơn '+(row.shopee_order_id??row.id)}
                          aria-label={'Nhập nhanh đơn '+(row.shopee_order_id??row.id)}
                          aria-busy={quickReceivingId===row.id}
                          disabled={previewOnly||quickReceivingId!==null}
                          onClick={event=>{
                            event.stopPropagation()
                            void handleQuickReceive(row,group.id)
                          }}>
                          {quickReceivingId===row.id
                            ?<span className="warehouse-quick-spinner" aria-hidden="true"/>
                            :<svg viewBox="0 0 16 16" width="15" height="15" fill="none"
                              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                              strokeLinejoin="round" aria-hidden="true">
                              <path d="M8 2v8m-3-3 3 3 3-3M2.5 11.5v2h11v-2"/>
                            </svg>}
                        </button>}
                    </div>
                    <time className="warehouse-unified-received-at" title="Ngày nhận thực tế">
                      {receivedAt(row)?formatDateTime(receivedAt(row)):'Chưa có ngày nhận'}
                    </time>
                    {!isDone(row)&&!isComplete(row,itemDecisions)&&
                      <span className="warehouse-unified-pending-value" title="Giá trị đơn hàng theo thông tin thanh toán">
                        Giá trị đơn: <strong>{(()=>{
                          const value=resolveOrderValue({
                            paymentStatus:row.payment_status,
                            prepaidAmount:row.prepaid_amount,
                            cod:row.cod,
                          })
                          return value===null?'Chưa đủ dữ liệu':formatMoney(value)
                        })()}</strong>
                      </span>}
                  </div>
                </div>
              </td>
              const linePrice=(value:number|string|null|undefined)=>{
                if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return 'Chưa có'
                return formatMoney(value)
              }
              if(col==='sku')return <td key={col} {...attributes} className="warehouse-unified-skus">
                {row.order_items.map(item=>{
                  const historical=(suggestions[item.id]??[])
                    .filter(option=>variants.some(variant=>variant.id===option.variant_id))
                  const saved=itemDecisions[item.id]
                  const canSuggest=!isDone(row)&&!item.product_variant_id&&!saved
                  const canRevise=!isDone(row)&&saved?.processing_state!=='FINALIZED'&&
                    Boolean(item.product_variant_id||saved)
                  const canOpenSku=canSuggest||canRevise
                  const proposed=historical[0]
                  const variant=proposed?variants.find(value=>value.id===proposed.variant_id):null
                  const price=variant?.sale_price
                  const validPrice=price!==null&&price!==undefined&&String(price).trim()!==''&&
                    Number.isFinite(Number(price))&&Number(price)>=0&&Number(price)<=999999999
                  const validFactor=!!proposed&&Number.isInteger(Number(proposed.multiplier))&&
                    Number(proposed.multiplier)>0&&Number(proposed.multiplier)<=100000
                  const canConfirm=canSuggest&&!!variant&&validPrice&&validFactor
                  return <div key={item.id} className="warehouse-unified-product-line"
                    title={[item.product_variants?.products?.sku??'Chưa ghép SKU',item.product_variants?.products?.name].filter(Boolean).join(' · ')}>
                    <span className="warehouse-unified-sku-identity">
                      {canOpenSku&&<span className="warehouse-inline-sku-pair"><button type="button"
                        className={'warehouse-inline-sku-trigger'+(canRevise?' warehouse-inline-sku-edit-trigger':'')}
                        title={canRevise?'Sửa ghép SKU đã lưu · Chưa chốt nhập kho':
                          historical.length?'Ghép SKU nhanh · '+historical.length+' gợi ý từ lịch sử':
                            'Ghép SKU nhanh · Tìm hoặc tạo SKU mới'}
                        aria-label={canRevise?'Sửa ghép SKU '+(item.product_variants?.products?.sku??'đã lưu')+' cho '+item.product_name:
                          'Chờ ghép SKU · '+historical.length+' gợi ý cho '+item.product_name}
                        aria-haspopup="dialog" aria-expanded={quickSkuTarget?.orderItemId===item.id}
                        onClick={event=>openSkuHistory(event,row,item)}>
                        {canRevise
                          ?<>{item.product_variants?.products?.sku??'Bỏ qua kho'}
                            <svg viewBox="0 0 16 16" width="11" height="11" fill="none"
                              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                              strokeLinejoin="round" aria-hidden="true">
                              <path d="M9.6 3.2l3.2 3.2M3 13l3.5-.8 6.6-6.6a1.8 1.8 0 0 0-2.6-2.6L4 9.6 3 13z"/>
                            </svg></>
                          :proposed&&variant
                            ?<>{variant.products?.sku??'SKU gợi ý'}
                              {historical.length>1&&<small>+{historical.length-1}</small>}</>
                            :'Chờ ghép'}
                      </button>
                      {canSuggest&&proposed&&variant&&
                        <button type="button" className="warehouse-inline-sku-confirm"
                          title={canConfirm
                            ?'Lưu ghép SKU '+(variant.products?.sku??'SKU')+' từ lịch sử · Chưa ghi tồn kho'
                            :'Gợi ý thiếu giá hoặc hệ số hợp lệ. Hãy mở để kiểm tra'}
                          aria-label={'Xác nhận ghép SKU '+(variant.products?.sku??'SKU')+' cho '+item.product_name}
                          disabled={previewOnly||quickMappingId!==null||!canConfirm}
                          aria-busy={quickMappingId===item.id}
                          onClick={event=>{
                            event.stopPropagation()
                            void confirmSuggestedSku(row,item,proposed)
                          }}>
                          {quickMappingId===item.id
                            ?<span className="warehouse-quick-spinner" aria-hidden="true"/>
                            :<svg viewBox="0 0 16 16" width="11" height="11" fill="none"
                              stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
                              strokeLinejoin="round" aria-hidden="true">
                              <path d="m3 8 3.2 3.2L13 4.5"/>
                            </svg>}
                        </button>}
                      {canSuggest&&<button type="button" className="warehouse-inline-item-skip-trigger"
                        title={'Bỏ qua kho sản phẩm '+item.product_name+' · Không cần ghép SKU'}
                        aria-label={'Bỏ qua kho sản phẩm '+item.product_name}
                        aria-haspopup="dialog" aria-expanded={quickSkipTarget?.orderItemId===item.id}
                        onClick={event=>openSkipItem(event,row,item)}>
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none"
                          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
                          strokeLinejoin="round" aria-hidden="true">
                          <circle cx="8" cy="8" r="5.5"/>
                          <path d="M4.2 11.8 11.8 4.2"/>
                        </svg>
                      </button>}</span>}
                      {!canOpenSku&&<b title={isDone(row)?'Đơn đã chốt xử lý kho, không thể sửa trực tiếp':''}>
                        {saved?.decision==='SKIP'&&!item.product_variant_id?'Bỏ qua kho':
                          item.product_variants?.products?.sku??'Chưa ghép'}</b>}
                      {item.product_variants?.products?.name&&
                        <span className="warehouse-unified-sku-title">{item.product_variants.products.name}</span>}
                    </span>
                  </div>
                })}
              </td>
              if(col==='product')return <td key={col} {...attributes} className="warehouse-unified-products">
                {row.order_items.length?row.order_items.map(item=><div key={item.id} className="warehouse-unified-product-line"
                  title={[item.product_name,item.variant,'SL '+item.quantity].filter(Boolean).join(' · ')}>
                  <span className="warehouse-unified-product-name">{item.product_name}{item.variant?' · '+item.variant:''}</span>
                  <span className="warehouse-unified-product-qty">×{item.quantity}</span>
                </div>):'Chưa có sản phẩm'}
              </td>
              if(col==='purchase')return <td key={col} {...attributes} className="money warehouse-unified-prices">
                {row.order_items.map(item=><div key={item.id} className="warehouse-unified-product-line"
                  title={'Giá gốc/SP: '+linePrice(item.original_price)+' · Sau giảm/SP: '+linePrice(item.final_price)}>
                  <span className="warehouse-unified-product-name">{linePrice(item.original_price)}</span>
                </div>)}
              </td>
              if(col==='sale')return <td key={col} {...attributes} className="money warehouse-unified-prices">
                {row.order_items.map(item=>{
                  const saved=itemDecisions[item.id]
                  const price=saved?.sale_price??item.product_variants?.sale_price
                  return <div key={item.id} className="warehouse-unified-product-line"
                    title={(saved?'Giá bán đã lưu: ':'Giá bán danh mục: ')+linePrice(price)}>
                    <span className="warehouse-unified-product-name">{linePrice(price)}</span>
                  </div>
                })}
              </td>
              return <td key={col} {...attributes} className="warehouse-unified-status">
                {row.order_items.map(item=>{
                  const saved=itemDecisions[item.id]
                  // A finalized order can contain BOTH incoming and skipped items.
                  // Derive the badge from each item's decision, not the entire
                  // order's completion status (which previously painted SKIP green).
                  const finalized=isDone(row)
                  const status=saved?.decision==='SKIP'?(finalized?'Bỏ qua kho':'Dự kiến bỏ qua'):
                    saved?.decision==='IN'?(finalized?'Đã nhập kho':'Dự kiến nhập'):
                    finalized?phaseLabel(row,itemDecisions):
                    item.product_variant_id?'Dự kiến nhập':'Chưa ghép'
                  const tone=saved?.decision==='SKIP'
                    ?(finalized?'skipped':'planned-skip'):
                    saved?.decision==='IN'
                      ?(finalized?'received':'planned-in'):
                    row.warehouse_status==='WAREHOUSE_SKIPPED'?'skipped':
                    row.warehouse_status==='WAREHOUSE_RECEIVED'?'received':
                    row.warehouse_status==='WAREHOUSE_MIXED'?'mixed':
                    item.product_variant_id?'planned-in':'unmapped'
                  return <div key={item.id} className="warehouse-unified-product-line"
                    title={saved?status+' · Đã lưu quyết định'+(saved.skip_reason?' · '+saved.skip_reason:''):status}>
                    <span data-warehouse-status={tone}
                      className={'status-pill warehouse-status-'+tone}>{status}</span>
                  </div>
                })}
              </td>
            }
            return <section className={'card tracking-hub-card tracking-hub-card-v2 warehouse-receive-card warehouse-unified-group warehouse-rows-'+groupRowMode+' '+(open?'open':'collapsed')+(groupSelected>0?' with-bulk-selection':'')}
              key={group.id} data-warehouse-code={group.code}
              data-warehouse-rows={group.rows.length}
              data-warehouse-row-mode={groupRowMode}
              data-warehouse-actionable={waiting.length}>
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
                  {!showProcessedOnly&&<button type="button"
                    className="button small warehouse-bulk-shortcut"
                    disabled={!readyIds.length}
                    title={readyIds.length
                      ? readyIds.length+' đơn đủ điều kiện · tối đa 25 đơn/lượt'
                      : 'Chưa có đơn đã ghép SKU và lưu đủ quyết định kho'}
                    onClick={()=>{
                      setSelectedGroup(group.id)
                      setSelected(readyIds.slice(0,25))
                      setBulkReviewGroup(group.id)
                      setBulkFeedback(null)
                    }}>
                    Nhập kho hàng loạt
                  </button>}
                  <ManagedColumnsMenu labels={TABLE_LABELS} manager={tableColumns} buttonLabel="Cột"/>
                </div>
              </div>
              {open&&<>
                <div className="warehouse-unified-table-wrap">
                  <table className="warehouse-unified-table"
                    aria-label={'Danh sách Nhập kho '+group.code}>
                    <colgroup>{tableColumns.visible.map((col,index)=><col key={col}
                      style={{width:columnWidths[index]+'%'}}/>)}</colgroup>
                    <thead><tr>{tableColumns.visible.map(col=><th key={col} data-col={col}>
                      {col==='order'?<div className="warehouse-unified-order-head">
                        {readyIds.length>0&&<label className="warehouse-bulk-select-control">
                          <input type="checkbox" className="warehouse-bulk-select-checkbox"
                            checked={allReadySelected} data-partial={partiallyReadySelected?'true':undefined}
                            aria-checked={partiallyReadySelected?'mixed':allReadySelected}
                            onChange={()=>toggleAllReady(group.id,readyIds)}
                            aria-label={'Chọn tối đa 25 đơn chờ nhập '+group.code}/>
                          <span className="warehouse-bulk-select-mark" aria-hidden="true"/>
                        </label>}
                        <SortableHeader column={col} label={TABLE_LABELS[col]} sort={tableSort} onSort={tableSort.toggle}/>
                      </div>:<SortableHeader column={col} label={TABLE_LABELS[col]} sort={tableSort} onSort={tableSort.toggle}/>}
                    </th>)}</tr></thead>
                    <tbody>{sorted.length
                      ? sorted.map(row=><tr key={row.id} className={activeId===row.id?'active-row':''}>
                          {tableColumns.visible.map(col=>cell(row,col))}
                        </tr>)
                      : <tr><td colSpan={tableColumns.visible.length} className="empty compact">Không có đơn phù hợp.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {groupSelected>0&&<WarehouseBulkReceiveBar
                  warehouseId={group.id} warehouseCode={group.code}
                  orders={selectedOrders} previewOnly={previewOnly}
                  reviewOpen={bulkReviewGroup===group.id}
                  onReview={()=>setBulkReviewGroup(group.id)}
                  onCancel={()=>{
                    setSelected([])
                    setSelectedGroup(null)
                    setBulkReviewGroup(null)
                  }}
                  onOpenOrder={id=>{setBulkReviewGroup(null);setActiveId(id)}}
                  onResult={handleBulkResult}
                />}
              </>}
            </section>
          })}
    </section>
    {quickSkipTarget&&<WarehouseInlineSkipItem
      key={quickSkipTarget.orderItemId}
      target={quickSkipTarget} previewOnly={previewOnly}
      onClose={()=>setQuickSkipTarget(null)}
      onSaved={message=>setQuickNotice({kind:'success',message})}
    />}
    {quickSkuTarget&&<WarehouseInlineSkuHistoryPicker
      key={quickSkuTarget.orderItemId}
      target={quickSkuTarget}
      history={suggestions[quickSkuTarget.orderItemId]??[]}
      variants={variants} skuProducts={catalogProducts} previewOnly={previewOnly}
      onClose={()=>setQuickSkuTarget(null)}
      onSaved={label=>setQuickNotice({kind:'success',message:
        (quickSkuTarget.isEditing?'Đã cập nhật ghép SKU cho đơn ':'Đã lưu ghép SKU cho đơn ')+
        label+' · Chưa nhập kho.'})}
    />}
    {active&&<WarehouseIntakeDetailPreview key={active.id}
      order={active} variants={variants} skuProducts={catalogProducts} auditLogs={auditLogs}
      suggestions={suggestions} itemDecisions={itemDecisions}
      previewOnly={previewOnly} simulate={simulate}
      onClose={()=>setActiveId(null)}/>}

  </div>
}
