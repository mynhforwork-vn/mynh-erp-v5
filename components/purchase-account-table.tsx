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
  status:'Trạng thái',device:'Thiết bị',voucher:'Voucher',orders:'Số đơn',
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

function DeviceSet({row}:{row:Row}){
  return <div className="device-set" aria-label="Thiết bị và phiên">
    <span className={hasST(row)?'on':''} title="SPC_ST">ST</span>
    <span className={hasF(row)?'on':''} title="SPC_F">F</span>
    <span className={row.mobile?'on':''} title="Mobile">M</span>
    <span className={row.web?'on':''} title={'Web'+(row.browser_name?' · '+row.browser_name:'')}>W</span>
  </div>
}

export function PurchaseAccountTable({
  rows,
  selectedId,
  detailQuery='',
}:{
  rows:Row[]
  selectedId?:string|null
  detailQuery?:string
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
  function reset(){
    persist(ALL)
  }
  function isVisible(k:ColKey){return visible.includes(k)}
  const colSpan=useMemo(()=>visible.length,[visible])

  function hrefFor(id:string){
    const p=new URLSearchParams(detailQuery)
    p.set('user',id)
    p.delete('mode')
    return '/purchase/accounts?'+p.toString()
  }

  return <div className="account-table-shell">
    <div className="column-manager">
      <button className="button small" type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
        Cột · {visible.length}/{ALL.length}
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
          {isVisible('username')&&<th>Username</th>}
          {isVisible('platform')&&<th>Nền tảng</th>}
          {isVisible('phone')&&<th>SĐT</th>}
          {isVisible('email')&&<th>Email</th>}
          {isVisible('status')&&<th>Trạng thái</th>}
          {isVisible('device')&&<th>Thiết bị</th>}
          {isVisible('voucher')&&<th>Voucher</th>}
          {isVisible('orders')&&<th>Số đơn</th>}
          {isVisible('createdAt')&&<th>Thời gian tạo</th>}
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
                {isVisible('device')&&<td><DeviceSet row={u}/></td>}
                {isVisible('voucher')&&<td className="voucher-cell"><VoucherTags value={u.voucher_summary}/></td>}
                {isVisible('orders')&&<td className="count-cell">{u.order_count??0}</td>}
                {isVisible('createdAt')&&<td>{formatDateTime(u.created_at)}</td>}
                {isVisible('note')&&<td className="truncate">{u.note??'—'}</td>}
              </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
