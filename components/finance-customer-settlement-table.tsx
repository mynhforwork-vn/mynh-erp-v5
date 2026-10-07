'use client'

import { useMemo } from 'react'
import { formatDateTime,formatMoney } from '@/lib/format'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type ColKey='customer'|'phone'|'openInvoices'|'totalSales'|'debt'|'paid'|'lastPayment'
const ALL:ColKey[]=['customer','phone','openInvoices','totalSales','debt','paid','lastPayment']
const LABELS:Record<ColKey,string>={
  customer:'Khách hàng',phone:'SĐT',openInvoices:'HĐ còn nợ',totalSales:'Tổng mua',
  debt:'Còn phải thu',paid:'Đã thu trong kỳ',lastPayment:'Thu gần nhất',
}

export function FinanceCustomerSettlementTable({rows}:{rows:any[]}){
  const columns=useManagedColumns<ColKey>('mynh-finance-customer-settlement-columns-v2',ALL,['customer'])
  const sort=useManagedSort<ColKey>('mynh-finance-customer-settlement-sort-v2','debt','desc')
  const sorted=useMemo(()=>{
    const next=[...rows]
    const value=(row:any,key:ColKey)=>{
      if(key==='customer')return String(row.name??'')
      if(key==='phone')return String(row.phone??'')
      if(key==='openInvoices')return Number(row.openInvoices??0)
      if(key==='totalSales')return Number(row.totalSales??0)
      if(key==='debt')return Number(row.debt??0)
      if(key==='paid')return Number(row.paid??0)
      return row.lastPayment?new Date(row.lastPayment).getTime():0
    }
    next.sort((a,b)=>{
      const av=value(a,sort.key),bv=value(b,sort.key)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sort.dir==='asc'?cmp:-cmp
    })
    return next
  },[rows,sort.key,sort.dir])

  return <>
    <div className="managed-table-toolbar">
      <span className="managed-table-meta">{sorted.length} khách hàng · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="compact-table-wrap">
      <table className="table">
        <thead><tr>{columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}</tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={columns.visible.length} className="empty">Chưa có dữ liệu khách hàng phù hợp.</td></tr>
            : sorted.map(row=>{
                const cell=(col:ColKey)=>{
                  if(col==='customer')return <td key={col} className="strong">{row.name}</td>
                  if(col==='phone')return <td key={col}>{row.phone||'—'}</td>
                  if(col==='openInvoices')return <td key={col}>{row.openInvoices}</td>
                  if(col==='totalSales')return <td key={col} className="money">{formatMoney(row.totalSales)}</td>
                  if(col==='debt')return <td key={col} className="money warning-text">{formatMoney(row.debt)}</td>
                  if(col==='paid')return <td key={col} className="money finance-money income">{formatMoney(row.paid)}</td>
                  return <td key={col}>{row.lastPayment?formatDateTime(row.lastPayment):'—'}</td>
                }
                return <tr key={row.id}>{columns.visible.map(cell)}</tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
