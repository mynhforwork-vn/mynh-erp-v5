'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { accountDeviceFields } from '@/lib/purchase-account-device-fields'
import { normalizeLegacyVisibleColumns,normalizeLegacyColumnOrder } from '@/lib/table-column-preferences'
import { archiveERPUsersBulk, restoreERPUsersBulk } from '@/lib/actions/core'

type Row=Record<string,any>
type ColKey='number'|'username'|'platform'|'phone'|'email'|'status'|'mobile'|'browser'|'voucher'|'orders'|'createdAt'|'note'

const ALL:ColKey[]=['number','username','platform','phone','email','status','mobile','browser','voucher','orders','createdAt','note']
const LABELS:Record<ColKey,string>={
  number:'#',username:'Username',platform:'Nền tảng',phone:'SĐT',email:'Email',
  status:'Trạng thái',mobile:'Mobile',browser:'Browser',voucher:'Voucher đã dùng',orders:'Số đơn',
  createdAt:'Thời gian tạo',note:'Ghi chú'
}
const STORAGE_KEY='mynh-v5-purchase-account-columns'
const STORAGE_ORDER_KEY='mynh-v5-purchase-account-column-order'

function statusClass(status?:string|null){
  if(status==='Active')return 'green'
  if(status==='Blocked')return 'red'
  if(['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(String(status)))return 'orange'
  return ''
}

function sortHref(baseQuery:string,nextSort:string){
  const p=new URLSearchParams(baseQuery)
  p.set('sort',nextSort)
  return '/purchase/accounts?'+p.toString()
}

function ColumnIcon(){
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2"/>
    <path d="M9 5v14M15 5v14"/>
  </svg>
}


export function PurchaseAccountTable({
  rows,
  selectedId,
  detailQuery='',
  sort='newest',
  canManage=false,
}:{
  rows:Row[]
  selectedId?:string|null
  detailQuery?:string
  sort?:string
  canManage?:boolean
}){
  const [visible,setVisible]=useState<ColKey[]>(ALL)
  const [columnOrder,setColumnOrder]=useState<ColKey[]>(ALL)
  const [open,setOpen]=useState(false)
  const [selected,setSelected]=useState<string[]>([])
  const [draggingColumn,setDraggingColumn]=useState<ColKey|null>(null)
  const [dragOverColumn,setDragOverColumn]=useState<ColKey|null>(null)
  const columnManagerRef=useRef<HTMLDivElement|null>(null)
  const tableCardRef=useRef<HTMLDivElement|null>(null)
  const [tableLaneWidth,setTableLaneWidth]=useState(0)
  useEffect(()=>{
    const card=tableCardRef.current
    if(!card)return
    const measure=()=>setTableLaneWidth(w=>Math.abs(w-card.clientWidth)<1?w:card.clientWidth)
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(card)
    return ()=>observer.disconnect()
  },[])
  const [toolbarRoot,setToolbarRoot]=useState<HTMLElement|null>(null)
  useEffect(()=>{setToolbarRoot(document.getElementById('p1-account-filter-actions'))},[])

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORAGE_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed)){
          setVisible(normalizeLegacyVisibleColumns<ColKey>(
            parsed.flatMap((k:string)=>k==='device'?['mobile','browser']:[k]),ALL,['username']
          ))
        }
      }
      const rawOrder=localStorage.getItem(STORAGE_ORDER_KEY)
      if(rawOrder){
        const parsedOrder=JSON.parse(rawOrder)
        if(Array.isArray(parsedOrder)){
          setColumnOrder(normalizeLegacyColumnOrder<ColKey>(
            parsedOrder.flatMap((k:string)=>k==='device'?['mobile','browser']:[k]),ALL
          ))
        }
      }
    }catch{}
  },[])

  useEffect(()=>{
    const valid=new Set(rows.map((x:any)=>String(x.id)))
    setSelected(prev=>prev.filter(id=>valid.has(id)))
  },[rows])

  useEffect(()=>{
    if(!open)return
    function onPointerDown(event:PointerEvent){
      const target=event.target as Node|null
      if(target&&!columnManagerRef.current?.contains(target))setOpen(false)
    }
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape')setOpen(false)
    }
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return ()=>{
      document.removeEventListener('pointerdown',onPointerDown)
      document.removeEventListener('keydown',onKeyDown)
    }
  },[open])

  function persist(next:ColKey[]){
    setVisible(next)
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch{}
  }
  function toggle(key:ColKey){
    if(key==='username')return
    const next=visible.includes(key)?visible.filter(x=>x!==key):ALL.filter(x=>x===key||visible.includes(x))
    persist(next)
  }
  function persistOrder(next:ColKey[]){
    setColumnOrder(next)
    try{localStorage.setItem(STORAGE_ORDER_KEY,JSON.stringify(next))}catch{}
  }
  function reorderColumn(source:ColKey,target:ColKey){
    if(source===target)return
    const next=columnOrder.filter(k=>k!==source)
    const targetIndex=next.indexOf(target)
    if(targetIndex<0)return
    next.splice(targetIndex,0,source)
    persistOrder(next)
  }
  function reset(){
    persist(ALL)
    persistOrder(ALL)
  }
  function isVisible(k:ColKey){return visible.includes(k)}
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const selectedRows=useMemo(()=>rows.filter((row:any)=>selectedSet.has(String(row.id))),[rows,selectedSet])
  const selectedArchived=selectedRows.length>0&&selectedRows.every((row:any)=>Boolean(row.archived_at))
  const allSelected=rows.length>0&&rows.slice(0,200).every((row:any)=>selectedSet.has(String(row.id)))
  const colSpan=useMemo(()=>visible.length+(canManage?1:0),[visible,canManage])
  // Same visible-column full/panel width policy as Tracking/HUB.
  const columnMinimums:Record<ColKey,number>={"number":32,"username":154,"platform":64,"phone":108,"email":155,"status":89,"mobile":104,"browser":96,"voucher":76,"orders":52,"createdAt":135,"note":90}
  const panelMinimums:Record<ColKey,number>={"number":28,"username":125,"platform":58,"phone":96,"email":130,"status":80,"mobile":83,"browser":75,"voucher":70,"orders":44,"createdAt":125,"note":72}
  const shownColumns=columnOrder.filter(isVisible)
  // Compact panel sizing is relative to the real table lane. Every visible
  // column receives an explicit share, including when users hide/reorder.
  const panelFitWeights:Record<ColKey,number>={
    number:22,username:102,platform:53,phone:90,email:98,
    status:72,mobile:81,browser:72,voucher:65,orders:40,createdAt:106,note:76
  }
  // Content-informed desktop widths. Narrow metadata columns do not expand
  // merely because Username / Email / Note were previously set to auto.
  // Only displayed column IDs participate, so hidden/reordered columns are safe.
  const maxLength=(read:(row:Row)=>string)=>{
    let max=0
    for(const row of rows.slice(0,150)){
      max=Math.max(max,read(row).trim().length)
    }
    return max
  }
  const range=(n:number,low:number,high:number)=>Math.min(high,Math.max(low,n))
  const contentWeights:Record<ColKey,number>={
    number:32,
    username:range(48+maxLength(r=>String(r.username??''))*6.5,148,194),
    platform:66,
    phone:119,
    email:range(18+maxLength(r=>String(r.email??''))*6.2,196,276),
    status:88,
    mobile:range(17+maxLength(r=>accountDeviceFields(r).mobileType)*6.1,118,175),
    browser:range(16+maxLength(r=>accountDeviceFields(r).browserName)*6.1,101,140),
    voucher:84,
    orders:52,
    createdAt:139,
    note:range(20+maxLength(r=>String(r.note??''))*4,146,190),
  }
  const flexKeys=new Set<ColKey>(['username','email','mobile','browser','note'])
  const fixedWidth=(canManage?32:0)+shownColumns.filter(k=>!flexKeys.has(k))
    .reduce((sum,key)=>sum+contentWeights[key],0)
  const flexible=shownColumns.filter(k=>flexKeys.has(k))
  const flexibleWeights=flexible.reduce((sum,key)=>sum+contentWeights[key],0)
  const minimumText:Partial<Record<ColKey,number>>={
    username:124,email:151,mobile:94,browser:78,note:103,
  }
  const minimumBudget=flexible.reduce((sum,key)=>sum+(minimumText[key]??0),0)
  const widthBudget=tableLaneWidth>0
    ?Math.max(minimumBudget,tableLaneWidth-fixedWidth)
    :flexibleWeights
  const computedFullWidths:Record<ColKey,number>={...contentWeights}
  for(const key of flexible){
    computedFullWidths[key]=Math.max(minimumText[key]??0,
      widthBudget*contentWeights[key]/Math.max(1,flexibleWeights))
  }
  let overage=flexible.reduce((sum,key)=>sum+computedFullWidths[key],0)-widthBudget
  if(overage>0){
    // Respect minimum readable text widths while compressing other columns.
    for(let pass=0;pass<2&&overage>0.1;pass++){
      const remaining=flexible.filter(key=>computedFullWidths[key]>(minimumText[key]??0)+0.1)
      const room=remaining.reduce((sum,key)=>sum+computedFullWidths[key]-(minimumText[key]??0),0)
      if(room<=0)break
      for(const key of remaining){
        const available=computedFullWidths[key]-(minimumText[key]??0)
        const reduction=Math.min(available,overage*available/room)
        computedFullWidths[key]-=reduction
      }
      overage=flexible.reduce((sum,key)=>sum+computedFullWidths[key],0)-widthBudget
    }
  }
  const tableTarget=fixedWidth+flexible.reduce((sum,key)=>sum+computedFullWidths[key],0)
  // The full-width table uses fixed pixels for counts/tags/metadata.
  // Only long meaningful text fields share remaining space.
  const fullColumnStyle=(width:number)=>({
    '--p1-full-col-width':Math.round(width*100)/100+'px',
  }) as CSSProperties
  const panelFitTotal=(canManage?24:0)+shownColumns.reduce((sum,key)=>sum+panelFitWeights[key],0)
  const panelShare=(weight:number)=>({ '--p1-panel-col-width':(weight/panelFitTotal*100)+'%' }) as CSSProperties
  const fullFloor=(canManage?32:0)+shownColumns.reduce((sum,k)=>sum+columnMinimums[k],0)
  const panelFloor=(canManage?28:0)+shownColumns.reduce((sum,k)=>sum+panelMinimums[k],0)
  const tableWidths={
    '--p1-account-min-width':fullFloor+'px',
    '--p1-account-panel-min-width':panelFloor+'px',
    '--p1-account-computed-table-width':Math.max(fullFloor,tableTarget)+'px',
  } as CSSProperties

  function hrefFor(id:string){
    const p=new URLSearchParams(detailQuery)
    p.set('user',id)
    p.delete('mode')
    return '/purchase/accounts?'+p.toString()
  }

  function createOrderHref(id:string){
    const src=new URLSearchParams(detailQuery)
    const p=new URLSearchParams()
    for(const key of ['range','from','to']){
      const value=src.get(key)
      if(value)p.set(key,value)
    }
    p.set('mode','create')
    p.set('user',id)
    return '/purchase/orders?'+p.toString()
  }

  const nameNext=sort==='name_asc'?'name_desc':'name_asc'
  const timeNext=sort==='oldest'?'newest':'oldest'

  function toggleSelect(id:string){
    setSelected(prev=>{
      if(prev.includes(id))return prev.filter(x=>x!==id)
      if(prev.length>=200)return prev
      return [...prev,id]
    })
  }
  function toggleSelectAll(){
    if(allSelected){setSelected([]);return}
    setSelected(rows.slice(0,200).map((row:any)=>String(row.id)))
  }

  function renderHeader(key:ColKey){
    if(key==='number')return <th key={key} data-account-col={key}>#</th>
    if(key==='username')return <th key={key} data-account-col={key} className="p1-user-identity-head"><Link className="sortable-head" href={sortHref(detailQuery,nameNext)}>Username <span>{sort==='name_asc'?'↑':sort==='name_desc'?'↓':'↕'}</span></Link></th>
    if(key==='platform')return <th key={key} data-account-col={key}>Nền tảng</th>
    if(key==='phone')return <th key={key} data-account-col={key}>SĐT</th>
    if(key==='email')return <th key={key} data-account-col={key}>Email</th>
    if(key==='status')return <th key={key} data-account-col={key}>Trạng thái</th>
    if(key==='mobile')return <th key={key} data-account-col={key}>Mobile</th>
    if(key==='browser')return <th key={key} data-account-col={key}>Browser</th>
    if(key==='voucher')return <th key={key} data-account-col={key} className="p1-user-voucher-head">Voucher đã dùng</th>
    if(key==='orders')return <th key={key} data-account-col={key}>Số đơn</th>
    if(key==='createdAt')return <th key={key} data-account-col={key}><Link className="sortable-head" href={sortHref(detailQuery,timeNext)}>Thời gian tạo <span>{sort==='newest'?'↓':sort==='oldest'?'↑':'↕'}</span></Link></th>
    return <th key={key} data-account-col={key}>Ghi chú</th>
  }

  function renderCell(key:ColKey,u:any,i:number){
    if(key==='number')return <td key={key} data-account-col={key}>{i+1}</td>
    if(key==='username')return <td key={key} data-account-col={key} className="p1-user-identity-cell">
      <div className="user-name-actions">
        <Link className="table-link" prefetch={false} href={hrefFor(u.id)} title={u.username}>{u.username}</Link>
        {!u.archived_at&&u.status!=='Blocked'&&<Link className="quick-order-link" href={createOrderHref(u.id)} title="Tạo đơn từ User" aria-label={'Tạo đơn từ '+u.username}>+</Link>}
      </div>
    </td>
    if(key==='platform')return <td key={key} data-account-col={key} className="p1-user-platform-cell"><span className="platform-cell">{u.platform??'SHOPEE'}</span></td>
    if(key==='phone')return <td key={key} data-account-col={key}>{formatPhone(u.phone)}</td>
    if(key==='email')return <td key={key} data-account-col={key} title={u.email??undefined} className="p1-table-long-text">{u.email??'—'}</td>
    if(key==='status')return <td key={key} data-account-col={key}>{u.archived_at
      ? <span className="status-pill archived">Lưu trữ</span>
      : <span className={'status-pill '+statusClass(u.status)}>{statusLabel(u.status)}</span>}</td>
    if(key==='mobile'||key==='browser'){
      const fields=accountDeviceFields(u)
      const value=key==='mobile'?fields.mobileType:fields.browserName
      return <td key={key} data-account-col={key} className="p1-device-text-cell" title={value||undefined}>{value||'—'}</td>
    }
    if(key==='voucher')return <td key={key} data-account-col={key} className="voucher-cell"><VoucherTags value={u.voucher_used_summary} compact maxVisible={1}/></td>
    if(key==='orders')return <td key={key} data-account-col={key} className="count-cell">{u.order_count??0}</td>
    if(key==='createdAt')return <td key={key} data-account-col={key} title={formatDateTime(u.effective_created_at??u.created_at)}>{formatDateTime(u.effective_created_at??u.created_at)}</td>
    return <td key={key} data-account-col={key} className="truncate p1-table-long-text" title={u.note??undefined}>{u.note??'—'}</td>
  }

  return <div className="account-table-shell p1-account-table-shell">
    {canManage&&selected.length>0&&<div className="order-bulk-bar user-bulk-bar">
      <div className="order-bulk-summary">
        <b>{selected.length}</b>
        <span>User đã chọn{rows.length>200?' · tối đa 200/lần':''}</span>
        <button type="button" onClick={()=>setSelected([])}>Bỏ chọn</button>
      </div>
      {selectedArchived
        ? <form action={restoreERPUsersBulk} className="order-bulk-form">
            <input type="hidden" name="return_query" value={detailQuery}/>
            {selected.map(id=><input key={id} type="hidden" name="user_ids" value={id}/>)}
            <button className="button small primary" type="submit">Khôi phục đã chọn</button>
          </form>
        : <form action={archiveERPUsersBulk} className="order-bulk-form">
            <input type="hidden" name="return_query" value={detailQuery}/>
            {selected.map(id=><input key={id} type="hidden" name="user_ids" value={id}/>)}
            <button className="button small archive-button" type="submit">Lưu trữ đã chọn</button>
          </form>}
    </div>}

    {toolbarRoot&&createPortal(<div className="column-manager managed-column-wrap" ref={columnManagerRef}>
      <button className="icon-button managed-column-button" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} title="Cột & thứ tự">
        <ColumnIcon/><span>Cột</span>
      </button>
      {open&&<div className="column-manager-menu">
        <div className="column-manager-head"><b>Cột & thứ tự</b><button type="button" onClick={reset}>↺ Mặc định</button></div>
        {columnOrder.map(k=><div
          key={k}
          className={'column-manager-row draggable '+(k==='username'?'locked ':'')+(draggingColumn===k?'dragging ':'')+(dragOverColumn===k&&draggingColumn!==k?'drop-target':'')}
          onDragOver={e=>{e.preventDefault();setDragOverColumn(k)}}
          onDragLeave={()=>{if(dragOverColumn===k)setDragOverColumn(null)}}
          onDrop={e=>{
            e.preventDefault()
            const source=(e.dataTransfer.getData('text/plain')||draggingColumn) as ColKey|null
            if(source&&ALL.includes(source))reorderColumn(source,k)
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
            onDragStart={e=>{
              setDraggingColumn(k)
              e.dataTransfer.effectAllowed='move'
              e.dataTransfer.setData('text/plain',k)
            }}
            onDragEnd={()=>{setDraggingColumn(null);setDragOverColumn(null)}}
          >⠿</button>
          <label>
            <input type="checkbox" checked={visible.includes(k)} disabled={k==='username'} onChange={()=>toggle(k)}/>
            <span>{LABELS[k]}</span>
          </label>
        </div>)}
      </div>}
    </div>,toolbarRoot)}

    <div className="card table-card account-table-card" ref={tableCardRef}>
      <table className="table user-table mynh-p1-semantic-table" style={tableWidths}>
        <colgroup>
          {canManage&&<col className="p1-account-col p1-account-col-select" style={{...panelShare(24),...fullColumnStyle(32)}}/>}
          {shownColumns.map(k=><col key={k} className={'p1-account-col p1-account-col-'+k}
            style={{...panelShare(panelFitWeights[k]),...fullColumnStyle(computedFullWidths[k])}}/>)}
        </colgroup>
        <thead><tr>
          {canManage&&<th className="bulk-select-col">
            <input type="checkbox" aria-label="Chọn tối đa 200 User" checked={allSelected} onChange={toggleSelectAll} disabled={!rows.length}/>
          </th>}
          {columnOrder.filter(isVisible).map(renderHeader)}
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={colSpan} className="empty">Không có tài khoản phù hợp với bộ lọc hiện tại.</td></tr>
            : rows.map((u,i)=><tr key={u.id} className={selectedId===u.id?'selected-row':''}>
                {canManage&&<td className="bulk-select-col">
                  <input
                    type="checkbox"
                    aria-label={'Chọn '+u.username}
                    checked={selectedSet.has(String(u.id))}
                    onChange={()=>toggleSelect(String(u.id))}
                  />
                </td>}
                {columnOrder.filter(isVisible).map(k=>renderCell(k,u,i))}
              </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
