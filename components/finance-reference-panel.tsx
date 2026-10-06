'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { PrintPageButton } from '@/components/print-page-button'
import { SalesHistoryActions } from '@/components/sales-history-actions'

type Ref={type:'CUSTOMER_PAYMENT'|'SHIPPER_PAYMENT'|'SALE'|'ORDER',id:string}

export function FinanceReferencePanel({
  reference,
  customerPayment,
  allocations,
  shipperPayment,
  sale,
  order,
  saleMap,
  canOperate,
  onBack,
  onClose,
  onPush,
}:{
  reference:Ref
  customerPayment?:any
  allocations?:any[]
  shipperPayment?:any
  sale?:any
  order?:any
  saleMap:Map<string,any>
  canOperate:boolean
  onBack:()=>void
  onClose:()=>void
  onPush:(type:Ref['type'],id:string)=>void
}){
  const [saleTab,setSaleTab]=useState<'info'|'products'|'payment'|'history'>('info')

  const title=reference.type==='CUSTOMER_PAYMENT'
    ? customerPayment?.receipt_code??'Phiếu thu nợ'
    : reference.type==='SHIPPER_PAYMENT'
      ? 'Đợt thanh toán Shipper'
      : reference.type==='SALE'
        ? sale?.invoice_code??'Hóa đơn POS'
        : order?.shopee_order_id??'Đơn nhập'

  const subtitle=reference.type==='CUSTOMER_PAYMENT'
    ? customerPayment?.customers?.name??'Khách hàng'
    : reference.type==='SHIPPER_PAYMENT'
      ? (shipperPayment?.destination_shippers?.name??shipperPayment?.shipper_name??'Shipper')
      : reference.type==='SALE'
        ? sale?.customers?.name??'Khách lẻ'
        : order?.recipient_name??'Người nhận'

  return <>
    <div className="panel-head context-stack-head">
      <button
        className="context-stack-back"
        type="button"
        onClick={()=>reference.type==='SALE'&&saleTab!=='info'?setSaleTab('info'):onBack()}
        aria-label="Quay lại"
      >←</button>
      <div className="context-stack-title">
        <span className="eyebrow">THAM CHIẾU · TRONG THU / CHI</span>
        <h2>{title}</h2>
        <small>{subtitle}</small>
      </div>
      <button className="close" type="button" onClick={onClose} aria-label="Đóng toàn bộ">×</button>
    </div>

    <div className="context-stack-breadcrumb finance-reference-breadcrumb">
      <span>Thu / Chi</span><i>›</i><b>{
        reference.type==='CUSTOMER_PAYMENT'?'Thu công nợ':
        reference.type==='SHIPPER_PAYMENT'?'Đối soát Shipper':
        reference.type==='SALE'?'Hóa đơn POS':'Đơn nhập'
      }</b>
    </div>

    <div className="panel-scroll finance-reference-scroll">
      {reference.type==='CUSTOMER_PAYMENT'&&customerPayment&&<>
        <div className="detail-grid">
          <div><span>Mã phiếu thu</span><b>{customerPayment.receipt_code??'PTN'}</b></div>
          <div><span>Thời gian</span><b>{formatDateTime(customerPayment.paid_at)}</b></div>
          <div className="full"><span>Khách hàng</span><b>{customerPayment.customers?.name??'—'}</b></div>
          <div><span>SĐT</span><b>{customerPayment.customers?.phone??'—'}</b></div>
          <div><span>Phương thức</span><b>{customerPayment.payment_method==='TRANSFER'?'Chuyển khoản':customerPayment.payment_method==='CASH'?'Tiền mặt':customerPayment.payment_method??'—'}</b></div>
          <div><span>Tiền mặt</span><b>{formatMoney(customerPayment.cash_amount??0)}</b></div>
          <div><span>Chuyển khoản</span><b>{formatMoney(customerPayment.transfer_amount??0)}</b></div>
          <div className="full"><span>Tổng thu</span><b>{formatMoney(customerPayment.amount)}</b></div>
        </div>
        {customerPayment.note&&<div className="finance-note"><span>Ghi chú</span><b>{customerPayment.note}</b></div>}
        <div className="finance-reference-section-head"><b>Phân bổ vào hóa đơn</b><span>{allocations?.length??0} hóa đơn</span></div>
        <div className="finance-reference-list">
          {!(allocations?.length)
            ? <div className="empty compact">Phiếu thu chưa có phân bổ hóa đơn.</div>
            : allocations!.map(allocation=>{
                const invoice=saleMap.get(String(allocation.sale_id))
                return <button className="finance-reference-row" key={allocation.id} type="button" onClick={()=>onPush('SALE',String(allocation.sale_id))}>
                  <span><b>{invoice?.invoice_code??'Hóa đơn'}</b><small>{invoice?formatDateTime(invoice.sale_at):'—'}</small></span>
                  <span><strong>{formatMoney(allocation.amount)}</strong><small>Mở chi tiết →</small></span>
                </button>
              })}
        </div>
        <div className="panel-action-row"><Link className="button" href={'/sales/debt?customer='+customerPayment.customer_id+'&tab=receipts'}>Mở module Công nợ ↗</Link></div>
      </>}

      {reference.type==='SHIPPER_PAYMENT'&&shipperPayment&&<>
        <div className="detail-grid">
          <div><span>HUB</span><b>{shipperPayment.destination_hub??'—'}</b></div>
          <div><span>Shipper</span><b>{shipperPayment.destination_shippers?.name??shipperPayment.shipper_name??'—'}</b></div>
          <div><span>Thời gian</span><b>{formatDateTime(shipperPayment.transferred_at)}</b></div>
          <div><span>Số đơn</span><b>{shipperPayment.shipper_payment_details?.length??0}</b></div>
          <div><span>Tổng COD</span><b>{formatMoney(shipperPayment.total_cod)}</b></div>
          <div><span>Thực chuyển</span><b>{formatMoney(shipperPayment.actual_transferred)}</b></div>
          <div className="full"><span>Tip</span><b>{formatMoney(shipperPayment.tip)}</b></div>
        </div>
        {shipperPayment.note&&<div className="finance-note"><span>Ghi chú</span><b>{shipperPayment.note}</b></div>}
        <div className="finance-reference-section-head"><b>Đơn trong đợt thanh toán</b><span>{shipperPayment.shipper_payment_details?.length??0} đơn</span></div>
        <div className="finance-reference-list">
          {(shipperPayment.shipper_payment_details??[]).map((detail:any)=>{
            const linked=detail.orders??{}
            const shipment=Array.isArray(linked.shipments)?linked.shipments[0]:linked.shipments
            return <button className="finance-reference-row" key={detail.order_id} type="button" onClick={()=>onPush('ORDER',String(detail.order_id))}>
              <span><b>{linked.shopee_order_id??String(detail.order_id).slice(0,8)}</b><small>{shipment?.tracking_number??'Chưa có MVD'} · {linked.recipient_name??'—'}</small></span>
              <span><strong>{formatMoney(detail.cod_snapshot)}</strong><small>Mở chi tiết →</small></span>
            </button>
          })}
        </div>
        <div className="panel-action-row"><Link className="button" href={'/finance/shipper-payments?mode=shipper&view=hub&hub='+encodeURIComponent(shipperPayment.destination_hub??'')}>Mở module Đối soát ↗</Link></div>
      </>}

      {reference.type==='SALE'&&sale&&<>
        <div className="finance-reference-actions">
          <PrintPageButton label="In hóa đơn"/>
          <SalesHistoryActions
            saleId={String(sale.id)}
            invoiceCode={String(sale.invoice_code??'POS-'+String(sale.id).slice(0,8))}
            saleStatus={String(sale.sale_status??'COMPLETED')}
            canOperate={canOperate}
            items={(sale.sale_items??[]).map((item:any)=>({
              id:String(item.id),
              sku:String(item.product_variants?.products?.sku??'—'),
              name:String(item.product_variants?.products?.name??'Sản phẩm'),
              variant:String(item.product_variants?.variant_name??''),
              quantity:Number(item.quantity??0),
              returnedQuantity:(sale.sale_returns??[])
                .flatMap((entry:any)=>entry.sale_return_items??[])
                .filter((returned:any)=>String(returned.sale_item_id)===String(item.id))
                .reduce((sum:number,returned:any)=>sum+Number(returned.quantity??0),0),
            }))}
          />
          <Link className="button small" href={'/sales/history?sale='+sale.id}>Mở module Lịch sử bán ↗</Link>
        </div>
        <div className="panel-tabs finance-reference-tabs">
          <button className={saleTab==='info'?'active':''} type="button" onClick={()=>setSaleTab('info')}>Thông tin</button>
          <button className={saleTab==='products'?'active':''} type="button" onClick={()=>setSaleTab('products')}>Sản phẩm</button>
          <button className={saleTab==='payment'?'active':''} type="button" onClick={()=>setSaleTab('payment')}>Thanh toán</button>
          <button className={saleTab==='history'?'active':''} type="button" onClick={()=>setSaleTab('history')}>Lịch sử</button>
        </div>

        {saleTab==='info'&&<>
          <div className="detail-grid">
            <div><span>Mã hóa đơn</span><b>{sale.invoice_code??'—'}</b></div>
            <div><span>Trạng thái</span><b>{statusLabel(sale.sale_status)}</b></div>
            <div><span>Kho bán</span><b>{sale.warehouses?.code??'—'}</b></div>
            <div><span>Thời gian</span><b>{formatDateTime(sale.sale_at)}</b></div>
            <div className="full"><span>Khách hàng</span><b>{sale.customers?.name??'Khách lẻ'}</b></div>
          </div>
          <div className="sales-money-summary compact">
            <div><span>Tổng thanh toán</span><b>{formatMoney(sale.total_amount)}</b></div>
            <div><span>Đã thu</span><b>{formatMoney(sale.paid_amount)}</b></div>
            <div><span>Còn nợ</span><b>{formatMoney(sale.sale_status==='CANCELLED'?0:sale.debt_amount)}</b></div>
          </div>
        </>}

        {saleTab==='products'&&<table className="table sales-detail-products">
          <thead><tr><th>SKU</th><th>Sản phẩm</th><th>SL</th><th>Thành tiền</th></tr></thead>
          <tbody>{(sale.sale_items??[]).map((item:any)=><tr key={item.id}>
            <td><b>{item.product_variants?.products?.sku??'—'}</b></td>
            <td>{item.product_variants?.products?.name??'Sản phẩm'}<small>{item.product_variants?.variant_name??''}</small></td>
            <td>{item.quantity}</td>
            <td className="money">{formatMoney(Number(item.quantity)*Number(item.sale_price))}</td>
          </tr>)}</tbody>
        </table>}

        {saleTab==='payment'&&<div className="finance-reference-list">
          {!(sale.sale_payments??[]).length
            ? <div className="empty compact">Chưa có giao dịch thanh toán.</div>
            : (sale.sale_payments??[]).map((payment:any)=><div className="finance-reference-row static" key={payment.id}>
                <span><b>{payment.method==='CASH'?'Tiền mặt':payment.method==='TRANSFER'?'Chuyển khoản':payment.method}</b><small>{formatDateTime(payment.created_at)}</small></span>
                <span><strong>{formatMoney(payment.amount)}</strong></span>
              </div>)}
        </div>}

        {saleTab==='history'&&<div className="sales-audit-preview">
          <div><i></i><span>{formatDateTime(sale.sale_at)}</span><b>Tạo hóa đơn POS</b><small>{sale.invoice_code}</small></div>
          {(sale.sale_payments??[]).map((payment:any)=><div key={payment.id}><i></i><span>{formatDateTime(payment.created_at)}</span><b>Thanh toán</b><small>{formatMoney(payment.amount)}</small></div>)}
          {(sale.sale_returns??[]).map((entry:any)=><div key={entry.id}><i></i><span>{formatDateTime(entry.created_at)}</span><b>{entry.return_type==='CANCEL'?'Huỷ hóa đơn':entry.return_type==='FULL'?'Hoàn toàn bộ':'Hoàn một phần'}</b><small>{formatMoney(entry.return_value)}</small></div>)}
        </div>}
      </>}

      {reference.type==='ORDER'&&order&&<>
        <div className="detail-grid">
          <div><span>Mã đơn</span><b>{order.shopee_order_id??order.id}</b></div>
          <div><span>Trạng thái nhận</span><b>{order.receive_status??'—'}</b></div>
          <div><span>HUB</span><b>{order.destination_hub??'—'}</b></div>
          <div><span>COD snapshot</span><b>{formatMoney(order.cod_snapshot??0)}</b></div>
          <div className="full"><span>Người nhận</span><b>{order.recipient_name??'—'}</b></div>
          <div><span>SĐT</span><b>{order.recipient_phone??'—'}</b></div>
          <div><span>MVD</span><b>{(Array.isArray(order.shipments)?order.shipments[0]:order.shipments)?.tracking_number??'—'}</b></div>
        </div>
        <div className="panel-action-row"><Link className="button" href={'/purchase/orders?order='+order.id+'&range=all'}>Mở module Đơn nhập ↗</Link></div>
      </>}

      {reference.type==='CUSTOMER_PAYMENT'&&!customerPayment&&<div className="empty compact">Không tìm thấy phiếu thu tham chiếu.</div>}
      {reference.type==='SHIPPER_PAYMENT'&&!shipperPayment&&<div className="empty compact">Không tìm thấy đợt thanh toán tham chiếu.</div>}
      {reference.type==='SALE'&&!sale&&<div className="empty compact">Không tìm thấy hóa đơn tham chiếu.</div>}
      {reference.type==='ORDER'&&!order&&<div className="empty compact">Không tìm thấy đơn tham chiếu.</div>}
    </div>
  </>
}
