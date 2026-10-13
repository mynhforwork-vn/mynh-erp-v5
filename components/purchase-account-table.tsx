'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePurchaseToolbarRoot } from '@/components/use-purchase-toolbar-root'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { accountDeviceFields } from '@/lib/purchase-account-device-fields'
import { normalizeLegacyVisibleColumns,normalizeLegacyColumnOrder } from '@/lib/table-column-preferences'
import { archiveERPUsersBulk, restoreERPUsersBulk } from '@/lib/actions/core'

type Row=Record<string,any>
type ColKey='number'|'username'|'platform'|'phone'|'email'|'status'|'mobile'|'browser'|'voucher'|'orders'|'deliveredOrders'|'createdAt'|'note'

const ALL:ColKey[]=['number','username','platform','phone','email','status','mobile','browser','voucher','orders','deliveredOrders','createdAt','note']
const LABELS:Record<ColKey,string>={
  number:'#',username:'Username',platform:'Nền tảng',phone:'SĐT',email:'Email',
  status:'Trạng thái',mobile:'Mobile',browser:'Browser',voucher:'Voucher đã dùng',orders:'Số đơn',deliveredOrders:'Số đơn giao thành công',
  createdAt:'Thời gian tạo',note:'Ghi chú'
}
const STORAGE_KEY='mynh-v5-purchase-account-columns'
const STORAGE_ORDER_KEY='mynh-v5-purchase-account-column-order'
const DELIVERY_COL_MIGRATION_KEY='mynh-v5-account-delivered-column-v1'

