import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { PrintPageButton } from '@/components/print-page-button'

type SP={
  sale?:string
  q?:string
  warehouse?:string
  payment?:string
  state?:string
  tab?:'info'|'products'|'payment'|'history'
}

function paymentLabel(method?:string|null){
  if(method==='CASH')return 'Tiền mặt'
  if(method==='TRANSFER')return 'Chuyển khoản'
  return method??'—'
}

export default async function SalesHistoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()

  const {data,error}=await supabase.from('sales')
    .select('id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,note,subtotal,discount_amount,other_fee,sale_status,cash_received,change_amount,warehouse_id,created_by,warehouses(id,code,name,address),customers(id,name,phone,address),sale_items(id,quantity,sale_price,unit_cost,product_variant_id,product_variants(id,variant_name,barcode,products(id,sku,name))),sale_payments(id,method,amount,tendered_amount,change_amount,created_at)')
    .order('sale_at',{ascending:false})
    .limit(1500)

  let rows=(data??[]) as any[]
  const q=String(sp.q??'').trim().toLowerCase()
  if(q){
    rows=rows.filter((row:any)=>
      String(row.invoice_code??row.id).toLowerCase().includes(q)||
      String(row.customers?.name??'').toLowerCase().includes(q)||
      String(row.customers?.phone??'').toLowerCase().includes(q)
    )
  }
  if(sp.warehouse)rows=rows.filter((row:any)=>String(row.warehouses?.code??'')===sp.warehouse)
  if(sp.payment)rows=rows.filter((row:any)=>String(row.payment_status??'')===sp.payment)
  if(sp.state)rows=rows.filter((row:any)=>String(row.sale_status??'')===sp.state)

  const selected=rows.find((row:any)=>String(row.id)===sp.sale)
    ??((sp.sale&&!q)
      ? ((data??[]) as any[]).find((row:any)=>String(row.id)===sp.sale)
      : null)
  const tab=sp.tab??'info'

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    for(const key of ['sale','q','warehouse','payment','state','tab'] as const){
      const value=(sp as any)[key]
      if(value)p.set(key,String(value))
    }
    for(const [key,value] of Object.entries(extra)){
      if(value===null||value===undefined||value==='')p.delete(key)
      else p.set(key,value)
    }
    const qs=p.toString()
    return '/sales/history'+(qs?'?'+qs:'')
  }

  const warehouses=[...new Map(((data??[]) as any[])
    .filter((row:any)=>row.warehouses?.code)
    .map((row:any)=>[String(row.warehouses.code),row.warehouses])).values()] as any[]

  return <div className={'tracking-screen tracking-screen-v2 sales-history-screen sales-history-v3 '+(selected?'with-panel':'')}>
    <header className="page-head tracking-page-head-v2 sales-page-head-v3">
      <div>
        <span className="module-eyebrow">BÁN HÀNG</span>
        <h1>Lịch sử bán</h1>
        <p>Tra cứu hóa đơn POS, sản phẩm, thanh toán và lịch sử sau bán</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/sales">Tổng quan</Link>
        <Link className="button primary" href="/sales/pos">Mở POS</Link>
      </div>
    </header>

    <form className="entity-command-bar sales-history-command" action="/sales/history">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Tìm mã HĐ / khách hàng / SĐT..."/>
      <select name="warehouse" defaultValue={sp.warehouse??''}>
        <option value="">Tất cả kho</option>
        {warehouses.map((w:any)=><option key={w.code} value={w.code}>{w.code} · {w.address??w.name}</option>)}
      </select>
      <select name="payment" defaultValue={sp.payment??''}>
        <option value="">Tất cả thanh toán</option>
        <option value="PAID">Đã thanh toán</option>
        <option value="PARTIAL">Thanh toán một phần</option>
        <option value="UNPAID">Chưa thanh toán</option>
      </select>
      <select name="state" defaultValue={sp.state??''}>
        <option value="">Tất cả trạng thái</option>
        <option value="COMPLETED">Hoàn tất</option>
        <option value="CANCELLED">Đã huỷ</option>
        <option value="PARTIAL_RETURN">Hoàn một phần</option>
        <option value="RETURNED">Đã hoàn toàn bộ</option>
      </select>
      <button className="button primary" type="submit">Lọc</button>
      <Link className="button" href="/sales/history">Đặt lại</Link>
    </form>

    {error&&<div className="error-box">Không thể tải lịch sử bán: {error.message}</div>}

    <div className="sales-history-workspace">
      <section className="sales-history-list">
        <div className="entity-result-meta">
          <div><b>{rows.length}</b><span> hóa đơn</span></div>
          <span>Click mã hóa đơn để xem chi tiết</span>
        </div>
        <div className="sales-history-table-wrap">
          <table className="table sales-history-table">
            <thead><tr>
              <th>Mã HĐ</th><th>Thời gian</th><th>Kho</th><th>Khách hàng</th>
              <th>SP</th><th>Tổng tiền</th><th>Đã thu</th><th>Còn nợ</th><th>Thanh toán</th><th>Trạng thái</th>
            </tr></thead>
            <tbody>
              {!rows.length
                ? <tr><td colSpan={10} className="empty">Chưa có hóa đơn POS phù hợp.</td></tr>
                : rows.map((row:any)=>{
                    const qty=(row.sale_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity??0),0)
                    const selectedRow=selected&&String(selected.id)===String(row.id)
                    return <tr key={row.id} className={selectedRow?'selected':''}>
                      <td><Link className="table-link" href={href({sale:String(row.id),tab:'info'})}>{row.invoice_code??'POS-'+String(row.id).slice(0,8)}</Link></td>
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
      </section>

      {selected&&<aside className="sales-history-panel">
        <div className="sales-history-panel-head">
          <div>
            <span className="module-eyebrow">HÓA ĐƠN POS</span>
            <h2>{selected.invoice_code??'POS-'+String(selected.id).slice(0,8)}</h2>
            <p>{formatDateTime(selected.sale_at)} · {selected.warehouses?.code} · {selected.warehouses?.address??selected.warehouses?.name}</p>
          </div>
          <Link className="panel-close" href={href({sale:null,tab:null})}>×</Link>
        </div>

        <div className="sales-history-actions">
          <PrintPageButton label="In hóa đơn"/>
          <button className="button small" type="button" disabled>Huỷ hóa đơn</button>
          <button className="button small" type="button" disabled>Hoàn hàng</button>
        </div>

        <div className="panel-tabs">
          <Link className={tab==='info'?'active':''} href={href({sale:selected.id,tab:'info'})}>Thông tin</Link>
          <Link className={tab==='products'?'active':''} href={href({sale:selected.id,tab:'products'})}>Sản phẩm</Link>
          <Link className={tab==='payment'?'active':''} href={href({sale:selected.id,tab:'payment'})}>Thanh toán</Link>
          <Link className={tab==='history'?'active':''} href={href({sale:selected.id,tab:'history'})}>Lịch sử</Link>
        </div>

        <div className="sales-history-panel-scroll">
          {tab==='info'&&<>
            <div className="sales-detail-grid">
              <div><span>Mã hóa đơn</span><b>{selected.invoice_code??'—'}</b></div>
              <div><span>Trạng thái</span><b>{statusLabel(selected.sale_status)}</b></div>
              <div><span>Kho bán</span><b>{selected.warehouses?.code??'—'} · {selected.warehouses?.address??selected.warehouses?.name??''}</b></div>
              <div><span>Thời gian</span><b>{formatDateTime(selected.sale_at)}</b></div>
              <div><span>Khách hàng</span><b>{selected.customers?.name??'Khách lẻ'}</b></div>
              <div><span>SĐT</span><b>{selected.customers?.phone??'—'}</b></div>
              <div className="full"><span>Địa chỉ</span><b>{selected.customers?.address??'—'}</b></div>
              <div className="full"><span>Ghi chú</span><b>{selected.note??'—'}</b></div>
            </div>

            <div className="sales-money-summary">
              <div><span>Tiền hàng</span><b>{formatMoney(selected.subtotal)}</b></div>
              <div><span>Giảm giá</span><b>−{formatMoney(selected.discount_amount)}</b></div>
              <div><span>Phí khác</span><b>{formatMoney(selected.other_fee)}</b></div>
              <div className="total"><span>Tổng thanh toán</span><b>{formatMoney(selected.total_amount)}</b></div>
              <div><span>Đã thu</span><b>{formatMoney(selected.paid_amount)}</b></div>
              <div><span>Còn nợ</span><b className="warning-text">{formatMoney(selected.debt_amount)}</b></div>
            </div>
          </>}

          {tab==='products'&&<table className="table sales-detail-products">
            <thead><tr><th>#</th><th>SKU</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
            <tbody>{(selected.sale_items??[]).map((item:any,index:number)=><tr key={item.id}>
              <td>{index+1}</td>
              <td><b>{item.product_variants?.products?.sku??'—'}</b></td>
              <td>{item.product_variants?.products?.name??'Sản phẩm'}<small>{item.product_variants?.variant_name??''}</small></td>
              <td>{item.quantity}</td>
              <td className="money">{formatMoney(item.sale_price)}</td>
              <td className="money">{formatMoney(Number(item.quantity)*Number(item.sale_price))}</td>
            </tr>)}</tbody>
          </table>}

          {tab==='payment'&&<div className="sales-payment-history">
            <div className="sales-money-summary compact">
              <div><span>Tổng thanh toán</span><b>{formatMoney(selected.total_amount)}</b></div>
              <div><span>Đã thu</span><b>{formatMoney(selected.paid_amount)}</b></div>
              <div><span>Còn nợ</span><b className="warning-text">{formatMoney(selected.debt_amount)}</b></div>
              <div><span>Tiền khách đưa</span><b>{formatMoney(selected.cash_received)}</b></div>
              <div><span>Tiền thừa</span><b>{formatMoney(selected.change_amount)}</b></div>
            </div>
            <h3>Các khoản thanh toán</h3>
            {!(selected.sale_payments??[]).length
              ? <div className="empty compact">{Number(selected.debt_amount)>0?'Hóa đơn đang ghi nợ, chưa có khoản thu.':'Chưa có giao dịch thanh toán.'}</div>
              : (selected.sale_payments??[]).map((payment:any)=><div className="sales-payment-item" key={payment.id}>
                  <div><b>{paymentLabel(payment.method)}</b><span>{formatDateTime(payment.created_at)}</span></div>
                  <div><strong>{formatMoney(payment.amount)}</strong>{payment.method==='CASH'&&<small>Khách đưa {formatMoney(payment.tendered_amount)} · thừa {formatMoney(payment.change_amount)}</small>}</div>
                </div>)}
          </div>}

          {tab==='history'&&<div className="sales-audit-preview">
            <div><i></i><span>{formatDateTime(selected.sale_at)}</span><b>Tạo hóa đơn POS</b><small>{selected.invoice_code}</small></div>
            <div><i></i><span>{formatDateTime(selected.sale_at)}</span><b>Trừ tồn kho</b><small>{(selected.sale_items??[]).length} dòng SKU</small></div>
            {(selected.sale_payments??[]).map((payment:any)=><div key={payment.id}><i></i><span>{formatDateTime(payment.created_at)}</span><b>Thanh toán {paymentLabel(payment.method)}</b><small>{formatMoney(payment.amount)}</small></div>)}
          </div>}
        </div>

        <div className="sales-receipt-print">
          <div className="receipt-brand"><b>MYNH ERP</b><span>HÓA ĐƠN BÁN HÀNG</span></div>
          <div className="receipt-meta">
            <div><span>Mã HĐ</span><b>{selected.invoice_code??'—'}</b></div>
            <div><span>Ngày bán</span><b>{formatDateTime(selected.sale_at)}</b></div>
            <div><span>Kho bán</span><b>{selected.warehouses?.code} · {selected.warehouses?.address??selected.warehouses?.name}</b></div>
            <div><span>Khách hàng</span><b>{selected.customers?.name??'Khách lẻ'}</b></div>
          </div>
          <table>
            <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
            <tbody>{(selected.sale_items??[]).map((item:any,index:number)=><tr key={item.id}>
              <td>{index+1}</td>
              <td><b>{item.product_variants?.products?.name}</b><small>{item.product_variants?.products?.sku} · {item.product_variants?.variant_name}</small></td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.sale_price)}</td>
              <td>{formatMoney(Number(item.quantity)*Number(item.sale_price))}</td>
            </tr>)}</tbody>
          </table>
          <div className="receipt-totals">
            <div><span>Tiền hàng</span><b>{formatMoney(selected.subtotal)}</b></div>
            <div><span>Giảm giá</span><b>−{formatMoney(selected.discount_amount)}</b></div>
            <div><span>Phí khác</span><b>{formatMoney(selected.other_fee)}</b></div>
            <div className="total"><span>TỔNG THANH TOÁN</span><b>{formatMoney(selected.total_amount)}</b></div>
            <div><span>Đã thu</span><b>{formatMoney(selected.paid_amount)}</b></div>
            <div><span>Tiền thừa</span><b>{formatMoney(selected.change_amount)}</b></div>
            <div><span>Còn nợ</span><b>{formatMoney(selected.debt_amount)}</b></div>
          </div>
          <p>Cảm ơn quý khách!</p>
        </div>
      </aside>}
    </div>
  </div>
}
