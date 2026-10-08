'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { formatMoney } from '@/lib/format'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type ColKey='customer'|'phone'|'invoices'|'debt'|'oldest'|'lastPayment'|'actions'
const ALL:ColKey[]=['customer','phone','invoices','debt','oldest','lastPayment','actions']
const LABELS:Record<ColKey,string>={
  customer:'Khách hàng',phone:'SĐT',invoices:'Số HĐ nợ',debt:'Công nợ',oldest:'Nợ cũ nhất',lastPayment:'Thu gần nhất',actions:'Xử lý',
}
function phone(value?:string|null){
  const v=String(value??'').replace(/\D/g,'')
  if(v.length===10)return v.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3')
  return value||'—'
}
function fmtDate(value?:string|null,withTime=true){
  if(!value)return '—'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '—'
  return new Intl.DateTimeFormat('vi-VN',withTime
    ?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ho_Chi_Minh'}
    :{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}
  ).format(d)
}

export function SalesDebtTable({rows,selectedId,baseQuery}:{rows:any[],selectedId?:string|null,baseQuery:string}){
  const columns=useManagedColumns<ColKey>('mynh-sales-debt-columns-v2',ALL,['customer'])
  const sort=useManagedSort<ColKey>('mynh-sales-debt-sort-v2','debt','desc')
  const sorted=useMemo(()=>{
    const next=[...rows]
    const value=(row:any,key:ColKey)=>{
      if(key==='customer')return String(row.name??'')
      if(key==='phone')return String(row.phone??'')
      if(key==='invoices')return Number(row.invoices??0)
      if(key==='debt')return Number(row.debt??0)
      if(key==='oldest')return row.oldest?new Date(row.oldest).getTime():0
      if(key==='lastPayment')return row.lastPayment?new Date(row.lastPayment).getTime():0
      return Number(row.debt??0)
    }
    next.sort((a,b)=>{
      const av=value(a,sort.key),bv=value(b,sort.key)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sort.dir==='asc'?cmp:-cmp
    })
    return next
  },[rows,sort.key,sort.dir])

  function href(id:string,mode?:'collect'){
    const p=new URLSearchParams(baseQuery)
    p.set('customer',id)
    p.set('tab','summary')
    if(mode)p.set('mode',mode);else p.delete('mode')
    p.delete('sale');p.delete('saleTab')
    return '/sales/debt?'+p.toString()
  }

  return <>
    <div className="managed-table-toolbar">
      <span className="managed-table-meta">{sorted.length} khách còn nợ · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="debt-demo-table-wrap">
      <table className="table debt-demo-table">
        <thead><tr>{columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}</tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={columns.visible.length}><div className="empty compact">Không có công nợ phù hợp bộ lọc.</div></td></tr>
            : sorted.map(row=>{
                const cell=(col:ColKey)=>{
                  if(col==='customer')return <td key={col}><Link className="table-link" href={href(String(row.customer_id))}>{row.name}</Link><small>{row.address||'—'}</small></td>
                  if(col==='phone')return <td key={col}>{phone(row.phone)}</td>
                  if(col==='invoices')return <td key={col}>{row.invoices}</td>
                  if(col==='debt')return <td key={col} className="money warning-text">{formatMoney(row.debt)}</td>
                  if(col==='oldest')return <td key={col}>{fmtDate(row.oldest,false)}<small>{row.age===0?'Hôm nay':row.age+' ngày'}</small></td>
                  if(col==='lastPayment')return <td key={col}>{fmtDate(row.lastPayment)}</td>
                  return <td key={col}><Link className="button small primary" href={href(String(row.customer_id),'collect')}>Thu nợ</Link></td>
                }
                return <tr key={row.customer_id} className={selectedId===String(row.customer_id)?'selected':''}>{columns.visible.map(cell)}</tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
