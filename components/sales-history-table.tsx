'use client'

import Link from 'next/link'
import { useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archivePOSSalesBulk,restorePOSSalesBulk } from '@/lib/actions/sales'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'

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
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const eligible=rows.slice(0,200)
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
        : rows.map((row:any)=>{
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

    <div className="sales-history-table-wrap">
      <table className="table sales-history-table">
        <thead><tr>
          {canOperate&&<th className="select-col"><input type="checkbox" aria-label="Chọn tất cả hóa đơn" checked={allSelected} onChange={toggleAll} disabled={!eligible.length}/></th>}
          <th>Mã HĐ</th><th>Thời gian</th><th>Kho</th><th>Khách hàng</th>
          <th>SP</th><th>Tổng tiền</th><th>Đã thu</th><th>Còn nợ</th><th>Thanh toán</th><th>Trạng thái</th>
        </tr></thead>
        <tbody>
          {!rows.length
            ? <tr><td colSpan={canOperate?11:10} className="empty">Chưa có hóa đơn POS phù hợp.</td></tr>
            : rows.map((row:any)=>{
                const qty=(row.sale_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity??0),0)
                const selectedRow=selectedId&&String(selectedId)===String(row.id)
                const checked=selectedSet.has(String(row.id))
                return <tr key={row.id} className={(selectedRow?'selected ':'')+(checked?'bulk-selected':'')}>
                  {canOperate&&<td className="select-col"><input type="checkbox" checked={checked} onChange={()=>toggle(String(row.id))} aria-label={'Chọn '+String(row.invoice_code??row.id)}/></td>}
                  <td><Link className="table-link" href={href(String(row.id))}>{row.invoice_code??'POS-'+String(row.id).slice(0,8)}</Link></td>
                  <td>{formatDateTime(row.sale_at)}</td>
                  <td><b>{row.warehouses?.code??'—'}</b></td>
                  <td><div className="sales-customer-cell"><b>{row.customers?.name??'Khách lẻ'}</b>{row.customers?.phone&&<small>{row.customers.phone}</small>}</div></td>
                  <td>{qty}</td>
                  <td className="money">{formatMoney(row.total_amount)}</td>
                  <td className="money">{formatMoney(row.paid_amount)}</td>
                  <td className="money">{formatMoney(row.debt_amount)}</td>
                  <td><span className={'status-pill '+(row.payment_status==='PAID'?'green':row.payment_status==='PARTIAL'?'orange':'red')}>{statusLabel(row.payment_status)}</span></td>
                  <td><span className={'status-pill '+(row.sale_status==='COMPLETED'?'green':row.sale_status==='CANCELLED'?'red':'orange')}>{statusLabel(row.sale_status)}</span></td>
                </tr>
              })}
        </tbody>
      </table>
    </div>
  </>
}
