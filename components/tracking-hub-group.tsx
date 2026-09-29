'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { confirmReceiveOrders } from '@/lib/actions/core'
import { ManualSyncButton } from '@/components/manual-sync-button'
import { formatMoney, formatPhone, statusLabel } from '@/lib/format'

type OrderRow={
  id:string
  shopee_order_id?:string|null
  tracking_number?:string|null
  carrier?:string|null
  product_summary?:string|null
  cod?:number|string|null
  recipient_name?:string|null
  recipient_phone?:string|null
  recipient_address?:string|null
  receive_status?:string|null
  tracking_status?:string|null
  shipment_id?:string|null
}
type Warehouse={id:string,code?:string|null,name?:string|null}

export function TrackingHubGroup({
  hub,
  rows,
  warehouses,
  contextQuery='',
}:{
  hub:string
  rows:OrderRow[]
  warehouses:Warehouse[]
  contextQuery?:string
}){
  const eligible=rows.filter(r=>r.receive_status==='WAITING_RECEIVE')
  const [selected,setSelected]=useState<string[]>([])
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const selectedRows=eligible.filter(r=>selectedSet.has(r.id))
  const selectedCod=selectedRows.reduce((s,r)=>s+Number(r.cod??0),0)
  const allSelected=eligible.length>0&&selected.length===eligible.length

  function toggleAll(){
    setSelected(allSelected?[]:eligible.map(r=>r.id))
  }
  function toggle(id:string){
    setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
  }

  function orderHref(id:string){
    const p=new URLSearchParams(contextQuery)
    p.set('order',id)
    p.set('tab','tracking')
    return '/purchase/orders?'+p.toString()
  }

  return <section className="card tracking-hub-card">
    <div className="tracking-hub-head">
      <div>
        <span className="module-eyebrow">KHO ĐÍCH</span>
        <h2>{hub}</h2>
      </div>
      <div className="tracking-hub-stats">
        <span><b>{rows.length}</b> đơn</span>
        <span><b>{eligible.length}</b> chờ nhận</span>
      </div>
    </div>

    <div className="tracking-hub-table-wrap">
      <table className="table tracking-hub-table">
        <thead><tr>
          <th className="select-col">
            <input type="checkbox" aria-label="Chọn tất cả đơn chờ nhận" checked={allSelected} onChange={toggleAll} disabled={!eligible.length}/>
          </th>
          <th>Mã đơn / MVĐ</th>
          <th>Sản phẩm</th>
          <th>COD</th>
          <th>Người nhận</th>
          <th>Trạng thái</th>
          <th>Xử lý</th>
        </tr></thead>
        <tbody>
          {rows.map(r=>{
            const canReceive=r.receive_status==='WAITING_RECEIVE'
            return <tr key={r.id}>
              <td className="select-col">
                <input
                  type="checkbox"
                  name="pick"
                  aria-label={'Chọn '+(r.shopee_order_id??r.id)}
                  checked={selectedSet.has(r.id)}
                  onChange={()=>toggle(r.id)}
                  disabled={!canReceive}
                />
              </td>
              <td>
                <div className="tracking-order-id">
                  <Link className="table-link" href={orderHref(r.id)}>{r.shopee_order_id??r.id.slice(0,8)}</Link>
                  <span>{r.tracking_number??'Chưa có MVĐ'}{r.carrier?' · '+r.carrier:''}</span>
                </div>
              </td>
              <td className="truncate tracking-product-cell">{r.product_summary??'—'}</td>
              <td className="money">{formatMoney(r.cod)}</td>
              <td>
                <div className="tracking-recipient">
                  <b>{r.recipient_name??'—'}</b>
                  <span>{formatPhone(r.recipient_phone)}</span>
                </div>
              </td>
              <td>
                <div className="order-state-cell">
                  <span className={'status-pill status-'+String(r.tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(r.tracking_status)}</span>
                  {r.receive_status!=='NOT_READY'&&<span className={'status-pill '+(r.receive_status==='RECEIVED'?'green':'orange')}>{statusLabel(r.receive_status)}</span>}
                </div>
              </td>
              <td>
                <div className="tracking-row-actions">
                  {r.shipment_id&&!['DELIVERED','CANCELLED','RETURNED'].includes(String(r.tracking_status))&&<ManualSyncButton shipmentId={r.shipment_id}/>}
                  <Link className="button small" href={'/purchase/orders?order='+r.id+'&tab=tracking'}>Chi tiết</Link>
                </div>
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>

    {eligible.length>0&&
      <form action={confirmReceiveOrders} className="receive-confirm-bar">
        <input type="hidden" name="return_query" value={contextQuery}/>
        {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}
        <div className="receive-selection">
          <span>Đã chọn</span>
          <b>{selected.length} đơn</b>
          <small>COD {formatMoney(selectedCod)}</small>
        </div>
        <label>
          <span>Kho nhận</span>
          <select name="warehouse_id" required defaultValue="">
            <option value="" disabled>Chọn kho</option>
            {warehouses.map(w=><option value={w.id} key={w.id}>{(w.code?w.code+' · ':'')+(w.name??'Kho')}</option>)}
          </select>
        </label>
        <label className="receive-note">
          <span>Ghi chú</span>
          <input name="note" placeholder="Không bắt buộc"/>
        </label>
        <button className="button primary" disabled={!selected.length}>Xác nhận đã nhận</button>
      </form>
    }
  </section>
}
