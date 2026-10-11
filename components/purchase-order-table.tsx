'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { formatDateTime, formatMoney, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { orderIsCancelled } from '@/lib/purchase-order-cancellation'
import { normalizeLegacyVisibleColumns,normalizeLegacyColumnOrder } from '@/lib/table-column-preferences'
import {
  archiveOrdersBulk,
  quickAddTrackingNumber,
  restoreOrdersBulk,
} from '@/lib/actions/core'

type Row=Record<string,any>
type CarrierConfig={
  id:string
  carrier_code:string
  display_name:string
  tracking_prefixes?:string[]|null
}
type ColKey='number'|'order'|'username'|'device'|'time'|'product'|'cod'|'tracking'|'voucher'|'status'
type SortKey='order_asc'|'order_desc'|'username_asc'|'username_desc'|'time_new'|'time_old'|'cod_desc'|'cod_asc'|'status_asc'|'status_desc'

const ALL:ColKey[]=['number','order','username','device','time','product','cod','tracking','voucher','status']
const LABELS:Record<ColKey,string>={
  number:'#',
  order:'Mã đơn',
  username:'Username',
  device:'Thiết bị',
  time:'Thời gian đặt',
  product:'Sản phẩm',
  cod:'COD',
  tracking:'Vận chuyển',
  voucher:'Voucher',
  status:'Xử lý',
}
const STORAGE_COLUMNS='mynh-v5-purchase-order-columns'
const STORAGE_COLUMN_ORDER='mynh-v5-purchase-order-column-order'
const STORAGE_SORT='mynh-v5-purchase-order-sort'
const STORAGE_DEVICE_MIGRATION='mynh-v5-purchase-order-device-v1'
const STORAGE_SHIPPING_MIGRATION='mynh-v5-purchase-order-shipping-v2'

function activeShipment(order:Row){
  return (order?.shipments??[]).find((x:any)=>x.is_active)??order?.shipments?.[0]??null
}
function productSummary(items:any[]){
  if(!items?.length)return '—'
  const first=items[0]
  const name=[first.product_name,first.variant].filter(Boolean).join(' · ')
  return items.length>1?name+' +'+(items.length-1):name
}
function voucherSummary(vouchers:any[]){
  if(!vouchers?.length)return ''
  return [...new Set(
    vouchers
      .map(v=>String(v.voucher_tag??'').trim())
      .filter(Boolean)
  )].join(' · ')
}
function statusKey(row:Row){
  if(orderIsCancelled(row))return 'CANCELLED'
  if(row.shipping_service==='EXPRESS')return ['EXPRESS',row.receive_status??''].join(' ')
  const s=activeShipment(row)?.current_tracking_status??''
  return [s,row.receive_status??''].join(' ')
}
function sortIndicator(sort:SortKey,asc:SortKey,desc:SortKey){
  if(sort===asc)return '↑'
  if(sort===desc)return '↓'
  return '↕'
}
function ColumnIcon(){
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2"/>
    <path d="M9 5v14M15 5v14"/>
  </svg>
}


