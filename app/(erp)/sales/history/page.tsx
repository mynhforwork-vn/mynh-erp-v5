import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime,formatMoney,statusLabel } from '@/lib/format'
import { PrintPageButton } from '@/components/print-page-button'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import { SalesHistoryActions } from '@/components/sales-history-actions'
import { SalesHistoryTable } from '@/components/sales-history-table'
import { buildTransferDescription,buildVietQRUrl } from '@/lib/vietqr'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'|'all'
type SP={
  sale?:string
  q?:string
  warehouse?:string
  payment?:string
  state?:string
  range?:RangeKey
  from?:string
  to?:string
  archive?:'archived'
  tab?:'info'|'products'|'payment'|'history'
}

function paymentLabel(method?:string|null){
  if(method==='CASH')return 'Tiền mặt'
  if(method==='TRANSFER')return 'Chuyển khoản'
  return method??'—'
}

const HOUR=60*60*1000
const DAY=24*HOUR
function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function localStartIso(dateText:string){return new Date(`${dateText}T00:00:00+07:00`).toISOString()}
function localEndIso(dateText:string){return new Date(`${dateText}T23:59:59.999+07:00`).toISOString()}
function shiftLocalDays(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {from:shiftLocalDays(y,m,d,-daysFromMonday),to:shiftLocalDays(y,m,d,6-daysFromMonday)}
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'all'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){const x=currentWeekRange(p.year,p.month,p.day);from=x.from;to=x.to;label='Tuần này'}
  if(key==='7d'){from=shiftLocalDays(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDays(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){from=ymd(p.year,Math.floor((p.month-1)/3)*3+1,1);label='Quý này'}
  if(key==='year'){from=ymd(p.year,1,1);label='Năm nay'}
  if(key==='all'){from='1970-01-01';to='9999-12-31';label='Toàn thời gian'}
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {key,from,to,label,start:localStartIso(from),end:localEndIso(to)}
}

export default async function SalesHistoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canOperate=['admin','operator'].includes(role)
  const range=resolveRange(sp)
  const archiveView=sp.archive==='archived'

  let salesQuery=supabase.from('sales')
    .select('id,invoice_code,sale_at,total_amount,paid_amount,debt_amount,payment_status,note,subtotal,discount_amount,other_fee,sale_status,cash_received,change_amount,warehouse_id,created_by,archived_at,archived_by,warehouses(id,code,name,address),customers(id,name,phone,address),sale_items(id,quantity,sale_price,unit_cost,product_variant_id,product_variants(id,variant_name,barcode,products(id,sku,name))),sale_payments(id,method,amount,tendered_amount,change_amount,reference_code,created_at),sale_returns(id,return_type,reason,return_value,debt_relief,refund_amount,created_at,sale_return_items(sale_item_id,quantity))')
    .gte('sale_at',range.start)
    .lte('sale_at',range.end)
    .order('sale_at',{ascending:false})
    .limit(1500)
  salesQuery=archiveView
    ? salesQuery.not('archived_at','is',null)
    : salesQuery.is('archived_at',null)

  const [salesResult,bankTransferResult]=await Promise.all([
    salesQuery,
    supabase.from('bank_transfer_configs')
      .select('config_key,bank_id,bank_name,account_no,account_name,qr_template,transfer_prefix,is_active')
      .eq('config_key','DEFAULT')
      .maybeSingle(),
  ])
  const {data,error}=salesResult
  const bankTransferConfig=(bankTransferResult.data??null) as any

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
  const transferPayment=selected
    ? (selected.sale_payments??[]).find((payment:any)=>payment.method==='TRANSFER')
    : null
  const receiptQRAmount=selected&&selected.sale_status==='COMPLETED'
    ? Number(selected.debt_amount)>0
      ? Number(selected.debt_amount)
      : Number(transferPayment?.amount??0)
    : 0
  const receiptQRReference=selected
    ? String(
        Number(selected.debt_amount)>0
          ? selected.invoice_code??selected.id
          : transferPayment?.reference_code??selected.invoice_code??selected.id
      )
    : ''
  const receiptQRDescription=selected&&bankTransferConfig
    ? buildTransferDescription(bankTransferConfig.transfer_prefix,receiptQRReference)
    : ''
  const receiptQR=selected&&bankTransferConfig?.is_active&&receiptQRAmount>0
    ? buildVietQRUrl(bankTransferConfig,receiptQRAmount,receiptQRDescription,'qr_only')
    : ''

  function href(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    for(const key of ['sale','q','warehouse','payment','state','range','from','to','archive','tab'] as const){
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

    <div className="tracking-date-row-v2 sales-date-row-v2"><PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      basePath="/sales/history"
      showAll
      preserveParams={{
        q:sp.q??null,
        warehouse:sp.warehouse??null,
        payment:sp.payment??null,
        state:sp.state??null,
        archive:archiveView?'archived':null,
        sale:sp.sale??null,
        tab:sp.tab??null,
      }}
    /></div>

    <form className="entity-command-bar sales-history-command" action="/sales/history">
      <input type="hidden" name="range" value={range.key}/>
      {range.key==='custom'&&<><input type="hidden" name="from" value={range.from}/><input type="hidden" name="to" value={range.to}/></>}
      {archiveView&&<input type="hidden" name="archive" value="archived"/>}
      {sp.sale&&<input type="hidden" name="sale" value={sp.sale}/>}
      {sp.tab&&<input type="hidden" name="tab" value={sp.tab}/>}
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
      <Link className="button" href={href({q:null,warehouse:null,payment:null,state:null})}>Đặt lại</Link>
      <div className="archive-view-toggle">
        <Link className={!archiveView?'active':''} href={href({archive:null,sale:null,tab:null})}>Đang dùng</Link>
        <Link className={archiveView?'active':''} href={href({archive:'archived',sale:null,tab:null})}>Đã lưu trữ</Link>
      </div>
    </form>

    {error&&<div className="error-box">Không thể tải lịch sử bán: {error.message}</div>}

    <div className="sales-history-workspace">
      <section className="sales-history-list">
        <div className="entity-result-meta">
          <div><b>{rows.length}</b><span> hóa đơn</span></div>
          <span>Click mã hóa đơn để xem chi tiết</span>
        </div>
        <SalesHistoryTable
          rows={rows}
          selectedId={selected?.id??null}
          baseQuery={href({sale:null,tab:null}).split('?')[1]??''}
          archiveView={archiveView}
          canOperate={canOperate}
        />
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
          <SalesHistoryActions
            saleId={String(selected.id)}
            invoiceCode={String(selected.invoice_code??'POS-'+String(selected.id).slice(0,8))}
            saleStatus={String(selected.sale_status??'COMPLETED')}
            canOperate={canOperate}
            items={(selected.sale_items??[]).map((item:any)=>({
              id:String(item.id),
              sku:String(item.product_variants?.products?.sku??'—'),
              name:String(item.product_variants?.products?.name??'Sản phẩm'),
              variant:String(item.product_variants?.variant_name??''),
              quantity:Number(item.quantity??0),
              returnedQuantity:(selected.sale_returns??[])
                .flatMap((entry:any)=>entry.sale_return_items??[])
                .filter((returned:any)=>String(returned.sale_item_id)===String(item.id))
                .reduce((sum:number,returned:any)=>sum+Number(returned.quantity??0),0),
            }))}
          />
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
              <div><span>Còn nợ</span><b className="warning-text">{formatMoney(selected.sale_status==='CANCELLED'?0:selected.debt_amount)}</b></div>
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
              <div><span>Còn nợ</span><b className="warning-text">{formatMoney(selected.sale_status==='CANCELLED'?0:selected.debt_amount)}</b></div>
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
            {(selected.sale_returns??[]).map((entry:any)=><div key={entry.id}><i></i><span>{formatDateTime(entry.created_at)}</span><b>{entry.return_type==='CANCEL'?'Huỷ hóa đơn':entry.return_type==='FULL'?'Hoàn toàn bộ':'Hoàn một phần'}</b><small>Giá trị {formatMoney(entry.return_value)} · giảm nợ {formatMoney(entry.debt_relief)} · hoàn tiền {formatMoney(entry.refund_amount)}{entry.reason?' · '+entry.reason:''}</small></div>)}
          </div>}
        </div>

        <div className="sales-receipt-print">
          <div className="receipt-brand">
            <b>MYNH ERP</b>
            <span>PHIẾU BÁN HÀNG</span>
            <small>{selected.warehouses?.code} · {selected.warehouses?.address??selected.warehouses?.name}</small>
          </div>
          <div className="receipt-meta">
            <div><span>Mã phiếu</span><b>{selected.invoice_code??'—'}</b></div>
            <div><span>Ngày bán</span><b>{formatDateTime(selected.sale_at)}</b></div>
            <div><span>Khách hàng</span><b>{selected.customers?.name??'Khách lẻ'}</b></div>
            {selected.customers?.phone&&<div><span>SĐT</span><b>{selected.customers.phone}</b></div>}
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
            {Number(selected.discount_amount)>0&&<div><span>Giảm giá</span><b>−{formatMoney(selected.discount_amount)}</b></div>}
            {Number(selected.other_fee)>0&&<div><span>Phí khác</span><b>{formatMoney(selected.other_fee)}</b></div>}
            <div className="total"><span>TỔNG THANH TOÁN</span><b>{formatMoney(selected.total_amount)}</b></div>
            <div><span>Đã thu</span><b>{formatMoney(selected.paid_amount)}</b></div>
            {Number(selected.change_amount)>0&&<div><span>Tiền thừa</span><b>{formatMoney(selected.change_amount)}</b></div>}
            {selected.sale_status==='COMPLETED'&&Number(selected.debt_amount)>0&&<div><span>Còn nợ</span><b>{formatMoney(selected.debt_amount)}</b></div>}
          </div>
          <div className="receipt-payments">
            <b>THANH TOÁN</b>
            {(selected.sale_payments??[]).length
              ? (selected.sale_payments??[]).map((payment:any)=><div key={payment.id}>
                  <span>{paymentLabel(payment.method)}</span>
                  <b>{formatMoney(payment.amount)}</b>
                </div>)
              : <div><span>{selected.sale_status==='CANCELLED'?'Đã huỷ':'Ghi nợ'}</span><b>{formatMoney(selected.sale_status==='CANCELLED'?0:selected.debt_amount)}</b></div>}
          </div>
          {receiptQR&&<div className="receipt-qr">
            <div>
              <b>{Number(selected.debt_amount)>0?'QR THANH TOÁN CÒN NỢ':'THÔNG TIN CHUYỂN KHOẢN'}</b>
              <span>{bankTransferConfig.bank_name} · {bankTransferConfig.account_no}</span>
              <span>{bankTransferConfig.account_name}</span>
              <strong>{formatMoney(receiptQRAmount)}</strong>
              <small>Nội dung: {receiptQRDescription}</small>
              {Number(selected.debt_amount)<=0&&<em>ĐÃ GHI NHẬN THANH TOÁN</em>}
            </div>
            <img src={receiptQR} alt="VietQR phiếu bán hàng"/>
          </div>}
          {selected.note&&<div className="receipt-note"><span>Ghi chú</span><b>{selected.note}</b></div>}
          <p>Cảm ơn quý khách!</p>
        </div>
      </aside>}
    </div>
  </div>
}
