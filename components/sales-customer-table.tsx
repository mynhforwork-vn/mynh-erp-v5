'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { formatMoney } from '@/lib/format'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type ColKey='customer'|'phone'|'last'|'orders'|'total'|'debt'|'status'
const ALL:ColKey[]=['customer','phone','last','orders','total','debt','status']
const LABELS:Record<ColKey,string>={
  customer:'Khách hàng',phone:'SĐT',last:'Lần mua gần nhất',orders:'Số HĐ',
  total:'Tổng mua',debt:'Còn nợ',status:'Trạng thái',
}

function phone(value?:string|null){
  const v=String(value??'').replace(/\D/g,'')
  if(v.length===10)return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')
  return value||'—'
}
function fmtDate(value?:string|null){
  if(!value)return '—'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '—'
  return new Intl.DateTimeFormat('vi-VN',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ho_Chi_Minh',
  }).format(d)
}

export function SalesCustomerTable({rows,selectedId,baseQuery}:{rows:any[],selectedId?:string|null,baseQuery:string}){
  const columns=useManagedColumns<ColKey>('mynh-sales-customer-columns-v2',ALL,['customer'])
  const sort=useManagedSort<ColKey>('mynh-sales-customer-sort-v2','last','desc')
  const sorted=useMemo(()=>{
    const next=[...rows]
    const value=(row:any,key:ColKey)=>{
      if(key==='customer')return String(row.name??'')
      if(key==='phone')return String(row.phone??'')
      if(key==='last')return row.last?new Date(row.last).getTime():0
      if(key==='orders')return Number(row.orders??0)
      if(key==='total')return Number(row.total??0)
      if(key==='debt')return Number(row.debt??0)
      return Number(row.debt??0)>0?'debt':'ok'
    }
    next.sort((a,b)=>{
      const av=value(a,sort.key),bv=value(b,sort.key)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sort.dir==='asc'?cmp:-cmp
    })
    return next
  },[rows,sort.key,sort.dir])

  function href(id:string){
    const p=new URLSearchParams(baseQuery)
    p.set('customer',id)
    p.set('tab','info')
    p.delete('mode');p.delete('sale');p.delete('saleTab')
    return '/sales/customers?'+p.toString()
  }

  return <>
    <div className="managed-table-toolbar">
      <span className="managed-table-meta">{sorted.length} khách hàng · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="customer-demo-table-wrap">
      <table className="table customer-demo-table">
        <thead><tr>{columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}</tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={columns.visible.length}><div className="empty compact">Không có khách hàng phù hợp.</div></td></tr>
            : sorted.map(row=>{
                const cell=(col:ColKey)=>{
                  if(col==='customer')return <td key={col}><Link className="table-link" href={href(String(row.id))}>{row.name}</Link><small>{row.address||'—'}</small></td>
                  if(col==='phone')return <td key={col}>{phone(row.phone)}</td>
                  if(col==='last')return <td key={col}>{fmtDate(row.last)}</td>
                  if(col==='orders')return <td key={col}>{row.orders}</td>
                  if(col==='total')return <td key={col} className="money">{formatMoney(row.total)}</td>
                  if(col==='debt')return <td key={col} className={'money '+(Number(row.debt)>0?'warning-text':'')}>{formatMoney(row.debt)}</td>
                  return <td key={col}>{Number(row.debt)>0?<span className="status-pill orange">Còn nợ</span>:<span className="status-pill green">Bình thường</span>}</td>
                }
                return <tr key={row.id} className={selectedId===String(row.id)?'selected':''}>{columns.visible.map(cell)}</tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