function QuickTrackingEditor({
  orderId,
  returnQuery,
  carrierConfigs,
  isExpress=false,
}:{
  orderId:string
  returnQuery:string
  carrierConfigs:CarrierConfig[]
  isExpress?:boolean
}){
  const [editing,setEditing]=useState(false)
  const [trackingNumber,setTrackingNumber]=useState('')
  const [carrierId,setCarrierId]=useState('')

  function changeTracking(value:string){
    setTrackingNumber(value)
    const upper=value.trim().toUpperCase()
    const matched=carrierConfigs.find(row=>
      (row.tracking_prefixes??[]).some(prefix=>{
        const p=String(prefix??'').trim().toUpperCase()
        return Boolean(p)&&upper.startsWith(p)
      })
    )
    setCarrierId(matched?.id??'')
  }

  if(!editing){
    return <button
      type="button"
      className="quick-tracking-trigger"
      onClick={()=>setEditing(true)}
      title="Cập nhật nhanh mã vận đơn"
    >
      + MVĐ
    </button>
  }

  return <form action={quickAddTrackingNumber} className="quick-tracking-form">
    <input type="hidden" name="order_id" value={orderId}/>
    <input type="hidden" name="return_query" value={returnQuery}/>
    <input
      name="tracking_number"
      value={trackingNumber}
      onChange={e=>changeTracking(e.target.value)}
      placeholder="Mã vận đơn"
      autoFocus
      required
    />
    {!isExpress&&<select name="carrier_config_id" value={carrierId} onChange={e=>setCarrierId(e.target.value)} required>
      <option value="" disabled>ĐVVC</option>
      {carrierConfigs.map(row=><option key={row.id} value={row.id}>{row.carrier_code}</option>)}
    </select>}
    <button type="submit" className="quick-tracking-save">Lưu</button>
    <button type="button" className="quick-tracking-cancel" onClick={()=>setEditing(false)} aria-label="Hủy">×</button>
  </form>
}

