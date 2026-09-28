'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'

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

  const cls=(on:boolean)=>'device-icon '+(on?'on':'')

  return <div className="device-icon-set" aria-label="Trạng thái phiên và thiết bị">
    <span className={cls(hasST(row))} title={hasST(row)?'Có SPC_ST':'Chưa có SPC_ST'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5.5 5.5v5.8c0 4.3 2.6 7.7 6.5 9.7 3.9-2 6.5-5.4 6.5-9.7V5.5L12 3Z"/><path d="m9.5 12 1.7 1.7 3.5-3.7"/></svg>
    </span>
    <span className={cls(hasF(row))} title={hasF(row)?'Có SPC_F':'Chưa có SPC_F'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="11.5" r="4"/><path d="m12 11.5 8-8M16 7.5l2 2M14 9.5l2 2"/></svg>
    </span>
    <span className={cls(hasMobile)} title={hasMobile?'Có thiết bị Mobile đang hoạt động':'Không có Mobile đang hoạt động'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/></svg>
    </span>
    <span className={cls(hasWeb)} title={hasWeb?'Có máy/Browser đang hoạt động':'Không có máy/Browser đang hoạt động'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    </span>
  </div>
}

function sortHref(baseQuery:string,nextSort:string){
  const p=new URLSearchParams(baseQuery)
  p.set('sort',nextSort)
  p.delete('user')
  p.delete('mode')
  p.delete('tab')
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
}:{
  rows:Row[]
  selectedId?:string|null
  detailQuery?:string
  sort?:string
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
  const colSpan=useMemo(()=>visible.length,[visible])

  function hrefFor(id:string){
    const p=new URLSearchParams(detailQuery)
    p.set('user',id)
    p.delete('mode')
    return '/purchase/accounts?'+p.toString()
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
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={colSpan} className="empty">Không có tài khoản phù hợp với bộ lọc hiện tại.</td></tr>
            : rows.map((u,i)=><tr key={u.id} className={selectedId===u.id?'selected-row':''}>
                {isVisible('number')&&<td>{i+1}</td>}
                {isVisible('username')&&<td><Link className="table-link" href={hrefFor(u.id)}>{u.username}</Link></td>}
                {isVisible('platform')&&<td><span className="platform-cell">{u.platform??'SHOPEE'}</span></td>}
                {isVisible('phone')&&<td>{formatPhone(u.phone)}</td>}
                {isVisible('email')&&<td>{u.email??'—'}</td>}
                {isVisible('status')&&<td><span className={'status-pill '+statusClass(u.status)}>{statusLabel(u.status)}</span></td>}
                {isVisible('device')&&<td className="device-icon-cell"><DeviceIcons row={u}/></td>}
                {isVisible('voucher')&&<td className="voucher-cell"><VoucherTags value={u.voucher_used_summary}/></td>}
                {isVisible('orders')&&<td className="count-cell">{u.order_count??0}</td>}
                {isVisible('createdAt')&&<td>{formatDateTime(u.created_at)}</td>}
                {isVisible('note')&&<td className="truncate">{u.note??'—'}</td>}
              </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
