'use client'

import Link from 'next/link'
import { useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archivePOSSalesBulk,restorePOSSalesBulk } from '@/lib/actions/sales'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { ManagedColumnsMenu,SortableHeader,useManagedColumns,useManagedSort } from '@/components/managed-table-columns'

type ColKey='invoice'|'time'|'warehouse'|'customer'|'qty'|'total'|'paid'|'debt'|'payment'|'status'
const ALL:ColKey[]=['invoice','time','warehouse','customer','qty','total','paid','debt','payment','status']
const LABELS:Record<ColKey,string>={
  invoice:'Mã HĐ',time:'Thời gian',warehouse:'Kho',customer:'Khách hàng',qty:'SP',
  total:'Tổng tiền',paid:'Đã thu',debt:'Còn nợ',payment:'Thanh toán',status:'Trạng thái',
}

export function SalesHistoryTable({
  rows,
  selectedId,
  baseQuery,
  archiveView,
  canOperate,
}:{
  rows:any[]
  selectedId?:string|null
  baseQuery:string
  archiveView:boolean
  canOperate:boolean
}){
  const router=useRouter()
  const [selected,setSelected]=useState<string[]>([])
  const [message,setMessage]=useState('')
  const [pending,startTransition]=useTransition()
  const columns=useManagedColumns<ColKey>('mynh-sales-history-columns-v2',ALL,['invoice'])
  const sort=useManagedSort<ColKey>('mynh-sales-history-sort-v2','time','desc')
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const sortedRows=useMemo(()=>{
    const next=[...rows]
    const value=(row:any,key:ColKey)=>{
      if(key==='invoice')return String(row.invoice_code??row.id??'')
      if(key==='time')return new Date(row.sale_at??0).getTime()
      if(key==='warehouse')return String(row.warehouses?.code??'')
      if(key==='customer')return String(row.customers?.name??'Khách lẻ')
      if(key==='qty')return (row.sale_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity??0),0)
      if(key==='total')return Number(row.total_amount??0)
      if(key==='paid')return Number(row.paid_amount??0)
      if(key==='debt')return Number(row.debt_amount??0)
      if(key==='payment')return String(row.payment_status??'')
      return String(row.sale_status??'')
    }
    next.sort((a,b)=>{
      const av=value(a,sort.key),bv=value(b,sort.key)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sort.dir==='asc'?cmp:-cmp
    })
    return next
  },[rows,sort.key,sort.dir])
  const eligible=sortedRows.slice(0,200)
  const allSelected=eligible.length>0&&eligible.every(row=>selectedSet.has(String(row.id)))

  function href(id:string){
    const p=new URLSearchParams(baseQuery)
    p.set('sale',id)
    p.set('tab','info')
    return '/sales/history?'+p.toString()
  }
  function toggle(id:string){
    setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=200?prev:[...prev,id])
  }
  function toggleAll(){
    if(allSelected){setSelected([]);return}
    setSelected(eligible.map(row=>String(row.id)))
  }
  function apply(){
    if(!selected.length)return
    setMessage('')
    startTransition(async()=>{
      const result=archiveView
        ? await restorePOSSalesBulk(selected)
        : await archivePOSSalesBulk(selected)
      if(!result.ok){setMessage(result.error);return}
      setSelected([])
      router.refresh()
    })
  }

  return <>
    {canOperate&&<div className="sales-history-bulkbar">
      <label><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!eligible.length}/><span>Chọn tối đa 200</span></label>
      <b>{selected.length} đã chọn</b>
      {!!selected.length&&<button className="button small primary" type="button" onClick={apply} disabled={pending}>
        {pending?'Đang xử lý...':archiveView?'Khôi phục đã chọn':'Lưu trữ đã chọn'}
      </button>}
      {!!selected.length&&<button className="button small" type="button" onClick={()=>setSelected([])} disabled={pending}>Bỏ chọn</button>}
      {message&&<span className="danger-text">{message}</span>}
    </div>}

    <div className="mobile-entity-list mobile-sales-history-list">
      {!rows.length
        ? <div className="mobile-empty-state">Chưa có hóa đơn POS phù hợp.</div>
        : sortedRows.map((row:any)=>{
            const qty=(row.sale_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity??0),0)
            const checked=selectedSet.has(String(row.id))
            const selectedRow=selectedId&&String(selectedId)===String(row.id)
            return <article className={'mobile-entity-card '+(selectedRow?'selected':'')} key={'mobile-'+row.id}>
              <div className="mobile-entity-card-head">
                {canOperate&&<input className="mobile-card-check" type="checkbox" checked={checked} onChange={()=>toggle(String(row.id))} aria-label={'Chọn '+String(row.invoice_code??row.id)}/>}
                <div className="mobile-entity-card-title">
                  <Link href={href(String(row.id))}>{row.invoice_code??'POS-'+String(row.id).slice(0,8)}</Link>
                  <span>{formatDateTime(row.sale_at)} · {row.warehouses?.code??'—'}</span>
                </div>
                <span className={'status-pill '+(row.sale_status==='COMPLETED'?'green':row.sale_status==='CANCELLED'?'red':'orange')}>{statusLabel(row.sale_status)}</span>
              </div>
              <div className="mobile-order-product">
                <b>{row.customers?.name??'Khách lẻ'}</b>
                <span>{row.customers?.phone??'Không SĐT'} · {qty} sản phẩm</span>
              </div>
              <div className="mobile-order-meta">
                <div><span>Tổng tiền</span><b>{formatMoney(row.total_amount)}</b></div>
                <div><span>Còn nợ</span><b>{formatMoney(row.debt_amount)}</b></div>
              </div>
              <div className="mobile-entity-card-foot">
                <span className={'status-pill '+(row.payment_status==='PAID'?'green':row.payment_status==='PARTIAL'?'orange':'red')}>{statusLabel(row.payment_status)}</span>
                <Link href={href(String(row.id))} className="mobile-card-open">Chi tiết ›</Link>
              </div>
            </article>
          })}
    </div>

    <div className="managed-table-toolbar sales-history-table-toolbar">
      <span className="managed-table-meta">{sortedRows.length} hóa đơn · Click tiêu đề để sắp xếp</span>
      <ManagedColumnsMenu labels={LABELS} manager={columns}/>
    </div>
    <div className="sales-history-table-wrap">
      <table className="table sales-history-table">
        <thead><tr>
          {canOperate&&<th className="select-col"><input type="checkbox" aria-label="Chọn tất cả hóa đơn" checked={allSelected} onChange={toggleAll} disabled={!eligible.length}/></th>}
          {columns.visible.map(col=><th key={col}><SortableHeader column={col} label={LABELS[col]} sort={sort} onSort={sort.toggle}/></th>)}
        </tr></thead>
        <tbody>
          {!sortedRows.length
            ? <tr><td colSpan={columns.visible.length+(canOperate?1:0)} className="empty">Chưa có hóa đơn POS phù hợp.</td></tr>
            : sortedRows.map((row:any)=>{
                const qty=(row.sale_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity??0),0)
                const selectedRow=selectedId&&String(selectedId)===String(row.id)
                const checked=selectedSet.has(String(row.id))
                const cell=(col:ColKey)=>{
                  if(col==='invoice')return <td key={col}><Link className="table-link" href={href(String(row.id))}>{row.invoice_code??'POS-'+String(row.id).slice(0,8)}</Link></td>
                  if(col==='time')return <td key={col}>{formatDateTime(row.sale_at)}</td>
                  if(col==='warehouse')return <td key={col}><b>{row.warehouses?.code??'—'}</b></td>
                  if(col==='customer')return <td key={col}><div className="sales-customer-cell"><b>{row.customers?.name??'Khách lẻ'}</b>{row.customers?.phone&&<small>{row.customers.phone}</small>}</div></td>
                  if(col==='qty')return <td key={col}>{qty}</td>
                  if(col==='total')return <td key={col} className="money">{formatMoney(row.total_amount)}</td>
                  if(col==='paid')return <td key={col} className="money">{formatMoney(row.paid_amount)}</td>
                  if(col==='debt')return <td key={col} className="money">{formatMoney(row.debt_amount)}</td>
                  if(col==='payment')return <td key={col}><span className={'status-pill '+(row.payment_status==='PAID'?'green':row.payment_status==='PARTIAL'?'orange':'red')}>{statusLabel(row.payment_status)}</span></td>
                  return <td key={col}><span className={'status-pill '+(row.sale_status==='COMPLETED'?'green':row.sale_status==='CANCELLED'?'red':'orange')}>{statusLabel(row.sale_status)}</span></td>
                }
                return <tr key={row.id} className={(selectedRow?'selected ':'')+(checked?'bulk-selected':'')}>
                  {canOperate&&<td className="select-col"><input type="checkbox" checked={checked} onChange={()=>toggle(String(row.id))} aria-label={'Chọn '+String(row.invoice_code??row.id)}/></td>}
                  {columns.visible.map(cell)}
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
