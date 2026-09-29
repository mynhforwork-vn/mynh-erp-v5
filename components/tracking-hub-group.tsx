'use client'

import { useEffect, useMemo, useState } from 'react'
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
type AssignedShipper={id:string,name:string,phone?:string|null}

export function TrackingHubGroup({
  hub,
  rows,
  warehouses,
  assignedShippers=[],
  contextQuery='',
  defaultOpen,
}:{
  hub:string
  rows:OrderRow[]
  warehouses:Warehouse[]
  assignedShippers?:AssignedShipper[]
  contextQuery?:string
  defaultOpen?:boolean
}){
  const eligible=rows.filter(r=>r.receive_status==='WAITING_RECEIVE')
  const atHub=rows.filter(r=>r.tracking_status==='ARRIVED_DESTINATION_HUB').length
  const outForDelivery=rows.filter(r=>r.tracking_status==='OUT_FOR_DELIVERY').length
  const failed=rows.filter(r=>r.tracking_status==='DELIVERY_FAILED').length
  const delivered=rows.filter(r=>r.tracking_status==='DELIVERED').length
  const totalCod=rows.reduce((sum,r)=>sum+Number(r.cod??0),0)
  const urgentCount=eligible.length+failed+atHub+outForDelivery

  const [open,setOpen]=useState(defaultOpen??urgentCount>0)
  const [selected,setSelected]=useState<string[]>([])
  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const selectedRows=eligible.filter(r=>selectedSet.has(r.id))
  const selectedCod=selectedRows.reduce((s,r)=>s+Number(r.cod??0),0)
  const [actualTransferred,setActualTransferred]=useState('')
  const actualValue=Number(actualTransferred||0)
  const tip=Math.max(0,actualValue-selectedCod)
  const transferValid=Boolean(selected.length&&actualValue>=selectedCod)
  const allSelected=eligible.length>0&&selected.length===eligible.length

  useEffect(()=>{
    setActualTransferred(selectedCod>0?String(selectedCod):'')
  },[selectedCod])

  useEffect(()=>{
    if(selected.length)setOpen(true)
  },[selected.length])

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

  return <section className={'card tracking-hub-card tracking-hub-card-v2 '+(open?'open':'collapsed')}>
    <div className="tracking-hub-head-v2">
      <button
        type="button"
        className="tracking-hub-toggle"
        aria-label={open?'Thu gọn HUB':'Mở HUB'}
        aria-expanded={open}
        onClick={()=>setOpen(v=>!v)}
      >
        <span>{open?'⌄':'›'}</span>
      </button>

      <div className="tracking-hub-identity">
        <span className={'tracking-hub-priority-dot '+(urgentCount?'attention':'')}/>
        <div>
          <b>{hub}</b>
          <small>{assignedShippers.length
            ? assignedShippers.map(s=>s.name).join(' · ')
            : 'Chưa cấu hình Shipper'}</small>
        </div>
      </div>

      <div className="tracking-hub-metrics-v2">
        <span><b>{rows.length}</b> đơn</span>
        <span className={eligible.length?'warning':''}><b>{eligible.length}</b> chờ nhận</span>
        <span className={atHub?'info':''}><b>{atHub}</b> đến HUB</span>
        <span className={outForDelivery?'info':''}><b>{outForDelivery}</b> đang giao</span>
        <span className={failed?'danger':''}><b>{failed}</b> giao lỗi</span>
        <span className="money"><b>{formatMoney(totalCod)}</b> COD</span>
      </div>

      <div className="tracking-hub-summary-state">
        {delivered>0&&<span className="success">{delivered} giao TC</span>}
        <span>{open?'Thu gọn':'Xem đơn'}</span>
      </div>
    </div>

    {open&&<>
      <div className="tracking-hub-table-wrap tracking-hub-table-wrap-v2">
        <table className="table tracking-hub-table tracking-hub-table-v2">
          <thead><tr>
            <th className="select-col">
              <input type="checkbox" aria-label="Chọn tất cả đơn chờ nhận" checked={allSelected} onChange={toggleAll} disabled={!eligible.length}/>
            </th>
            <th>Mã đơn / MVĐ</th>
            <th>Sản phẩm</th>
            <th>COD</th>
            <th>Người nhận / Địa chỉ</th>
            <th>Trạng thái</th>
            <th>Xử lý</th>
          </tr></thead>
          <tbody>
            {rows.map(r=>{
              const canReceive=r.receive_status==='WAITING_RECEIVE'
              return <tr key={r.id} className={canReceive?'tracking-row-waiting':''}>
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
                <td className="truncate tracking-product-cell" title={r.product_summary??''}>{r.product_summary??'—'}</td>
                <td className="money">{formatMoney(r.cod)}</td>
                <td>
                  <div className="tracking-recipient tracking-recipient-v2">
                    <b>{r.recipient_name??'—'} <small>{formatPhone(r.recipient_phone)}</small></b>
                    <span title={r.recipient_address??''}>{r.recipient_address??'Chưa có địa chỉ'}</span>
                  </div>
                </td>
                <td>
                  <div className="order-state-cell tracking-state-cell-v2">
                    <span className={'status-pill status-'+String(r.tracking_status??'UNKNOWN').toLowerCase()}>{statusLabel(r.tracking_status)}</span>
                    {r.receive_status!=='NOT_READY'&&<span className={'status-pill '+(r.receive_status==='RECEIVED'?'green':'orange')}>{statusLabel(r.receive_status)}</span>}
                  </div>
                </td>
                <td>
                  <div className="tracking-row-actions">
                    {r.shipment_id&&!['DELIVERED','CANCELLED','RETURNED'].includes(String(r.tracking_status))&&<ManualSyncButton shipmentId={r.shipment_id}/>}
                    <Link className="button small" href={orderHref(r.id)}>Chi tiết</Link>
                  </div>
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>

      {eligible.length>0&&selected.length>0&&
        <form action={confirmReceiveOrders} className="receive-compact-bar receive-compact-bar-v2">
          <input type="hidden" name="return_query" value={contextQuery}/>
          {selected.map(id=><input key={id} type="hidden" name="order_ids" value={id}/>)}

          <div className="receive-compact-summary">
            <b>{selected.length} đơn</b>
            <span>COD {formatMoney(selectedCod)}</span>
          </div>

          <select name="warehouse_id" required defaultValue="" aria-label="Kho nhận">
            <option value="" disabled>Kho nhận</option>
            {warehouses.map(w=><option value={w.id} key={w.id}>{(w.code?w.code+' · ':'')+(w.name??'Kho')}</option>)}
          </select>

          <div className="receive-shipper-field hub-only" aria-label="HUB đối soát">
            <div>
              <span>Đối soát HUB</span>
              <b>{hub}</b>
            </div>
            <span>{assignedShippers.length} Shipper</span>
          </div>

          <input
            className="receive-transfer-input"
            name="actual_transferred"
            type="number"
            min={selectedCod}
            step="1"
            value={actualTransferred}
            onChange={e=>setActualTransferred(e.target.value)}
            placeholder="Thực chuyển"
            aria-label="Tổng tiền thực chuyển"
          />

          <div className={'receive-tip '+(actualValue<selectedCod&&actualTransferred?'invalid':'')}>
            <span>Tip</span>
            <b>{actualValue>=selectedCod?formatMoney(tip):'Không hợp lệ'}</b>
          </div>

          <details className="receive-note-details">
            <summary title="Ghi chú">•••</summary>
            <div className="receive-note-popover">
              <span>Ghi chú</span>
              <input name="note" placeholder="Không bắt buộc"/>
            </div>
          </details>

          <button className="button small" name="payment_mode" value="receive_only">
            Nhận
          </button>
          <button className="button small primary" name="payment_mode" value="with_payment" disabled={!transferValid}>
            Nhận + ghi chuyển
          </button>
        </form>}
    </>}
  </section>
}
