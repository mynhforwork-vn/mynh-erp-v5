'use client'

import { useMemo } from 'react'
import { formatMoney } from '@/lib/format'
import { displayVnDateKey } from '@/lib/finance-period'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type Row={key:string,revenue:number,income:number,expense:number}
type ColKey='date'|'revenue'|'income'|'expense'|'net'
const ALL:ColKey[]=['date','revenue','income','expense','net']
const LABELS:Record<ColKey,string>={
  date:'Ngày',revenue:'Doanh thu bán',income:'Tiền vào',expense:'Tiền ra',net:'Dòng tiền ròng',
}

export function FinanceReportDayTable({rows}:{rows:Row[]}){
  const columns=useManagedColumns<ColKey>('mynh-finance-report-day-columns-v2',ALL,['date'])
  const sort=useManagedSort<ColKey>('mynh-finance-report-day-sort-v2','date','desc')
  const sorted=useMemo(()=>{
    const next=[...rows]
    const value=(row:Row,key:ColKey)=>{
      if(key==='date')return row.key
      if(key==='revenue')return row.revenue
      if(key==='income')return row.income
      if(key==='expense')return row.expense
      return row.income-row.expense
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
      <span className="managed-table-meta">{sorted.length} ngày có phát sinh · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="compact-table-wrap finance-report-day-table-wrap">
      <table className="table">
        <thead><tr>{columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}</tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={columns.visible.length} className="empty">Chưa có dữ liệu trong kỳ.</td></tr>
            : sorted.map(row=>{
                const cell=(col:ColKey)=>{
                  if(col==='date')return <td key={col} className="strong">{displayVnDateKey(row.key)}</td>
                  if(col==='revenue')return <td key={col} className="money">{formatMoney(row.revenue)}</td>
                  if(col==='income')return <td key={col} className="money finance-money income">{formatMoney(row.income)}</td>
                  if(col==='expense')return <td key={col} className="money finance-money expense">{formatMoney(row.expense)}</td>
                  return <td key={col} className="money">{formatMoney(row.income-row.expense)}</td>
                }
                return <tr key={row.key}>{columns.visible.map(cell)}</tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
