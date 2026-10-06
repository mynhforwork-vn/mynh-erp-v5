'use client'

import Link from 'next/link'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'

type FinanceReference={type:'CUSTOMER_PAYMENT'|'SHIPPER_PAYMENT'|'SALE'|'ORDER',id:string}

function paymentLabel(method?:string|null){
  if(method==='CASH')return 'Tiền mặt'
  if(method==='TRANSFER')return 'Chuyển khoản'
  if(method==='COMBINED')return 'Kết hợp'
  if(method==='DEBT')return 'Ghi nợ'
  return method??'—'
}

export function FinanceReferencePanel({
  reference,
  customerPayment,
  allocations,
  sales,
  shipperPayment,
  order,
  onBack,
  onClose,
  onPush,
}:{
  reference:FinanceReference
  customerPayment?:any|null
  allocations?:any[]
  sales?:any[]
  shipperPayment?:any|null
  order?:any|null
  onBack:()=>void
  onClose:()=>void
  onPush:(type:FinanceReference['type'],id:string)=>void
}){
  const saleMap=new Map((sales??[]).map((row:any)=>[String(row.id),row]))

  if(reference.type==='CUSTOMER_PAYMENT'){
    const row=customerPayment
    const customer=row?.customers??null
    return <div className="finance-reference-stack">
      <div className="panel-head context-stack-head">
        <button className="context-stack-back" type="button" onClick={onBack} aria-label="Quay lại">←</button>
        <div className="context-stack-title">
          <span className="eyebrow">THU CÔNG NỢ · TRONG THU/CHI</span>
          <h2>{row?.receipt_code??'Phiếu thu nợ'}</h2>
          <small>{customer?.name??'Khách hàng'} · {formatDateTime(row?.paid_at)}</small>
        </div>
        <button className="close" type="button" onClick={onClose} aria-label="Đóng toàn bộ">×</button>
      </div>
      <div className="context-stack-breadcrumb"><span>Thu / Chi</span><i>›</i><b>Chứng từ</b><i>›</i><strong>Thu công nợ</strong></div>
      <div className="panel-scroll finance-reference-scroll">
        {!row
          ? <div className="empty compact">Không tìm thấy phiếu thu tham chiếu.</div>
          : <>
              <div className="detail-grid">
                <div><span>Mã phiếu</span><b>{row.receipt_code??'—'}</b></div>
                <div><span>Thời gian</span><b>{formatDateTime(row.paid_at)}</b></div>
                <div><span>Khách hàng</span><b>{customer?.name??'—'}</b></div>
                <div><span>SĐT</span><b>{customer?.phone??'—'}</b></div>
                <div><span>Phương thức</span><b>{paymentLabel(row.payment_method)}</b></div>
                <div><span>Tổng thu</span><b>{formatMoney(row.amount)}</b></div>
                <div><span>Tiền mặt</span><b>{formatMoney(row.cash_amount)}</b></div>
                <div><span>Chuyển khoản</span><b>{formatMoney(row.transfer_amount)}</b></div>
                {row.note&&<div className="full"><span>Ghi chú</span><b>{row.note}</b></div>}
              </div>

              <div className="finance-ref-section-head"><b>Phân bổ hóa đơn</b><span>{allocations?.length??0} hóa đơn</span></div>
              <div className="finance-ref-list">
                {!(allocations??[]).length
                  ? <div className="empty compact">Phiếu chưa có phân bổ hóa đơn.</div>
                  : (allocations??[]).map((allocation:any)=>{
                      const sale=saleMap.get(String(allocation.sale_id)) as any
                      return <button className="finance-ref-row" type="button" key={allocation.id} onClick={()=>onPush('SALE',String(allocation.sale_id))}>
                        <span><b>{sale?.invoice_code??'Hóa đơn'}</b><small>{formatDateTime(sale?.sale_at)} · Mở chi tiết tại đây</small></span>
                        <strong>{formatMoney(allocation.amount)}</strong>
                      </button>
                    })}
              </div>
              <div className="context-order-module-link">
                <Link className="button small" href={'/sales/debt?customer='+encodeURIComponent(String(row.customer_id))+'&tab=receipts'}>Mở module Công nợ ↗</Link>
              </div>
            </>}
      </div>
    </div>
  }

  if(reference.type==='SHIPPER_PAYMENT'){
    const row=shipperPayment
    const shipper=row?.destination_shippers??null
    return <div className="finance-reference-stack">
      <div className="panel-head context-stack-head">
        <button className="context-stack-back" type="button" onClick={onBack} aria-label="Quay lại">←</button>
        <div className="context-stack-title">
          <span className="eyebrow">ĐỐI SOÁT SHIPPER · TRONG THU/CHI</span>
          <h2>{shipper?.name??row?.shipper_name??'Shipper'}</h2>
          <small>{row?.destination_hub??'—'} · {formatDateTime(row?.transferred_at)}</small>
        </div>
        <button className="close" type="button" onClick={onClose} aria-label="Đóng toàn bộ">×</button>
      </div>
      <div className="context-stack-breadcrumb"><span>Thu / Chi</span><i>›</i><b>Chứng từ</b><i>›</i><strong>Đối soát Shipper</strong></div>
      <div className="panel-scroll finance-reference-scroll">
        {!row
          ? <div className="empty compact">Không tìm thấy đợt thanh toán Shipper.</div>
          : <>
              <div className="detail-grid">
                <div><span>HUB</span><b>{row.destination_hub??'—'}</b></div>
                <div><span>Shipper</span><b>{shipper?.name??row.shipper_name??'—'}</b></div>
                <div><span>Thời gian</span><b>{formatDateTime(row.transferred_at)}</b></div>
                <div><span>Số đơn</span><b>{row.shipper_payment_details?.length??0}</b></div>
                <div><span>COD</span><b>{formatMoney(row.total_cod)}</b></div>
                <div><span>Thực chuyển</span><b>{formatMoney(row.actual_transferred)}</b></div>
                <div><span>Tip</span><b>{formatMoney(row.tip)}</b></div>
                {row.note&&<div className="full"><span>Ghi chú</span><b>{row.note}</b></div>}
              </div>

              <div className="finance-ref-section-head"><b>Đơn trong đợt</b><span>{row.shipper_payment_details?.length??0} đơn</span></div>
              <div className="finance-ref-list">
                {(row.shipper_payment_details??[]).map((detail:any)=>{
                  const linkedOrder=detail.orders??{}
                  const shipment=Array.isArray(linkedOrder.shipments)?linkedOrder.shipments[0]:linkedOrder.shipments
                  return <button className="finance-ref-row" type="button" key={detail.order_id} onClick={()=>onPush('ORDER',String(detail.order_id))}>
                    <span><b>{linkedOrder.shopee_order_id??String(detail.order_id).slice(0,8)}</b><small>{shipment?.tracking_number??'Chưa có MVD'} · {linkedOrder.recipient_name??'—'}</small></span>
                    <strong>{formatMoney(detail.cod_snapshot)}</strong>
                  </button>
                })}
              </div>
              <div className="context-order-module-link">
                <Link className="button small" href={'/finance/shipper-payments?mode=shipper&view=hub&hub='+encodeURIComponent(String(row.destination_hub??''))}>Mở module Đối soát ↗</Link>
              </div>
            </>}
      </div>
    </div>
  }

  if(reference.type==='SALE'){
    const row=saleMap.get(reference.id) as any
    return <div className="finance-reference-stack">
      <div className="panel-head context-stack-head">
        <button className="context-stack-back" type="button" onClick={onBack} aria-label="Quay lại">←</button>
        <div className="context-stack-title">
          <span className="eyebrow">HÓA ĐƠN POS · TRONG THU/CHI</span>
          <h2>{row?.invoice_code??'Hóa đơn'}</h2>
          <small>{row?.customers?.name??'Khách lẻ'} · {formatDateTime(row?.sale_at)}</small>
        </div>
        <button className="close" type="button" onClick={onClose} aria-label="Đóng toàn bộ">×</button>
      </div>
      <div className="context-stack-breadcrumb"><span>Thu / Chi</span><i>›</i><b>Tham chiếu</b><i>›</i><strong>Hóa đơn POS</strong></div>
      <div className="panel-scroll finance-reference-scroll">
        {!row
          ? <div className="empty compact">Không tìm thấy hóa đơn POS tham chiếu.</div>
          : <>
              <div className="detail-grid">
                <div><span>Mã hóa đơn</span><b>{row.invoice_code??'—'}</b></div>
                <div><span>Trạng thái</span><b>{statusLabel(row.sale_status)}</b></div>
                <div><span>Thời gian</span><b>{formatDateTime(row.sale_at)}</b></div>
                <div><span>Kho</span><b>{row.warehouses?.code??'—'}</b></div>
                <div><span>Khách hàng</span><b>{row.customers?.name??'Khách lẻ'}</b></div>
                <div><span>SĐT</span><b>{row.customers?.phone??'—'}</b></div>
                <div><span>Tổng tiền</span><b>{formatMoney(row.total_amount)}</b></div>
                <div><span>Đã thu</span><b>{formatMoney(row.paid_amount)}</b></div>
                <div className="full"><span>Còn nợ</span><b>{formatMoney(row.sale_status==='CANCELLED'?0:row.debt_amount)}</b></div>
              </div>

              <div className="finance-ref-section-head"><b>Sản phẩm</b><span>{row.sale_items?.length??0} dòng</span></div>
              <div className="finance-ref-list">
                {(row.sale_items??[]).map((item:any)=><div className="finance-ref-row static" key={item.id}>
                  <span><b>{item.product_variants?.products?.name??'Sản phẩm'}</b><small>{item.product_variants?.products?.sku??'—'} · {item.product_variants?.variant_name??''}</small></span>
                  <strong>{item.quantity} × {formatMoney(item.sale_price)}</strong>
                </div>)}
              </div>
              <div className="context-order-module-link">
                <Link className="button small" href={'/sales/history?sale='+encodeURIComponent(String(row.id))}>Mở module Lịch sử bán ↗</Link>
              </div>
            </>}
      </div>
    </div>
  }

  const row=order
  const shipment=Array.isArray(row?.shipments)?row.shipments[0]:row?.shipments
  return <div className="finance-reference-stack">
    <div className="panel-head context-stack-head">
      <button className="context-stack-back" type="button" onClick={onBack} aria-label="Quay lại">←</button>
      <div className="context-stack-title">
        <span className="eyebrow">ĐƠN NHẬP · TRONG THU/CHI</span>
        <h2>{row?.shopee_order_id??'Đơn hàng'}</h2>
        <small>{row?.destination_hub??'—'} · {shipment?.tracking_number??'Chưa có MVD'}</small>
      </div>
      <button className="close" type="button" onClick={onClose} aria-label="Đóng toàn bộ">×</button>
    </div>
    <div className="context-stack-breadcrumb"><span>Thu / Chi</span><i>›</i><b>Đối soát Shipper</b><i>›</i><strong>Đơn nhập</strong></div>
    <div className="panel-scroll finance-reference-scroll">
      {!row
        ? <div className="empty compact">Không tìm thấy đơn tham chiếu.</div>
        : <>
            <div className="detail-grid">
              <div><span>Mã đơn</span><b>{row.shopee_order_id??'—'}</b></div>
              <div><span>MVD</span><b>{shipment?.tracking_number??'—'}</b></div>
              <div><span>HUB</span><b>{row.destination_hub??'—'}</b></div>
              <div><span>Trạng thái vận chuyển</span><b>{statusLabel(shipment?.current_tracking_status)}</b></div>
              <div><span>Người nhận</span><b>{row.recipient_name??'—'}</b></div>
              <div><span>SĐT</span><b>{row.recipient_phone??'—'}</b></div>
              <div><span>Nhận hàng</span><b>{statusLabel(row.receive_status)}</b></div>
              <div><span>COD đối soát</span><b>{formatMoney(row.cod_snapshot)}</b></div>
            </div>
            <div className="context-order-module-link">
              <Link className="button small" href={'/purchase/orders?range=all&order='+encodeURIComponent(String(row.id))}>Mở module Đơn nhập ↗</Link>
            </div>
          </>}
    </div>
  </div>
}