// Introduce the new visible column once for existing saved layouts. A user
// who hides it afterwards keeps that preference across reloads.
function insertAfterOrders(values:ColKey[]){
  const without:ColKey[]=values.filter(k=>k!=='deliveredOrders')
  const at=without.indexOf('orders')
  without.splice(at<0?without.length:at+1,0,'deliveredOrders')
  return without
}

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
  const draggingRef=useRef<ColKey|null>(null)
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
  const toolbarRoot=usePurchaseToolbarRoot('p1-account-filter-actions')

  useEffect(()=>{
    try{
      const firstDeliveryColumn=localStorage.getItem(DELIVERY_COL_MIGRATION_KEY)!=='1'
      const raw=localStorage.getItem(STORAGE_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed)){
          const saved=normalizeLegacyVisibleColumns<ColKey>(
            parsed.flatMap((k:string)=>k==='device'?['mobile','browser']:[k]),ALL,['username']
          )
          const next=firstDeliveryColumn&&!saved.includes('deliveredOrders')
            ?insertAfterOrders(saved):saved
          setVisible(next)
          if(firstDeliveryColumn)localStorage.setItem(STORAGE_KEY,JSON.stringify(next))
        }
      }
      const rawOrder=localStorage.getItem(STORAGE_ORDER_KEY)
      if(rawOrder){
        const parsedOrder=JSON.parse(rawOrder)
        if(Array.isArray(parsedOrder)){
          const mapped=parsedOrder.flatMap((k:string)=>k==='device'?['mobile','browser']:[k])
          const next=normalizeLegacyColumnOrder<ColKey>(mapped,ALL)
          const ordered=!mapped.includes('deliveredOrders')?insertAfterOrders(next):next
          setColumnOrder(ordered)
          if(!mapped.includes('deliveredOrders'))localStorage.setItem(STORAGE_ORDER_KEY,JSON.stringify(ordered))
        }
      }
      if(firstDeliveryColumn)localStorage.setItem(DELIVERY_COL_MIGRATION_KEY,'1')
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
  function moveColumn(key:ColKey,delta:-1|1){
    const index=columnOrder.indexOf(key)
    const target=index+delta
    if(index<0||target<0||target>=columnOrder.length)return
    const next=[...columnOrder]
    next.splice(index,1)
    next.splice(target,0,key)
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
  // Auto Fit: one width allocation for Desktop, Tablet, Mobile and right drawer.
  // Numeric fields stay compact; meaningful text and Voucher expand as space permits.
  const shownColumns=columnOrder.filter(isVisible)
  const sampleMax=(pick:(row:Row)=>string)=>{
    let n=0
    for(const row of rows.slice(0,150))n=Math.max(n,pick(row).trim().length)
    return n
  }
  const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n))
  const longestTag=sampleMax(r=>String(r.voucher_used_summary??'')
    .split('·').map(s=>s.trim()).sort((a,b)=>b.length-a.length)[0]??'')
  const minimum:Record<ColKey,number>={
    number:28,username:128,platform:56,phone:98,email:132,status:76,
    mobile:86,browser:74,voucher:104,orders:48,deliveredOrders:88,
    createdAt:130,note:88,
  }
  const widths:Record<ColKey,number>={
    number:28,username:clamp(45+sampleMax(r=>String(r.username??''))*6.4,144,214),
    platform:64,phone:110,
    email:clamp(18+sampleMax(r=>String(r.email??''))*5.7,148,248),
    status:86,mobile:clamp(18+sampleMax(r=>accountDeviceFields(r).mobileType)*5.8,94,152),
    browser:clamp(18+sampleMax(r=>accountDeviceFields(r).browserName)*5.8,82,145),
    voucher:clamp(22+longestTag*5.8,106,182),
    orders:52,deliveredOrders:94,createdAt:137,
    note:clamp(26+sampleMax(r=>String(r.note??''))*4.8,103,185),
  }
  const flex:ColKey[]=['username','email','mobile','browser','voucher','note']
  const panelWidth=tableLaneWidth>0?Math.max(0,Math.floor(tableLaneWidth)-2):0
  const allocated=()=> (canManage?28:0)+shownColumns.reduce((sum,key)=>sum+widths[key],0)
  if(panelWidth>0&&allocated()>panelWidth){
    let deficit=allocated()-panelWidth
    for(const key of ['note','email','mobile','browser','username','voucher'] as ColKey[]){
      if(!shownColumns.includes(key))continue
      const cut=Math.min(deficit,widths[key]-minimum[key])
      widths[key]-=cut
      deficit-=cut
      if(deficit<=0)break
    }
    // Short metadata fields also have safe lower bounds. Spend those few
    // pixels before creating an avoidable horizontal scroll at 1440px.
    if(deficit>0){
      for(const key of ['phone','platform','status','createdAt','deliveredOrders','orders'] as ColKey[]){
        if(!shownColumns.includes(key))continue
        const cut=Math.min(deficit,widths[key]-minimum[key])
        widths[key]-=cut
        deficit-=cut
        if(deficit<=0)break
      }
    }
  }
  const availableExtra=panelWidth>0?Math.max(0,panelWidth-allocated()):0
  const expanding=flex.filter(key=>shownColumns.includes(key))
  if(availableExtra>0&&expanding.length){
    const importance:Partial<Record<ColKey,number>>={
      username:1.3,email:1.4,mobile:.5,browser:.5,voucher:1,note:1,
    }
    const total=expanding.reduce((n,key)=>n+(importance[key]??1),0)
    let consumed=0
    expanding.forEach((key,i)=>{
      const bonus=i===expanding.length-1?availableExtra-consumed:
        Math.floor(availableExtra*(importance[key]??1)/total)
      widths[key]+=bonus
      consumed+=bonus
    })
  }
  const fitCol=(px:number)=>({
    '--p1-account-fit-col-width':Math.round(px*100)/100+'px',
  }) as CSSProperties
  const tableWidths={
    '--p1-account-fit-table-width':Math.ceil(allocated())+'px',
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
    if(key==='deliveredOrders')return <th key={key} data-account-col={key} title="Số đơn giao thành công">Giao thành công</th>
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
    if(key==='voucher')return <td key={key} data-account-col={key} className="voucher-cell" data-voucher-count={u.voucher_tags?.length??0}><VoucherTags value={u.voucher_used_summary} compact showAll/></td>
    if(key==='orders')return <td key={key} data-account-col={key} className="count-cell">{u.order_count??0}</td>
    if(key==='deliveredOrders')return <td key={key} data-account-col={key} className="count-cell" title="Số đơn giao thành công">{u.delivered_order_count??'—'}</td>
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
          data-column-key={k}
          className={'column-manager-row draggable '+(k==='username'?'locked ':'')}
        >
          <button
            type="button"
            className="column-drag-handle"
            title="Kéo để đổi thứ tự cột"
            aria-label={'Kéo '+LABELS[k]}
            onPointerDown={e=>{
              if(e.button!==0)return
              e.preventDefault()
              draggingRef.current=k
              const row=e.currentTarget.closest('.column-manager-row')
              const menu=e.currentTarget.closest('.column-manager-menu')
              row?.classList.add('dragging')
              const initialY=e.clientY
              const onMove=(event:PointerEvent)=>{
                if(Math.abs(event.clientY-initialY)<3)return
                menu?.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'))
                const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.column-manager-row')
                if(target&&menu?.contains(target)&&target!==row)target.classList.add('drop-target')
              }
              const onUp=(event:PointerEvent)=>{
                window.removeEventListener('pointermove',onMove,true)
                window.removeEventListener('pointerup',onUp,true)
                window.removeEventListener('pointercancel',onUp,true)
                row?.classList.remove('dragging')
                menu?.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'))
                const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.column-manager-row')
                const destination=target&&menu?.contains(target)?target.getAttribute('data-column-key'):null
                const source=draggingRef.current
                draggingRef.current=null
                if(source&&destination&&ALL.includes(destination as ColKey)&&source!==destination){
                  reorderColumn(source,destination as ColKey)
                }
              }
              window.addEventListener('pointermove',onMove,true)
              window.addEventListener('pointerup',onUp,true)
              window.addEventListener('pointercancel',onUp,true)
            }}
          >⠿</button>
          <label>
            <input type="checkbox" checked={visible.includes(k)} disabled={k==='username'} onChange={()=>toggle(k)}/>
            <span>{LABELS[k]}</span>
          </label>
          <div className="column-order-buttons" aria-label={'Đổi thứ tự '+LABELS[k]}>
            <button type="button" title={'Chuyển '+LABELS[k]+' lên'}
              aria-label={'Chuyển '+LABELS[k]+' lên'}
              disabled={columnOrder.indexOf(k)===0}
              onClick={()=>moveColumn(k,-1)}>↑</button>
            <button type="button" title={'Chuyển '+LABELS[k]+' xuống'}
              aria-label={'Chuyển '+LABELS[k]+' xuống'}
              disabled={columnOrder.indexOf(k)===columnOrder.length-1}
              onClick={()=>moveColumn(k,1)}>↓</button>
          </div>
        </div>)}
      </div>}
    </div>,toolbarRoot)}

    <div className="card table-card account-table-card" ref={tableCardRef}>
      <table className="table user-table mynh-p1-semantic-table" data-auto-fit-version="2" style={tableWidths}>
        <colgroup>
          {canManage&&<col className="p1-account-col p1-account-col-select" style={fitCol(28)}/>}
          {shownColumns.map(k=><col key={k} className={'p1-account-col p1-account-col-'+k}
            style={fitCol(widths[k])}/>)}
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
            : rows.map((u,i)=><tr key={u.id} data-account-id={u.id} className={selectedId===u.id?'selected-row':''}>
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
