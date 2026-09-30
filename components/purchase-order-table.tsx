'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDateTime, formatMoney, statusLabel } from '@/lib/format'
import { VoucherTags } from '@/components/voucher-tags'
import { quickAddTrackingNumber } from '@/lib/actions/core'

type Row=Record<string,any>
type CarrierConfig={
  id:string
  carrier_code:string
  display_name:string
  tracking_prefixes?:string[]|null
}
type ColKey='number'|'order'|'username'|'time'|'product'|'cod'|'tracking'|'carrier'|'voucher'|'status'
type SortKey='order_asc'|'order_desc'|'username_asc'|'username_desc'|'time_new'|'time_old'|'cod_desc'|'cod_asc'|'status_asc'|'status_desc'

const ALL:ColKey[]=['number','order','username','time','product','cod','tracking','carrier','voucher','status']
const LABELS:Record<ColKey,string>={
  number:'#',
  order:'Mã đơn',
  username:'Username',
  time:'Thời gian đặt',
  product:'Sản phẩm',
  cod:'COD',
  tracking:'Mã vận đơn',
  carrier:'ĐVVC',
  voucher:'Voucher',
  status:'Xử lý',
}
const STORAGE_COLUMNS='mynh-v5-purchase-order-columns'
const STORAGE_SORT='mynh-v5-purchase-order-sort'

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
  return vouchers.map(v=>[v.voucher_tag,v.voucher_type].filter(Boolean).join(' · ')).filter(Boolean).join(' · ')
}
function statusKey(row:Row){
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
}:{
  orderId:string
  returnQuery:string
  carrierConfigs:CarrierConfig[]
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
    <select name="carrier_config_id" value={carrierId} onChange={e=>setCarrierId(e.target.value)} required>
      <option value="" disabled>ĐVVC</option>
      {carrierConfigs.map(row=><option key={row.id} value={row.id}>{row.carrier_code}</option>)}
    </select>
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
  const [open,setOpen]=useState(false)
  const [sort,setSort]=useState<SortKey>('time_new')
  const tableWrapRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORAGE_COLUMNS)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed)){
          const valid=parsed.filter((x:any)=>ALL.includes(x))
          if(valid.length)setVisible(valid)
        }
      }
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


  function persistColumns(next:ColKey[]){
    setVisible(next)
    try{localStorage.setItem(STORAGE_COLUMNS,JSON.stringify(next))}catch{}
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
  function hrefFor(id:string){
    const p=new URLSearchParams(baseQuery)
    p.set('order',id)
    p.delete('mode')
    p.delete('settings')
    p.delete('user')
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

  const colSpan=visible.length
  const toggleSort=(a:SortKey,b:SortKey)=>changeSort(sort===a?b:a)

  return <div className="order-table-shell">
    <div className="order-column-manager">
      <button className="icon-button" type="button" onClick={()=>setOpen(v=>!v)} title="Ẩn / hiện cột" aria-expanded={open}>
        <ColumnIcon/>
      </button>
      {open&&<div className="column-manager-menu">
        <div className="column-manager-head">
          <b>Ẩn / hiện cột</b>
          <button type="button" onClick={()=>persistColumns(ALL)}>↺ Mặc định</button>
        </div>
        {ALL.map(k=><label key={k} className={k==='order'?'locked':''}>
          <input type="checkbox" checked={visible.includes(k)} disabled={k==='order'} onChange={()=>toggleColumn(k)}/>
          <span>{LABELS[k]}</span>
        </label>)}
      </div>}
    </div>

    <div className="card table-card order-table-card" ref={tableWrapRef}>
      <table className="table order-table">
        <thead><tr>
          {isVisible('number')&&<th>#</th>}
          {isVisible('order')&&<th><button className="sort-head" type="button" onClick={()=>toggleSort('order_asc','order_desc')}>Mã đơn <span>{sortIndicator(sort,'order_asc','order_desc')}</span></button></th>}
          {isVisible('username')&&<th><button className="sort-head" type="button" onClick={()=>toggleSort('username_asc','username_desc')}>Username <span>{sortIndicator(sort,'username_asc','username_desc')}</span></button></th>}
          {isVisible('time')&&<th><button className="sort-head" type="button" onClick={()=>toggleSort('time_old','time_new')}>Thời gian đặt <span>{sort==='time_new'?'↓':sort==='time_old'?'↑':'↕'}</span></button></th>}
          {isVisible('product')&&<th>Sản phẩm</th>}
          {isVisible('cod')&&<th><button className="sort-head" type="button" onClick={()=>toggleSort('cod_asc','cod_desc')}>COD <span>{sortIndicator(sort,'cod_asc','cod_desc')}</span></button></th>}
          {isVisible('tracking')&&<th>Mã vận đơn</th>}
          {isVisible('carrier')&&<th>ĐVVC</th>}
          {isVisible('voucher')&&<th>Voucher</th>}
          {isVisible('status')&&<th><button className="sort-head" type="button" onClick={()=>toggleSort('status_asc','status_desc')}>Xử lý <span>{sortIndicator(sort,'status_asc','status_desc')}</span></button></th>}
        </tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={colSpan} className="empty">Không có đơn phù hợp với bộ lọc hiện tại.</td></tr>
            : sorted.map((o:any,i:number)=>{
                const s=activeShipment(o)
                return <tr key={o.id} data-selected={selectedId===o.id?'true':undefined} className={selectedId===o.id?'selected-row':''}>
                  {isVisible('number')&&<td>{i+1}</td>}
                  {isVisible('order')&&<td><Link className="table-link" href={hrefFor(o.id)}>{o.shopee_order_id??o.id.slice(0,8)}</Link></td>}
                  {isVisible('username')&&<td>{o.erp_users?.username??'—'}</td>}
                  {isVisible('time')&&<td className="order-time-cell">{formatDateTime(o.order_date)}</td>}
                  {isVisible('product')&&<td className="truncate product-cell">{productSummary(o.order_items??[])}</td>}
                  {isVisible('cod')&&<td className="money">{formatMoney(o.cod)}</td>}
                  {isVisible('tracking')&&<td className="tracking-number-cell">
                    {o.shipping_service==='EXPRESS'
                      ? <span className="tracking-na">Không áp dụng</span>
                      : s?.tracking_number
                        ? <span className="tracking-number-value">{s.tracking_number}</span>
                        : canEdit&&!o.archived_at
                          ? <QuickTrackingEditor orderId={o.id} returnQuery={baseQuery} carrierConfigs={carrierConfigs}/>
                          : <span className="tracking-missing-text">Chưa có</span>}
                  </td>}
                  {isVisible('carrier')&&<td>{o.shipping_service==='EXPRESS'?'Hỏa tốc':s?.carrier??'—'}</td>}
                  {isVisible('voucher')&&<td className="voucher-cell"><VoucherTags value={voucherSummary(o.order_vouchers??[])} compact maxVisible={2}/></td>}
                  {isVisible('status')&&<td>
                    <div className="order-state-cell">
                      {o.shipping_service==='EXPRESS'
                        ? <span className="status-pill orange">Hỏa tốc</span>
                        : s?.tracking_number
                          ? <span className={'status-pill status-'+String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(s?.current_tracking_status)}</span>
                          : <span className="status-pill orange">Chờ mã vận đơn</span>}
                      {o.receive_status!=='NOT_READY'&&<span className={'status-pill '+(o.receive_status==='RECEIVED'?'green':'orange')}>{statusLabel(o.receive_status)}</span>}
                      {o.archived_at&&<span className="status-pill archived">Lưu trữ</span>}
                    </div>
                  </td>}
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </div>
}
