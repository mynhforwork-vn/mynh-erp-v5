import Link from 'next/link'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { PrintPageButton } from '@/components/print-page-button'
import { SalesHistoryActions } from '@/components/sales-history-actions'

function paymentLabel(method?:string|null){
  if(method==='CASH')return 'Tiền mặt'
  if(method==='TRANSFER')return 'Chuyển khoản'
  if(method==='DEBT')return 'Ghi nợ'
  return method??'—'
}

type Props={
  sale:any
  activeTab:'info'|'products'|'payment'|'history'
  backHref:string
  closeHref:string
  infoHref:string
  productsHref:string
  paymentHref:string
  historyHref:string
  openModuleHref:string
  canOperate:boolean
  receiptQR?:string
  receiptQRAmount?:number
  receiptQRDescription?:string
  bankConfig?:any
  parentLabel:string
}

export function ContextSalePanel({
  sale,activeTab,backHref,closeHref,infoHref,productsHref,paymentHref,historyHref,
  openModuleHref,canOperate,receiptQR='',receiptQRAmount=0,receiptQRDescription='',bankConfig,parentLabel,
}:Props){
  return <aside className="sales-history-panel context-sale-panel mynh-slide-panel">
    <div className="sales-history-panel-head context-stack-head">
      <Link className="context-stack-back" href={backHref} aria-label="Quay lại">←</Link>
      <div className="context-stack-title">
        <span className="module-eyebrow">HÓA ĐƠN POS · TRONG {parentLabel.toUpperCase()}</span>
        <h2>{sale.invoice_code??'POS-'+String(sale.id).slice(0,8)}</h2>
        <small>{sale.customers?.name??'Khách lẻ'} · {sale.warehouses?.code??'—'}</small>
      </div>
      <Link className="panel-close" href={closeHref} aria-label="Đóng toàn bộ">×</Link>
    </div>

    <div className="context-stack-breadcrumb">
      <span>{parentLabel}</span><i>›</i><b>{sale.invoice_code??'Hóa đơn'}</b>
      {activeTab!=='info'&&<><i>›</i><strong>{
        activeTab==='products'?'Sản phẩm':activeTab==='payment'?'Thanh toán':'Lịch sử'
      }</strong></>}
    </div>

    <div className="sales-history-actions context-sale-actions">
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
      <Link className="button small" href={openModuleHref}>Mở module Lịch sử bán ↗</Link>
    </div>

    <div className="panel-tabs context-sale-tabs">
      <Link className={activeTab==='info'?'active':''} href={infoHref}>Thông tin</Link>
      <Link className={activeTab==='products'?'active':''} href={productsHref}>Sản phẩm</Link>
      <Link className={activeTab==='payment'?'active':''} href={paymentHref}>Thanh toán</Link>
      <Link className={activeTab==='history'?'active':''} href={historyHref}>Lịch sử</Link>
    </div>

    <div className="sales-history-panel-scroll context-sale-scroll">
      {activeTab==='info'&&<>
        <div className="sales-detail-grid">
          <div><span>Mã hóa đơn</span><b>{sale.invoice_code??'—'}</b></div>
          <div><span>Trạng thái</span><b>{statusLabel(sale.sale_status)}</b></div>
          <div><span>Kho bán</span><b>{sale.warehouses?.code??'—'} · {sale.warehouses?.address??sale.warehouses?.name??''}</b></div>
          <div><span>Thời gian</span><b>{formatDateTime(sale.sale_at)}</b></div>
          <div><span>Khách hàng</span><b>{sale.customers?.name??'Khách lẻ'}</b></div>
          <div><span>SĐT</span><b>{sale.customers?.phone??'—'}</b></div>
          <div className="full"><span>Địa chỉ</span><b>{sale.customers?.address??'—'}</b></div>
          <div className="full"><span>Ghi chú</span><b>{sale.note??'—'}</b></div>
        </div>
        <div className="sales-money-summary">
          <div><span>Tiền hàng</span><b>{formatMoney(sale.subtotal)}</b></div>
          <div><span>Giảm giá</span><b>−{formatMoney(sale.discount_amount)}</b></div>
          <div><span>Phí khác</span><b>{formatMoney(sale.other_fee)}</b></div>
          <div className="total"><span>Tổng thanh toán</span><b>{formatMoney(sale.total_amount)}</b></div>
          <div><span>Đã thu</span><b>{formatMoney(sale.paid_amount)}</b></div>
          <div><span>Còn nợ</span><b className="warning-text">{formatMoney(sale.sale_status==='CANCELLED'?0:sale.debt_amount)}</b></div>
        </div>
      </>}

      {activeTab==='products'&&<table className="table sales-detail-products">
        <thead><tr><th>#</th><th>SKU</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>{(sale.sale_items??[]).map((item:any,index:number)=><tr key={item.id}>
          <td>{index+1}</td>
          <td><b>{item.product_variants?.products?.sku??'—'}</b></td>
          <td>{item.product_variants?.products?.name??'Sản phẩm'}<small>{item.product_variants?.variant_name??''}</small></td>
          <td>{item.quantity}</td>
          <td className="money">{formatMoney(item.sale_price)}</td>
          <td className="money">{formatMoney(Number(item.quantity)*Number(item.sale_price))}</td>
        </tr>)}</tbody>
      </table>}

      {activeTab==='payment'&&<div className="sales-payment-history">
        <div className="sales-money-summary compact">
          <div><span>Tổng thanh toán</span><b>{formatMoney(sale.total_amount)}</b></div>
          <div><span>Đã thu</span><b>{formatMoney(sale.paid_amount)}</b></div>
          <div><span>Còn nợ</span><b className="warning-text">{formatMoney(sale.sale_status==='CANCELLED'?0:sale.debt_amount)}</b></div>
          <div><span>Tiền khách đưa</span><b>{formatMoney(sale.cash_received)}</b></div>
          <div><span>Tiền thừa</span><b>{formatMoney(sale.change_amount)}</b></div>
        </div>
        <h3>Các khoản thanh toán</h3>
        {!(sale.sale_payments??[]).length
          ? <div className="empty compact">{Number(sale.debt_amount)>0?'Hóa đơn đang ghi nợ, chưa có khoản thu.':'Chưa có giao dịch thanh toán.'}</div>
          : (sale.sale_payments??[]).map((payment:any)=><div className="sales-payment-item" key={payment.id}>
              <div><b>{paymentLabel(payment.method)}</b><span>{formatDateTime(payment.created_at)}</span></div>
              <div><strong>{formatMoney(payment.amount)}</strong>{payment.method==='CASH'&&<small>Khách đưa {formatMoney(payment.tendered_amount)} · thừa {formatMoney(payment.change_amount)}</small>}</div>
            </div>)}
      </div>}

      {activeTab==='history'&&<div className="sales-audit-preview">
        <div><i></i><span>{formatDateTime(sale.sale_at)}</span><b>Tạo hóa đơn POS</b><small>{sale.invoice_code}</small></div>
        <div><i></i><span>{formatDateTime(sale.sale_at)}</span><b>Trừ tồn kho</b><small>{(sale.sale_items??[]).length} dòng SKU</small></div>
        {(sale.sale_payments??[]).map((payment:any)=><div key={payment.id}><i></i><span>{formatDateTime(payment.created_at)}</span><b>Thanh toán {paymentLabel(payment.method)}</b><small>{formatMoney(payment.amount)}</small></div>)}
        {(sale.sale_returns??[]).map((entry:any)=><div key={entry.id}><i></i><span>{formatDateTime(entry.created_at)}</span><b>{entry.return_type==='CANCEL'?'Huỷ hóa đơn':entry.return_type==='FULL'?'Hoàn toàn bộ':'Hoàn một phần'}</b><small>Giá trị {formatMoney(entry.return_value)} · giảm nợ {formatMoney(entry.debt_relief)} · hoàn tiền {formatMoney(entry.refund_amount)}{entry.reason?' · '+entry.reason:''}</small></div>)}
      </div>}
    </div>

    <div className="sales-receipt-print">
      <div className="receipt-brand">
        <b>MYNH ERP</b>
        <span>PHIẾU BÁN HÀNG</span>
        <small>{sale.warehouses?.code} · {sale.warehouses?.address??sale.warehouses?.name}</small>
      </div>
      <div className="receipt-meta">
        <div><span>Mã phiếu</span><b>{sale.invoice_code??'—'}</b></div>
        <div><span>Ngày bán</span><b>{formatDateTime(sale.sale_at)}</b></div>
        <div><span>Khách hàng</span><b>{sale.customers?.name??'Khách lẻ'}</b></div>
        {sale.customers?.phone&&<div><span>SĐT</span><b>{sale.customers.phone}</b></div>}
      </div>
      <table>
        <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>{(sale.sale_items??[]).map((item:any,index:number)=><tr key={item.id}>
          <td>{index+1}</td>
          <td><b>{item.product_variants?.products?.name}</b><small>{item.product_variants?.products?.sku} · {item.product_variants?.variant_name}</small></td>
          <td>{item.quantity}</td>
          <td>{formatMoney(item.sale_price)}</td>
          <td>{formatMoney(Number(item.quantity)*Number(item.sale_price))}</td>
        </tr>)}</tbody>
      </table>
      <div className="receipt-totals">
        <div><span>Tiền hàng</span><b>{formatMoney(sale.subtotal)}</b></div>
        {Number(sale.discount_amount)>0&&<div><span>Giảm giá</span><b>−{formatMoney(sale.discount_amount)}</b></div>}
        {Number(sale.other_fee)>0&&<div><span>Phí khác</span><b>{formatMoney(sale.other_fee)}</b></div>}
        <div className="total"><span>TỔNG THANH TOÁN</span><b>{formatMoney(sale.total_amount)}</b></div>
        <div><span>Đã thu</span><b>{formatMoney(sale.paid_amount)}</b></div>
        {Number(sale.change_amount)>0&&<div><span>Tiền thừa</span><b>{formatMoney(sale.change_amount)}</b></div>}
        {sale.sale_status==='COMPLETED'&&Number(sale.debt_amount)>0&&<div><span>Còn nợ</span><b>{formatMoney(sale.debt_amount)}</b></div>}
      </div>
      <div className="receipt-payments">
        <b>THANH TOÁN</b>
        {(sale.sale_payments??[]).length
          ? (sale.sale_payments??[]).map((payment:any)=><div key={payment.id}>
              <span>{paymentLabel(payment.method)}</span>
              <b>{formatMoney(payment.amount)}</b>
            </div>)
          : <div><span>{sale.sale_status==='CANCELLED'?'Đã huỷ':'Ghi nợ'}</span><b>{formatMoney(sale.sale_status==='CANCELLED'?0:sale.debt_amount)}</b></div>}
      </div>
      {receiptQR&&<div className="receipt-qr">
        <div>
          <b>{Number(sale.debt_amount)>0?'QR THANH TOÁN CÒN NỢ':'THÔNG TIN CHUYỂN KHOẢN'}</b>
          <span>{bankConfig?.bank_name} · {bankConfig?.account_no}</span>
          <span>{bankConfig?.account_name}</span>
          <strong>{formatMoney(receiptQRAmount)}</strong>
          <small>Nội dung: {receiptQRDescription}</small>
          {Number(sale.debt_amount)<=0&&<em>ĐÃ GHI NHẬN THANH TOÁN</em>}
        </div>
        <img src={receiptQR} alt="VietQR phiếu bán hàng"/>
      </div>}
      {sale.note&&<div className="receipt-note"><span>Ghi chú</span><b>{sale.note}</b></div>}
      <p>Cảm ơn quý khách!</p>
    </div>
  </aside>
}
