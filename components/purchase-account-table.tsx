'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { archiveERPUser, restoreERPUser } from '@/lib/actions/core'

type Row=Record<string,any>
type ColKey='number'|'username'|'platform'|'phone'|'email'|'status'|'device'|'voucher'|'orders'|'createdAt'|'note'

const ALL:ColKey[]=['number','username','platform','phone','email','status','device','voucher','orders','createdAt','note']
const LABELS:Record<ColKey,string>={
  number:'#',username:'Username',platform:'Nền tảng',phone:'SĐT',email:'Email',
  status:'Trạng thái',device:'Thiết bị',voucher:'Voucher đã dùng',orders:'Số đơn',
  createdAt:'Thời gian tạo',note:'Ghi chú'
}
const STORAGE_KEY='mynh-v5-purchase-account-columns'

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
}:{
  row:Row
  returnQuery:string
  canManage:boolean
}){
  const [menuOpen,setMenuOpen]=useState(false)
  if(!canManage)return <span className="row-action-readonly">—</span>

  return <div className="row-action-menu-wrap">
    <button
      type="button"
      className="row-action-kebab"
      aria-label="Mở thao tác"
      aria-expanded={menuOpen}
      onClick={()=>setMenuOpen(v=>!v)}
    >•••</button>

    {menuOpen&&<div className="row-action-menu">
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
      <button type="button" className="row-action-menu-dismiss" onClick={()=>setMenuOpen(false)}>Đóng</button>
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
  const [open,setOpen]=useState(false)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORAGE_KEY)
      if(!raw)return
      const parsed=JSON.parse(raw)
      if(Array.isArray(parsed)){
        const valid=parsed.filter((x:any)=>ALL.includes(x))
        if(valid.length)setVisible(valid)
      }
    }catch{}
  },[])

  function persist(next:ColKey[]){
    setVisible(next)
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch{}
  }
  function toggle(key:ColKey){
    if(key==='username')return
    const next=visible.includes(key)?visible.filter(x=>x!==key):ALL.filter(x=>x===key||visible.includes(x))
    persist(next)
  }
  function reset(){persist(ALL)}
  function isVisible(k:ColKey){return visible.includes(k)}
  const colSpan=useMemo(()=>visible.length+1,[visible])

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

  return <div className="account-table-shell">
    <div className="column-manager">
      <button className="icon-button" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} title="Ẩn / hiện cột">
        <ColumnIcon/>
      </button>
      {open&&<div className="column-manager-menu">
        <div className="column-manager-head"><b>Ẩn / hiện cột</b><button type="button" onClick={reset}>↺ Mặc định</button></div>
        {ALL.map(k=><label key={k} className={k==='username'?'locked':''}>
          <input type="checkbox" checked={visible.includes(k)} disabled={k==='username'} onChange={()=>toggle(k)}/>
          <span>{LABELS[k]}</span>
        </label>)}
      </div>}
    </div>

    <div className="card table-card account-table-card">
      <table className="table user-table">
        <thead><tr>
          {isVisible('number')&&<th>#</th>}
          {isVisible('username')&&<th><Link className="sortable-head" href={sortHref(detailQuery,nameNext)}>Username <span>{sort==='name_asc'?'↑':sort==='name_desc'?'↓':'↕'}</span></Link></th>}
          {isVisible('platform')&&<th>Nền tảng</th>}
          {isVisible('phone')&&<th>SĐT</th>}
          {isVisible('email')&&<th>Email</th>}
          {isVisible('status')&&<th>Trạng thái</th>}
          {isVisible('device')&&<th>Thiết bị</th>}
          {isVisible('voucher')&&<th>Voucher đã dùng</th>}
          {isVisible('orders')&&<th>Số đơn</th>}
          {isVisible('createdAt')&&<th><Link className="sortable-head" href={sortHref(detailQuery,timeNext)}>Thời gian tạo <span>{sort==='newest'?'↓':sort==='oldest'?'↑':'↕'}</span></Link></th>}
          {isVisible('note')&&<th>Ghi chú</th>}
          <th className="row-actions-head" aria-label="Thao tác"><span>•••</span></th>
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={colSpan} className="empty">Không có tài khoản phù hợp với bộ lọc hiện tại.</td></tr>
            : rows.map((u,i)=><tr key={u.id} className={selectedId===u.id?'selected-row':''}>
                {isVisible('number')&&<td>{i+1}</td>}
                {isVisible('username')&&<td>
                  <div className="user-name-actions">
                    <Link className="table-link" href={hrefFor(u.id)}>{u.username}</Link>
                    {!u.archived_at&&u.status!=='Blocked'&&<Link className="quick-order-link" href={createOrderHref(u.id)} title="Tạo đơn từ User">+ Đơn</Link>}
                  </div>
                </td>}
                {isVisible('platform')&&<td><span className="platform-cell">{u.platform??'SHOPEE'}</span></td>}
                {isVisible('phone')&&<td>{formatPhone(u.phone)}</td>}
                {isVisible('email')&&<td>{u.email??'—'}</td>}
                {isVisible('status')&&<td>{u.archived_at
                  ? <span className="status-pill archived">Lưu trữ</span>
                  : <span className={'status-pill '+statusClass(u.status)}>{statusLabel(u.status)}</span>}</td>}
                {isVisible('device')&&<td className="device-icon-cell"><DeviceIcons row={u}/></td>}
                {isVisible('voucher')&&<td className="voucher-cell"><VoucherTags value={u.voucher_used_summary} compact maxVisible={2}/></td>}
                {isVisible('orders')&&<td className="count-cell">{u.order_count??0}</td>}
                {isVisible('createdAt')&&<td>{formatDateTime(u.created_at)}</td>}
                {isVisible('note')&&<td className="truncate">{u.note??'—'}</td>}
                <td className="row-actions-cell">
                  <UserLifecycleCell row={u} returnQuery={detailQuery} canManage={canManage}/>
                </td>
              </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