export function PurchaseOrderTable({
  rows,
  selectedId,
  baseQuery='',
  canEdit=false,
  carrierConfigs=[],
}:{
  rows:Row[]
  selectedId?:string|null
  baseQuery?:string
  canEdit?:boolean
  carrierConfigs?:CarrierConfig[]
}){
  const [visible,setVisible]=useState<ColKey[]>(ALL)
  const [columnOrder,setColumnOrder]=useState<ColKey[]>(ALL)
  const [open,setOpen]=useState(false)
  const [sort,setSort]=useState<SortKey>('time_new')
  const [selected,setSelected]=useState<string[]>([])
  const [draggingColumn,setDraggingColumn]=useState<ColKey|null>(null)
  const [dragOverColumn,setDragOverColumn]=useState<ColKey|null>(null)
  const draggingRef=useRef<ColKey|null>(null)
  const tableWrapRef=useRef<HTMLDivElement|null>(null)
  const columnManagerRef=useRef<HTMLDivElement|null>(null)
  const [toolbarRoot,setToolbarRoot]=useState<HTMLElement|null>(null)
  useEffect(()=>{setToolbarRoot(document.getElementById('p1-order-toolbar-actions'))},[])

  useEffect(()=>{
    try{
      // Introduce Device once into existing saved column preferences.
      // Afterwards users can hide it permanently without the migration undoing it.
      const needsMigration=!localStorage.getItem(STORAGE_DEVICE_MIGRATION)
      const needsShippingMigration=!localStorage.getItem(STORAGE_SHIPPING_MIGRATION)
      const mergedShipping=(keys:string[])=>{
        if(!needsShippingMigration||!keys.includes('carrier'))return keys
        const next=keys.filter(k=>k!=='carrier')
        if(!next.includes('tracking')){
          const i=keys.indexOf('carrier')
          next.splice(Math.min(i,next.length),0,'tracking')
        }
        return next
      }
      const withDevice=(keys:string[])=>{
        if(keys.includes('device'))return keys
        const next=[...keys]
        const pos=next.indexOf('username')
        next.splice(pos<0?next.length:pos+1,0,'device')
        return next
      }
      const raw=localStorage.getItem(STORAGE_COLUMNS)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed)){
          const columns=normalizeLegacyVisibleColumns<ColKey>(
            needsMigration?withDevice(mergedShipping(parsed)):mergedShipping(parsed),ALL,['order'])
          setVisible(columns)
          if(needsMigration)localStorage.setItem(STORAGE_COLUMNS,JSON.stringify(columns))
        }
      }
      const rawOrder=localStorage.getItem(STORAGE_COLUMN_ORDER)
      if(rawOrder){
        const parsedOrder=JSON.parse(rawOrder)
        if(Array.isArray(parsedOrder)){
          const columns=normalizeLegacyColumnOrder<ColKey>(
            needsMigration?withDevice(mergedShipping(parsedOrder)):mergedShipping(parsedOrder),ALL)
          setColumnOrder(columns)
          if(needsMigration)localStorage.setItem(STORAGE_COLUMN_ORDER,JSON.stringify(columns))
        }
      }
      if(needsMigration)localStorage.setItem(STORAGE_DEVICE_MIGRATION,'1')
      if(needsShippingMigration)localStorage.setItem(STORAGE_SHIPPING_MIGRATION,'1')
      const savedSort=localStorage.getItem(STORAGE_SORT) as SortKey|null
      if(savedSort)setSort(savedSort)
    }catch{}
  },[])

  useEffect(()=>{
    if(!selectedId)return
    const timer=window.setTimeout(()=>{
      const row=tableWrapRef.current?.querySelector('tr[data-selected="true"]')
      row?.scrollIntoView({block:'nearest',behavior:'smooth'})
    },0)
    return ()=>window.clearTimeout(timer)
  },[selectedId,sort,visible])

  useEffect(()=>{
    if(!open)return
    const onPointerDown=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!columnManagerRef.current?.contains(event.target))setOpen(false)
    }
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return ()=>{
      document.removeEventListener('pointerdown',onPointerDown)
      document.removeEventListener('keydown',onKeyDown)
    }
  },[open])

  function persistColumns(next:ColKey[]){
    setVisible(next)
    try{localStorage.setItem(STORAGE_COLUMNS,JSON.stringify(next))}catch{}
  }
  function persistColumnOrder(next:ColKey[]){
    setColumnOrder(next)
    try{localStorage.setItem(STORAGE_COLUMN_ORDER,JSON.stringify(next))}catch{}
  }
  function reorderColumn(source:ColKey,target:ColKey){
    if(source===target)return
    const next=columnOrder.filter(k=>k!==source)
    const targetIndex=next.indexOf(target)
    if(targetIndex<0)return
    next.splice(targetIndex,0,source)
    persistColumnOrder(next)
  }
  function resetColumns(){
    persistColumns(ALL)
    persistColumnOrder(ALL)
  }
  function toggleColumn(key:ColKey){
    if(key==='order')return
    const next=visible.includes(key)?visible.filter(x=>x!==key):ALL.filter(x=>x===key||visible.includes(x))
    persistColumns(next)
  }
  function changeSort(next:SortKey){
    setSort(next)
    try{localStorage.setItem(STORAGE_SORT,next)}catch{}
  }
  function hrefForUser(id:string){
    const p=new URLSearchParams(baseQuery)
    p.set('account',id)
    p.set('accountTab','info')
    p.delete('backUser')
    p.delete('mode')
    p.delete('settings')
    return '/purchase/orders?'+p.toString()
  }
  function hrefFor(id:string){
    const p=new URLSearchParams(baseQuery)
    p.set('order',id)
    p.delete('mode')
    p.delete('settings')
    p.delete('user')
    p.delete('account')
    p.delete('accountTab')
    p.delete('backUser')
    return '/purchase/orders?'+p.toString()
  }
  function isVisible(key:ColKey){return visible.includes(key)}

  const sorted=useMemo(()=>{
    const next=[...rows]
    next.sort((a,b)=>{
      if(sort==='order_asc')return String(a.shopee_order_id??'').localeCompare(String(b.shopee_order_id??''),'vi')
      if(sort==='order_desc')return String(b.shopee_order_id??'').localeCompare(String(a.shopee_order_id??''),'vi')
      if(sort==='username_asc')return String(a.erp_users?.username??'').localeCompare(String(b.erp_users?.username??''),'vi')
      if(sort==='username_desc')return String(b.erp_users?.username??'').localeCompare(String(a.erp_users?.username??''),'vi')
      if(sort==='time_old')return new Date(a.order_date??0).getTime()-new Date(b.order_date??0).getTime()
      if(sort==='cod_desc')return Number(b.cod??0)-Number(a.cod??0)
      if(sort==='cod_asc')return Number(a.cod??0)-Number(b.cod??0)
      if(sort==='status_asc')return statusKey(a).localeCompare(statusKey(b),'vi')
      if(sort==='status_desc')return statusKey(b).localeCompare(statusKey(a),'vi')
      return new Date(b.order_date??0).getTime()-new Date(a.order_date??0).getTime()
    })
    return next
  },[rows,sort])

  useEffect(()=>{
    const valid=new Set(rows.map((x:any)=>String(x.id)))
    setSelected(prev=>prev.filter(id=>valid.has(id)))
  },[rows])

  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const selectedRows=useMemo(
    ()=>sorted.filter((row:any)=>selectedSet.has(String(row.id))),
    [sorted,selectedSet]
  )
  const allSelected=sorted.length>0&&sorted.slice(0,200).every((row:any)=>selectedSet.has(String(row.id)))
  const selectedArchived=selectedRows.length>0&&selectedRows.every((row:any)=>Boolean(row.archived_at))

  function toggleSelect(id:string){
    setSelected(prev=>{
      if(prev.includes(id))return prev.filter(x=>x!==id)
      if(prev.length>=200)return prev
      return [...prev,id]
    })
  }
  function toggleSelectAll(){
    if(allSelected){
      setSelected([])
      return
    }
    setSelected(sorted.slice(0,200).map((row:any)=>String(row.id)))
  }

  // Tracking/HUB sizing: minimum follows visible semantic IDs, not positions.
  const columnMinimums:Record<ColKey,number>={"number":28,"order":134,"username":94,"device":128,"time":116,"product":149,"cod":76,"tracking":177,"voucher":69,"status":104}
  const panelMinimums:Record<ColKey,number>={"number":26,"order":116,"username":84,"device":112,"time":106,"product":118,"cod":65,"tracking":150,"voucher":61,"status":92}
  const shownColumns=columnOrder.filter(isVisible)
  const panelFitWeights:Record<ColKey,number>={
    number:20,order:108,username:80,device:106,time:103,product:121,
    cod:60,tracking:145,voucher:57,status:91
  }
  const panelFitTotal=(canEdit?24:0)+shownColumns.reduce((sum,key)=>sum+panelFitWeights[key],0)
  const panelShare=(weight:number)=>({ '--p1-panel-col-width':(weight/panelFitTotal*100)+'%' }) as CSSProperties
  const fullFloor=(canEdit?30:0)+shownColumns.reduce((sum,k)=>sum+columnMinimums[k],0)
  const panelFloor=(canEdit?28:0)+shownColumns.reduce((sum,k)=>sum+panelMinimums[k],0)
  const tableWidths={
    '--p1-order-min-width':fullFloor+'px',
    '--p1-order-panel-min-width':panelFloor+'px',
  } as CSSProperties
  const colSpan=visible.length+(canEdit?1:0)
  const toggleSort=(a:SortKey,b:SortKey)=>changeSort(sort===a?b:a)

  function renderHeader(key:ColKey){
    if(key==='number')return <th key={key} data-order-col={key}>#</th>
    if(key==='order')return <th key={key} data-order-col={key} className="p1-order-identity-head"><button className="sort-head" type="button" onClick={()=>toggleSort('order_asc','order_desc')}>Mã đơn <span>{sortIndicator(sort,'order_asc','order_desc')}</span></button></th>
    if(key==='username')return <th key={key} data-order-col={key}><button className="sort-head" type="button" onClick={()=>toggleSort('username_asc','username_desc')}>Username <span>{sortIndicator(sort,'username_asc','username_desc')}</span></button></th>
    if(key==='device')return <th key={key} data-order-col={key}>Thiết bị</th>
    if(key==='time')return <th key={key} data-order-col={key}><button className="sort-head" type="button" onClick={()=>toggleSort('time_old','time_new')}>Thời gian đặt <span>{sort==='time_new'?'↓':sort==='time_old'?'↑':'↕'}</span></button></th>
    if(key==='product')return <th key={key} data-order-col={key} className="p1-order-product-head">Sản phẩm</th>
    if(key==='cod')return <th key={key} data-order-col={key}><button className="sort-head" type="button" onClick={()=>toggleSort('cod_asc','cod_desc')}>COD <span>{sortIndicator(sort,'cod_asc','cod_desc')}</span></button></th>
    if(key==='tracking')return <th key={key} data-order-col={key} className="p1-order-tracking-head">Vận chuyển</th>
    if(key==='voucher')return <th key={key} data-order-col={key}>Voucher</th>
    return <th key={key} data-order-col={key}><button className="sort-head" type="button" onClick={()=>toggleSort('status_asc','status_desc')}>Xử lý <span>{sortIndicator(sort,'status_asc','status_desc')}</span></button></th>
  }

  function renderCell(key:ColKey,o:any,i:number){
    const s=activeShipment(o)
    if(key==='number')return <td key={key} data-order-col={key}>{i+1}</td>
    if(key==='order')return <td key={key} data-order-col={key} className="p1-order-identity-cell"><Link className="table-link" prefetch={false} href={hrefFor(o.id)}>{o.shopee_order_id??o.id.slice(0,8)}</Link></td>
    if(key==='username')return <td key={key} data-order-col={key} className="p1-order-user-cell" title={o.erp_users?.username??undefined}>
      {o.erp_user_id&&o.erp_users?.username
        ? <Link className="p1-order-username-link" prefetch={false} href={hrefForUser(String(o.erp_user_id))}
            title={'Xem chi tiết User '+o.erp_users.username}>{o.erp_users.username}</Link>
        : '—'}
    </td>
    if(key==='device'){
      const mobile=String(o.account_device_info?.mobileType??'')
      const browser=String(o.account_device_info?.browserName??'')
      return <td key={key} data-order-col={key} className="p1-order-device-cell"
        title={'Mobile: '+(mobile||'—')+' · Browser: '+(browser||'—')}>
        <span className="p1-order-device-lines">
          <span><small>M:</small><b>{mobile||'—'}</b></span>
          <span><small>B:</small><b>{browser||'—'}</b></span>
        </span>
      </td>
    }
    if(key==='time')return <td key={key} data-order-col={key} className="order-time-cell">{formatDateTime(o.order_date)}</td>
    if(key==='product')return <td key={key} data-order-col={key} className="product-cell" title={(o.order_items??[]).map((it:any)=>[it.product_name,it.variant].filter(Boolean).join(' · ')).join(' | ')||'—'}>
      <span className="p1-product-lines">
        {(o.order_items??[]).length
          ? (o.order_items??[]).slice(0,2).map((it:any,index:number)=><span key={it.id??index}>
              {[it.product_name,it.variant].filter(Boolean).join(' · ')||'Sản phẩm'}
              {index===1&&(o.order_items??[]).length>2?' +'+((o.order_items??[]).length-2):''}
            </span>)
          : <span>—</span>}
      </span>
    </td>
    if(key==='cod')return <td key={key} data-order-col={key} className="money">{formatMoney(o.cod)}</td>
    if(key==='tracking'){
      const cancelled=orderIsCancelled(o)
      const value=String(s?.tracking_number??'')
      const carrier=o.shipping_service==='EXPRESS'?'Hỏa tốc':String(s?.carrier??'')
      return <td key={key} data-order-col={key} className="tracking-number-cell p1-shipping-cell"
        title={'MVĐ: '+(value||'Chưa có')+' · ĐVVC: '+(carrier||'Chưa rõ')}>
        <span className="p1-shipping-lines">
          <span className="p1-shipping-number">
            {value?<b title={value}>{value}</b>:canEdit&&!o.archived_at&&!cancelled
              ?<QuickTrackingEditor orderId={o.id} returnQuery={baseQuery}
                carrierConfigs={carrierConfigs} isExpress={o.shipping_service==='EXPRESS'}/>
              :<b>Chưa có</b>}
          </span>
          <span className="p1-shipping-carrier">{cancelled?'Đơn bị huỷ':carrier||'Chưa rõ ĐVVC'}</span>
        </span>
      </td>
    }
    if(key==='voucher')return <td key={key} data-order-col={key} className="voucher-cell"><VoucherTags value={voucherSummary(o.order_vouchers??[])} compact maxVisible={2}/></td>
    return <td key={key} data-order-col={key}>
      <div className="order-state-cell">
        {orderIsCancelled(o)
          ? <span className="status-pill status-cancelled">Đơn bị huỷ</span>
          :o.shipping_service==='EXPRESS'
          ? <span className="status-pill orange">Hỏa tốc</span>
          : s?.tracking_number
            ? <span className={'status-pill status-'+String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(s?.current_tracking_status)}</span>
            : <span className="status-pill orange">Chờ mã vận đơn</span>}
        {!orderIsCancelled(o)&&o.receive_status!=='NOT_READY'&&<span className={'status-pill '+(o.receive_status==='RECEIVED'?'green':'orange')}>{statusLabel(o.receive_status)}</span>}
        {o.archived_at&&<span className="status-pill archived">Lưu trữ</span>}
      </div>
    </td>
  }

  return <div className="order-table-shell">
    {toolbarRoot&&createPortal(<div className="p1-order-table-actions">
      {canEdit&&selected.length>0&&<div className="p1-order-bulk-icons" aria-label={selected.length+' đơn đã chọn'}>
        <span className="p1-order-selected-count" title={selected.length+' đơn đã chọn'}>{selected.length}</span>
        {selectedArchived
          ? <form action={restoreOrdersBulk} className="order-bulk-form">
              <input type="hidden" name="return_query" value={baseQuery}/>
              {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
              <button type="submit" className="p1-toolbar-icon" title="Khôi phục đơn đã chọn" aria-label="Khôi phục đơn đã chọn">
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/><path d="M12 7v5l3 2"/></svg>
              </button>
            </form>
          : <form action={archiveOrdersBulk} className="order-bulk-form">
              <input type="hidden" name="return_query" value={baseQuery}/>
              {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
              <button type="submit" className="p1-toolbar-icon" title="Lưu trữ đơn đã chọn" aria-label="Lưu trữ đơn đã chọn">
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg>
              </button>
            </form>}
        <button type="button" className="p1-toolbar-icon" title="Bỏ chọn tất cả" aria-label="Bỏ chọn tất cả" onClick={()=>setSelected([])}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>}
    <div className="p1-order-column-manager managed-column-wrap" ref={columnManagerRef}>
      <button className="icon-button managed-column-button" type="button" onClick={()=>setOpen(v=>!v)} title="Cột & thứ tự" aria-expanded={open}>
        <ColumnIcon/>
      </button>
      {open&&<div className="column-manager-menu">
        <div className="column-manager-head">
          <b>Cột & thứ tự</b>
          <button type="button" onClick={resetColumns}>↺ Mặc định</button>
        </div>
        {columnOrder.map(k=><div
          key={k}
          className={'column-manager-row draggable '+(k==='order'?'locked ':'')}
          onDragEnter={e=>e.currentTarget.classList.add('drop-target')}
          onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}}
          onDragLeave={e=>e.currentTarget.classList.remove('drop-target')}
          onPointerUp={()=>{
            // Fallback for browsers where the native HTML5 drop is suppressed
            // by a portal or a pointer gesture on the drag handle.
            const source=draggingRef.current
            if(source&&source!==k)reorderColumn(source,k)
            draggingRef.current=null
            setDraggingColumn(null)
            setDragOverColumn(null)
          }}
          onDrop={e=>{
            e.preventDefault()
            e.currentTarget.classList.remove('drop-target')
            const source=(e.dataTransfer.getData('text/plain')||draggingRef.current||draggingColumn) as ColKey|null
            if(source&&ALL.includes(source))reorderColumn(source,k)
            draggingRef.current=null
            setDraggingColumn(null)
            setDragOverColumn(null)
          }}
        >
          <button
            type="button"
            className="column-drag-handle"
            draggable
            title="Kéo để đổi thứ tự cột"
            aria-label={'Kéo '+LABELS[k]}
            onPointerDown={()=>{draggingRef.current=k}}
            onDragStart={e=>{
              draggingRef.current=k
              // Keep the source DOM stable through dragstart/dragover/drop.
              // React rerenders here can cancel native HTML5 DnD in Chromium.
              e.currentTarget.closest('.column-manager-row')?.classList.add('dragging')
              e.dataTransfer.effectAllowed='move'
              e.dataTransfer.setData('text/plain',k)
            }}
            onDragEnd={e=>{
              e.currentTarget.closest('.column-manager-row')?.classList.remove('dragging')
              draggingRef.current=null
              setDraggingColumn(null);setDragOverColumn(null)
            }}
          >⠿</button>
          <label>
            <input type="checkbox" checked={visible.includes(k)} disabled={k==='order'} onChange={()=>toggleColumn(k)}/>
            <span>{LABELS[k]}</span>
          </label>
          <div className="column-order-buttons" aria-label={'Đổi thứ tự '+LABELS[k]}>
            <button type="button" title={'Chuyển '+LABELS[k]+' lên'} aria-label={'Chuyển '+LABELS[k]+' lên'}
              disabled={columnOrder.indexOf(k)===0}
              onClick={()=>reorderColumn(k,columnOrder[columnOrder.indexOf(k)-1])}>↑</button>
            <button type="button" title={'Chuyển '+LABELS[k]+' xuống'} aria-label={'Chuyển '+LABELS[k]+' xuống'}
              disabled={columnOrder.indexOf(k)===columnOrder.length-1}
              onClick={()=>reorderColumn(k,columnOrder[columnOrder.indexOf(k)+1])}>↓</button>
          </div>
        </div>)}
      </div>}
    </div></div>,toolbarRoot)}

    <div className="card table-card order-table-card" ref={tableWrapRef}>
      <table className="table order-table mynh-p1-semantic-table" style={tableWidths}>
        <colgroup>
          {canEdit&&<col className="p1-order-col-select" style={panelShare(24)}/>}
          {shownColumns.map(k=><col key={k} className={'p1-order-col-'+k} style={panelShare(panelFitWeights[k])}/>)}
        </colgroup>
        <thead><tr>
          {canEdit&&<th className="bulk-select-col">
            <input
              type="checkbox"
              aria-label="Chọn tối đa 200 đơn"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={!sorted.length}
            />
          </th>}
          {columnOrder.filter(isVisible).map(renderHeader)}
        </tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={colSpan} className="empty">Không có đơn phù hợp với bộ lọc hiện tại.</td></tr>
            : sorted.map((o:any,i:number)=>{
                return <tr key={o.id} data-selected={selectedId===o.id?'true':undefined} className={selectedId===o.id?'selected-row':''}>
                  {canEdit&&<td className="bulk-select-col">
                    <input
                      type="checkbox"
                      aria-label={'Chọn '+(o.shopee_order_id??o.id)}
                      checked={selectedSet.has(String(o.id))}
                      onChange={()=>toggleSelect(String(o.id))}
                    />
                  </td>}
                  {columnOrder.filter(isVisible).map(k=>renderCell(k,o,i))}
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </div>
}
