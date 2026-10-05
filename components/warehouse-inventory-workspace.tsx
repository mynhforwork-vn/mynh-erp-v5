'use client'

import { useEffect,useMemo,useState } from 'react'
import Link from 'next/link'
import { formatDateTime,formatMoney } from '@/lib/format'

type Row={
  warehouse_id:string
  warehouse_code:string
  warehouse_name:string
  product_variant_id:string
  sku:string
  product_name:string
  variant_name:string
  quantity:number
  incoming:number
  sale_price:number
}
type Tx={
  id:number|string
  warehouse_id:string
  product_variant_id:string
  tx_type:string
  quantity:number
  reference_type?:string|null
  reference_id?:string|null
  created_at:string
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

export function WarehouseInventoryWorkspace({
  rows,
  transactions,
}:{
  rows:Row[]
  transactions:Tx[]
}){
  const [activeKey,setActiveKey]=useState<string|null>(null)
  const [panelTab,setPanelTab]=useState<'overview'|'history'>('overview')
  const active=rows.find(row=>(row.warehouse_id+'|'+row.product_variant_id)===activeKey)??null

  useEffect(()=>{
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape')setActiveKey(null)
    }
    document.addEventListener('keydown',onKeyDown)
    return ()=>document.removeEventListener('keydown',onKeyDown)
  },[])

  const activeTx=useMemo(()=>{
    if(!active)return []
    return transactions.filter(tx=>
      tx.warehouse_id===active.warehouse_id&&
      tx.product_variant_id===active.product_variant_id
    )
  },[active,transactions])

  const siblingRows=useMemo(
    ()=>active?rows.filter(row=>row.product_variant_id===active.product_variant_id):[],
    [active,rows]
  )
  const movement=useMemo(()=>{
    let incoming=0,outgoing=0
    for(const tx of activeTx){
      if(IN_TYPES.has(tx.tx_type))incoming+=Number(tx.quantity??0)
      else outgoing+=Number(tx.quantity??0)
    }
    return {incoming,outgoing}
  },[activeTx])

  function openRow(key:string){
    setActiveKey(key)
    setPanelTab('overview')
  }

  return <div className={'whx-stock-layout '+(active?'with-panel':'')}>
    <section className="whx-stock-main">
      <div className="whx-table-card">
        <div className="whx-table-head">
          <div>
            <h2>Danh sách tồn kho</h2>
            <span>{rows.length} dòng phù hợp bộ lọc hiện tại</span>
          </div>
        </div>
        <div className="whx-table-scroll">
          <table className="table whx-table">
            <thead><tr>
              <th>SKU bán</th>
              <th>Sản phẩm</th>
              <th>Phân loại</th>
              <th>Kho</th>
              <th>Tồn</th>
              <th>Đang về</th>
              <th>Khả dụng</th>
              <th>Giá bán</th>
              <th>Trạng thái</th>
            </tr></thead>
            <tbody>
              {!rows.length
                ? <tr><td colSpan={9} className="empty">Không có tồn kho phù hợp.</td></tr>
                : rows.map(row=>{
                    const key=row.warehouse_id+'|'+row.product_variant_id
                    const available=row.quantity
                    return <tr
                      key={key}
                      className={activeKey===key?'active-row':''}
                      onClick={()=>openRow(key)}
                    >
                      <td><b className="whx-link-text">{row.sku}</b></td>
                      <td>{row.product_name}</td>
                      <td>{row.variant_name}</td>
                      <td>
                        <div className="whx-product-cell">
                          <b>{row.warehouse_code}</b>
                          <span>{row.warehouse_name}</span>
                        </div>
                      </td>
                      <td className="whx-stock-number">{row.quantity}</td>
                      <td>{row.incoming||'—'}</td>
                      <td className="whx-stock-number">{available}</td>
                      <td className="money">{formatMoney(row.sale_price)}</td>
                      <td>{row.quantity===0
                        ? <span className="status-pill red">Hết hàng</span>
                        : row.quantity<=3
                          ? <span className="status-pill orange">Tồn thấp</span>
                          : <span className="status-pill green">Bình thường</span>}
                      </td>
                    </tr>
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {active&&<aside className="whx-detail-panel whx-detail-panel-v2">
      <div className="whx-panel-head whx-panel-head-v2">
        <div>
          <span className="module-eyebrow">CHI TIẾT TỒN KHO</span>
          <div className="whx-panel-title-row"><h2>{active.sku}</h2><span className={'status-pill '+(active.quantity===0?'red':active.quantity<=3?'orange':'green')}>{active.quantity===0?'Hết hàng':active.quantity<=3?'Tồn thấp':'Bình thường'}</span></div>
          <p>{active.product_name} · {active.variant_name}</p>
        </div>
        <button className="close" type="button" onClick={()=>setActiveKey(null)} aria-label="Đóng">×</button>
      </div>

      <div className="whx-panel-tabs">
        <button className={panelTab==='overview'?'active':''} type="button" onClick={()=>setPanelTab('overview')}>Tổng quan</button>
        <button className={panelTab==='history'?'active':''} type="button" onClick={()=>setPanelTab('history')}>Lịch sử <span>{activeTx.length}</span></button>
      </div>

      <div className="whx-panel-scroll">
        {panelTab==='overview'&&<>
          <div className="whx-panel-kpis">
            <div className="primary"><span>Tồn hiện tại</span><b>{active.quantity}</b><small>{active.warehouse_code}</small></div>
            <div><span>Đang về</span><b>{active.incoming}</b><small>Chuyển kho</small></div>
            <div><span>Khả dụng</span><b>{active.quantity}</b><small>Có thể bán</small></div>
            <div><span>Giá bán</span><b>{formatMoney(active.sale_price)}</b><small>Đơn giá</small></div>
          </div>

          <section className="whx-panel-card">
            <div className="whx-panel-section-head"><div><b>Thông tin SKU</b><span>Thông tin bán & kho</span></div></div>
            <div className="whx-info-grid whx-info-grid-v2">
              <div><span>SKU bán</span><b className="mono">{active.sku}</b></div>
              <div><span>Kho hiện tại</span><b>{active.warehouse_code}</b></div>
              <div><span>Phân loại</span><b>{active.variant_name}</b></div>
              <div><span>Giá bán</span><b>{formatMoney(active.sale_price)}</b></div>
              <div className="full"><span>Sản phẩm</span><b>{active.product_name}</b></div>
            </div>
          </section>

          <section className="whx-panel-card">
            <div className="whx-panel-section-head"><div><b>Tồn cùng SKU theo kho</b><span>{siblingRows.length} kho</span></div></div>
            <div className="whx-warehouse-stock-list">
              {siblingRows.map(row=><div key={row.warehouse_id}>
                <span><b>{row.warehouse_code}</b><small>{row.warehouse_name}</small></span>
                <span><strong>{row.quantity}</strong><small>{row.incoming>0?'+'+row.incoming+' đang về':'Không có hàng đang về'}</small></span>
              </div>)}
            </div>
          </section>

          <section className="whx-panel-card">
            <div className="whx-panel-section-head"><div><b>Biến động gần đây</b><span>{activeTx.length} giao dịch đang tải</span></div></div>
            <div className="whx-movement-summary">
              <div className="in"><span>Ghi tăng</span><b>+{movement.incoming}</b></div>
              <div className="out"><span>Ghi giảm</span><b>-{movement.outgoing}</b></div>
            </div>
            <button className="button small" type="button" onClick={()=>setPanelTab('history')}>Xem lịch sử SKU</button>
          </section>
        </>}

        {panelTab==='history'&&<>
          <div className="whx-panel-section-head whx-history-head">
            <div><b>Lịch sử nhập / xuất</b><span>{activeTx.length} giao dịch gần nhất</span></div>
            <Link className="button small" href={'/warehouse/history?q='+encodeURIComponent(active.sku)}>Mở lịch sử kho</Link>
          </div>
          <div className="whx-sku-ledger whx-sku-ledger-v2">
            {!activeTx.length
              ? <div className="empty compact">Chưa có lịch sử cho SKU này.</div>
              : activeTx.slice(0,40).map(tx=>{
                  const incoming=IN_TYPES.has(tx.tx_type)
                  return <div key={tx.id} className="whx-ledger-row">
                    <span className={'whx-ledger-dot '+(incoming?'in':'out')}/>
                    <div>
                      <b>{txLabel(tx.tx_type,tx.reference_type)}</b>
                      <span>{formatDateTime(tx.created_at)}</span>
                      <small>{tx.reference_type??'Không có tham chiếu'}</small>
                    </div>
                    <strong className={incoming?'in':'out'}>{incoming?'+':'-'}{tx.quantity}</strong>
                  </div>
                })}
          </div>
        </>}
      </div>
    </aside>}
  </div>
}
