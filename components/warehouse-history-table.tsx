'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { formatDateTime } from '@/lib/format'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type ColKey='time'|'warehouse'|'sku'|'product'|'variant'|'operation'|'qty'|'reference'
const ALL:ColKey[]=['time','warehouse','sku','product','variant','operation','qty','reference']
const LABELS:Record<ColKey,string>={
  time:'Thời gian',warehouse:'Kho',sku:'SKU bán',product:'Sản phẩm',variant:'Phân loại',operation:'Nghiệp vụ',qty:'SL',reference:'Chứng từ',
}
const IN_TYPES=new Set(['IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN'])

function txLabel(type:string,referenceType?:string|null){
  if(String(referenceType??'').startsWith('STOCKTAKE'))return 'Kiểm kê'
  if(type==='IN')return 'Nhập kho'
  if(type==='OUT')return 'Xuất kho'
  if(type==='TRANSFER_IN')return 'Nhận chuyển'
  if(type==='TRANSFER_OUT')return 'Chuyển kho'
  if(type==='SALE')return 'Bán hàng'
  if(type==='RETURN')return 'Hoàn hàng'
  if(type==='ADJUSTMENT_IN')return 'Điều chỉnh tăng'
  if(type==='ADJUSTMENT_OUT')return 'Điều chỉnh giảm'
  return type
}

export function WarehouseHistoryTable({rows,selectedId,baseQuery}:{rows:any[],selectedId?:string|null,baseQuery:string}){
  const columns=useManagedColumns<ColKey>('mynh-warehouse-history-columns-v2',ALL,['time'])
  const sort=useManagedSort<ColKey>('mynh-warehouse-history-sort-v2','time','desc')
  const sorted=useMemo(()=>{
    const next=[...rows]
    const value=(row:any,key:ColKey)=>{
      if(key==='time')return new Date(row.created_at??0).getTime()
      if(key==='warehouse')return String(row.warehouses?.code??'')
      if(key==='sku')return String(row.product_variants?.products?.sku??'')
      if(key==='product')return String(row.product_variants?.products?.name??'')
      if(key==='variant')return String(row.product_variants?.variant_name??'')
      if(key==='operation')return txLabel(String(row.tx_type??''),row.reference_type)
      if(key==='qty')return Number(row.quantity??0)*(IN_TYPES.has(String(row.tx_type))?1:-1)
      return String(row.reference_type??'')+' '+String(row.reference_id??'')
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
    p.set('tx',id)
    p.delete('sale');p.delete('saleTab');p.delete('order');p.delete('orderTab')
    return '/warehouse/history?'+p.toString()
  }

  return <>
    <div className="managed-table-toolbar">
      <span className="managed-table-meta">{sorted.length} giao dịch · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="whx-table-scroll">
      <table className="table whx-table">
        <thead><tr>{columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}</tr></thead>
        <tbody>
          {!sorted.length
            ? <tr><td colSpan={columns.visible.length} className="empty">Chưa có giao dịch kho phù hợp.</td></tr>
            : sorted.map(row=>{
                const incoming=IN_TYPES.has(String(row.tx_type))
                const stocktake=String(row.reference_type??'').startsWith('STOCKTAKE')
                const cell=(col:ColKey)=>{
                  if(col==='time')return <td key={col}>{formatDateTime(row.created_at)}</td>
                  if(col==='warehouse')return <td key={col}><b>{row.warehouses?.code??'—'}</b></td>
                  if(col==='sku')return <td key={col}><b className="whx-link-text">{row.product_variants?.products?.sku??'—'}</b></td>
                  if(col==='product')return <td key={col}>{row.product_variants?.products?.name??'—'}</td>
                  if(col==='variant')return <td key={col}>{row.product_variants?.variant_name??'—'}</td>
                  if(col==='operation')return <td key={col}><span className={'whx-tx-type '+(stocktake?'stocktake':incoming?'in':'out')}>{txLabel(String(row.tx_type),row.reference_type)}</span></td>
                  if(col==='qty')return <td key={col} className={'whx-tx-qty '+(incoming?'in':'out')}>{incoming?'+':'-'}{row.quantity}</td>
                  return <td key={col}><Link className="whx-reference whx-reference-link" href={href(String(row.id))}><b>{row.reference_type??'—'}</b><span>{row.reference_id?String(row.reference_id).slice(0,8):'Không mã'} · Xem →</span></Link></td>
                }
                return <tr key={row.id} className={selectedId===String(row.id)?'selected':''}>{columns.visible.map(cell)}</tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
