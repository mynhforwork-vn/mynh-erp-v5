'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { archiveERPUser, archiveERPUsersBulk, restoreERPUser, restoreERPUsersBulk } from '@/lib/actions/core'

type Row=Record<string,any>
type ColKey='number'|'username'|'platform'|'phone'|'email'|'status'|'device'|'voucher'|'orders'|'createdAt'|'note'

const ALL:ColKey[]=['number','username','platform','phone','email','status','device','voucher','orders','createdAt','note']
const LABELS:Record<ColKey,string>={
  number:'#',username:'Username',platform:'Nền tảng',phone:'SĐT',email:'Email',
  status:'Trạng thái',device:'Thiết bị',voucher:'Voucher đã dùng',orders:'Số đơn',
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

function hasST(row:Row){return Boolean(row.spc_st_secret_id||row.spc_st_encrypted)}
function hasF(row:Row){return Boolean(row.spc_f_secret_id||row.spc_f_encrypted)}

function DeviceIcons({row}:{row:Row}){
  const active=(row.active_devices??[]).filter((d:any)=>d.is_active)
  const hasMobile=active.some((d:any)=>d.device_type==='MOBILE')
  const hasWeb=active.some((d:any)=>d.device_type==='DESKTOP'||d.device_type==='BROWSER_PROFILE')

  return <div className="device-state-set" aria-label="Trạng thái phiên và thiết bị">
    <span className={'device-state-chip session '+(hasST(row)?'on':'')} title={hasST(row)?'Có SPC_ST':'Chưa có SPC_ST'}>ST</span>
    <span className={'device-state-chip session '+(hasF(row)?'on':'')} title={hasF(row)?'Có SPC_F':'Chưa có SPC_F'}>F</span>
    <span className={'device-state-chip '+(hasMobile?'on':'')} title={hasMobile?'Có Mobile đang hoạt động':'Không có Mobile đang hoạt động'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2" fill="none"/>
        <path d="M10 5h4M11 18.5h2" fill="none"/>
      </svg>
    </span>
    <span className={'device-state-chip '+(hasWeb?'on':'')} title={hasWeb?'Có Web/Browser đang hoạt động':'Không có Web/Browser đang hoạt động'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" fill="none"/>
        <path d="M8 21h8M12 17v4" fill="none"/>
      </svg>
    </span>
  </div>
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


function UserLifecycleCell({
  row,
  returnQuery,
  canManage,
  open,
  onToggle
}:{
  row:Row
  returnQuery:string
  canManage:boolean
  open:boolean
  onToggle:()=>void
}){
  if(!canManage)return <span className="row-action-readonly">—</span>

  return <div className="row-action-menu-wrap">
    <button
      type="button"
      className="row-action-kebab"
      aria-label="Mở thao tác"
      aria-expanded={open}
      onClick={onToggle}
    ><span aria-hidden="true">⋮</span></button>

    {open&&<div className="row-action-menu">
      {row.archived_at
        ? <form action={restoreERPUser} className="row-action-menu-form">
            <input type="hidden" name="user_id" value={row.id}/>
            <input type="hidden" name="return_query" value={returnQuery}/>
            <input type="hidden" name="table_action" value="1"/>
            <button className="row-action-menu-item restore" type="submit">Khôi phục User</button>
          </form>
        : <form action={archiveERPUser} className="row-action-menu-form">
            <input type="hidden" name="user_id" value={row.id}/>
            <input type="hidden" name="return_query" value={returnQuery}/>
            <input type="hidden" name="table_action" value="1"/>
            <button className="row-action-menu-item archive" type="submit">Lưu trữ User</button>
          </form>}
    </div>}
  </div>
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
  const [openActionId,setOpenActionId]=useState<string|null>(null)
  const [draggingColumn,setDraggingColumn]=useState<ColKey|null>(null)
  const [dragOverColumn,setDragOverColumn]=useState<ColKey|null>(null)
  const columnManagerRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORAGE_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed)){
          const valid=parsed.filter((x:any)=>ALL.includes(x))
          if(valid.length)setVisible(valid)
        }
      }
      const rawOrder=localStorage.getItem(STORAGE_ORDER_KEY)
      if(rawOrder){
        const parsedOrder=JSON.parse(rawOrder)
        if(Array.isArray(parsedOrder)){
          const validOrder=parsedOrder.filter((x:any)=>ALL.includes(x))
          const missing=ALL.filter(x=>!validOrder.includes(x))
          if(validOrder.length)setColumnOrder([...validOrder,...missing])
        }
      }
    }catch{}
  },[])

  useEffect(()=>{
    const valid=new Set(rows.map((x:any)=>String(x.id)))
    setSelected(prev=>prev.filter(id=>valid.has(id)))
  },[rows])

  useEffect(()=>{
    if(!openActionId)return
    function onPointerDown(event:PointerEvent){
      const target=event.target as HTMLElement|null
      if(target?.closest('.row-action-menu-wrap'))return
      setOpenActionId(null)
    }
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape')setOpenActionId(null)
    }
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return ()=>{
      document.removeEventListener('pointerdown',onPointerDown)
      document.removeEventListener('keydown',onKeyDown)
    }
  },[openActionId])

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
  const colSpan=useMemo(()=>visible.length+1+(canManage?1:0),[visible,canManage])

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
    if(key==='number')return <th key={key}>#</th>
    if(key==='username')return <th key={key}><Link className="sortable-head" href={sortHref(detailQuery,nameNext)}>Username <span>{sort==='name_asc'?'↑':sort==='name_desc'?'↓':'↕'}</span></Link></th>
    if(key==='platform')return <th key={key}>Nền tảng</th>
    if(key==='phone')return <th key={key}>SĐT</th>
    if(key==='email')return <th key={key}>Email</th>
    if(key==='status')return <th key={key}>Trạng thái</th>
    if(key==='device')return <th key={key}>Thiết bị</th>
    if(key==='voucher')return <th key={key}>Voucher đã dùng</th>
    if(key==='orders')return <th key={key}>Số đơn</th>
    if(key==='createdAt')return <th key={key}><Link className="sortable-head" href={sortHref(detailQuery,timeNext)}>Thời gian tạo <span>{sort==='newest'?'↓':sort==='oldest'?'↑':'↕'}</span></Link></th>
    return <th key={key}>Ghi chú</th>
  }

  function renderCell(key:ColKey,u:any,i:number){
    if(key==='number')return <td key={key}>{i+1}</td>
    if(key==='username')return <td key={key}>
      <div className="user-name-actions">
        <Link className="table-link" href={hrefFor(u.id)}>{u.username}</Link>
        {!u.archived_at&&u.status!=='Blocked'&&<Link className="quick-order-link" href={createOrderHref(u.id)} title="Tạo đơn từ User">+ Đơn</Link>}
      </div>
    </td>
    if(key==='platform')return <td key={key}><span className="platform-cell">{u.platform??'SHOPEE'}</span></td>
    if(key==='phone')return <td key={key}>{formatPhone(u.phone)}</td>
    if(key==='email')return <td key={key}>{u.email??'—'}</td>
    if(key==='status')return <td key={key}>{u.archived_at
      ? <span className="status-pill archived">Lưu trữ</span>
      : <span className={'status-pill '+statusClass(u.status)}>{statusLabel(u.status)}</span>}</td>
    if(key==='device')return <td key={key} className="device-icon-cell"><DeviceIcons row={u}/></td>
    if(key==='voucher')return <td key={key} className="voucher-cell"><VoucherTags value={u.voucher_used_summary} compact maxVisible={2}/></td>
    if(key==='orders')return <td key={key} className="count-cell">{u.order_count??0}</td>
    if(key==='createdAt')return <td key={key}>{formatDateTime(u.created_at)}</td>
    return <td key={key} className="truncate">{u.note??'—'}</td>
  }

  return <div className="account-table-shell">
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

    <div className="column-manager" ref={columnManagerRef}>
      <button className="icon-button" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} title="Cột & thứ tự">
        <ColumnIcon/>
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
    </div>

    <div className="card table-card account-table-card">
      <table className="table user-table">
        <thead><tr>
          {canManage&&<th className="bulk-select-col">
            <input type="checkbox" aria-label="Chọn tối đa 200 User" checked={allSelected} onChange={toggleSelectAll} disabled={!rows.length}/>
          </th>}
          {columnOrder.filter(isVisible).map(renderHeader)}
          <th className="row-actions-head" aria-label="Thao tác"></th>
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
                <td className="row-actions-cell">
                  <UserLifecycleCell
                    row={u}
                    returnQuery={detailQuery}
                    canManage={canManage}
                    open={openActionId===String(u.id)}
                    onToggle={()=>setOpenActionId(prev=>prev===String(u.id)?null:String(u.id))}
                  />
                </td>
              </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
