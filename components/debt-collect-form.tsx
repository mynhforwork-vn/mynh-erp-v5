'use client'

import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registerCustomerDebtPayment } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'

type InvoiceItem={id:string,sku:string,name:string,variant:string,quantity:number,sale_price:number}
type Invoice={id:string,code:string,time:string,total:number,paid:number,debt:number,warehouse:string,items:InvoiceItem[]}
type Props={
  customer:{id:string,name:string,phone:string}
  balance:number
  invoices:Invoice[]
  bankConfig:BankTransferConfig|null
}

function money(value:number){
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(value))+'đ'
}
function newReceiptCode(){
  const d=new Date()
  const y=String(d.getFullYear()).slice(-2)
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return 'PTN-'+y+m+day+'-'+String(Date.now()).slice(-6)
}
function allocateFifo(invoices:Invoice[],amount:number){
  let left=Math.max(0,amount)
  const next:Record<string,number>={}
  for(const row of invoices){
    if(left<=0)break
    const value=Math.min(left,row.debt)
    if(value>0)next[row.id]=value
    left-=value
  }
  return next
}

export function DebtCollectForm({customer,balance,invoices,bankConfig}:Props){
  const router=useRouter()
  const [pending,startTransition]=useTransition()
  const [step,setStep]=useState<1|2>(1)
  const [method,setMethod]=useState<'CASH'|'TRANSFER'|'COMBINED'>('CASH')
  const [amount,setAmount]=useState(balance)
  const [cash,setCash]=useState(balance)
  const [transfer,setTransfer]=useState(0)
  const [note,setNote]=useState('')
  const [receiptCode]=useState(newReceiptCode)
  const [allocations,setAllocations]=useState<Record<string,number>>(()=>allocateFifo(invoices,balance))
  const [error,setError]=useState('')
  const [success,setSuccess]=useState<any>(null)

  const allocated=Object.values(allocations).reduce((sum,x)=>sum+Number(x||0),0)
  const transferAmount=method==='TRANSFER'?amount:method==='COMBINED'?transfer:0
  const transferDescription=buildTransferDescription(null,receiptCode)
  const qr=bankConfig?.is_active&&transferAmount>0
    ? buildVietQRUrl(bankConfig,transferAmount,transferDescription,'compact2')
    : ''

  function changeAmount(next:number){
    const value=Math.max(0,Math.min(balance,Number(next)||0))
    setAmount(value)
    if(method==='CASH'){setCash(value);setTransfer(0)}
    if(method==='TRANSFER'){setCash(0);setTransfer(value)}
    if(method==='COMBINED'){const c=Math.floor(value/2);setCash(c);setTransfer(value-c)}
    setAllocations(allocateFifo(invoices,value))
    setError('')
  }
  function changeMethod(next:'CASH'|'TRANSFER'|'COMBINED'){
    setMethod(next)
    if(next==='CASH'){setCash(amount);setTransfer(0)}
    if(next==='TRANSFER'){setCash(0);setTransfer(amount)}
    if(next==='COMBINED'){const c=Math.floor(amount/2);setCash(c);setTransfer(amount-c)}
    setError('')
  }
  function nextStep(){
    setError('')
    if(amount<=0){setError('Số tiền thu phải lớn hơn 0');return}
    if(method==='COMBINED'&&Math.round((cash+transfer)*100)!==Math.round(amount*100)){
      setError('Tiền mặt + Chuyển khoản phải bằng số tiền thu');return
    }
    setAllocations(allocateFifo(invoices,amount))
    setStep(2)
  }
  function submit(){
    setError('')
    if(amount<=0){setError('Số tiền thu phải lớn hơn 0');return}
    if(Math.round(allocated*100)!==Math.round(amount*100)){
      setError('Tổng phân bổ phải bằng số tiền thu');return
    }
    if(method==='COMBINED'&&Math.round((cash+transfer)*100)!==Math.round(amount*100)){
      setError('Tiền mặt + Chuyển khoản phải bằng số tiền thu');return
    }
    startTransition(async()=>{
      const result=await registerCustomerDebtPayment({
        customer_id:customer.id,
        amount,
        payment_method:method,
        cash_amount:method==='CASH'?amount:method==='TRANSFER'?0:cash,
        transfer_amount:method==='TRANSFER'?amount:method==='CASH'?0:transfer,
        note,
        receipt_code:receiptCode,
        allocations:invoices.map(row=>({sale_id:row.id,amount:Number(allocations[row.id]||0)})).filter(x=>x.amount>0),
      })
      if(!result.ok){setError(result.error);return}
      setSuccess(result.data)
      router.refresh()
    })
  }

  if(success)return <div className="debt-collect-v2 debt-collect-success-v2">
    <div className="debt-collect-v2-head">
      <div><span className="module-eyebrow">THU NỢ THÀNH CÔNG</span><b>{String(success.receipt_code??receiptCode)}</b><small>{customer.name} · {customer.phone}</small></div>
      <strong>{money(Number(success.amount??amount))}</strong>
    </div>
    <div className="debt-success-grid-v2">
      <div><span>Phương thức</span><b>{method==='CASH'?'Tiền mặt':method==='TRANSFER'?'Chuyển khoản':'Kết hợp'}</b></div>
      <div><span>Đã phân bổ</span><b>{money(allocated)}</b></div>
      <div><span>Công nợ trước thu</span><b>{money(balance)}</b></div>
      <div><span>Còn lại</span><b>{money(Math.max(0,balance-amount))}</b></div>
    </div>
    <div className="debt-success-invoices-v2">
      {invoices.filter(row=>Number(allocations[row.id]??0)>0).map(row=><div key={row.id}>
        <span><b>{row.code}</b><small>{row.items.length} sản phẩm</small></span>
        <strong>{money(Number(allocations[row.id]??0))}</strong>
      </div>)}
    </div>
    <div className="debt-collect-footer-v2">
      <button className="button" type="button" onClick={()=>window.print()}>In phiếu thu</button>
    </div>
  </div>

  return <div className="debt-collect-v2">
    <div className="debt-collect-v2-head">
      <div>
        <span className="module-eyebrow">THU CÔNG NỢ</span>
        <b>{customer.name}</b>
        <small>{customer.phone} · Phiếu {receiptCode}</small>
      </div>
      <div className="debt-collect-balance-v2"><span>Còn nợ</span><strong>{money(balance)}</strong></div>
    </div>

    <div className="debt-stepper-v2">
      <button type="button" className={step===1?'active':'done'} onClick={()=>setStep(1)}><span>1</span><b>Thanh toán</b></button>
      <i/>
      <button type="button" className={step===2?'active':''} onClick={nextStep}><span>2</span><b>Phân bổ hóa đơn</b></button>
    </div>

    {error&&<div className="error-box compact">{error}</div>}

    {step===1&&<div className="debt-step-body-v2">
      <section className="debt-amount-card-v2">
        <div className="debt-field-title-v2"><span>Số tiền thu</span><small>Tối đa {money(balance)}</small></div>
        <div className="debt-amount-input-v2">
          <input type="number" min={1} max={balance} value={amount} onChange={e=>changeAmount(Number(e.target.value))}/>
          <span>đ</span>
        </div>
        <div className="debt-quick-v2">
          <button type="button" onClick={()=>changeAmount(balance)}>Toàn bộ</button>
          <button type="button" onClick={()=>changeAmount(Math.round(balance/2))}>50%</button>
          <button type="button" onClick={()=>changeAmount(Math.min(balance,100000))}>100.000đ</button>
        </div>
      </section>

      <section className="debt-method-card-v2">
        <div className="debt-field-title-v2"><span>Phương thức thanh toán</span></div>
        <div className="debt-methods-v2">
          <button type="button" className={method==='CASH'?'active':''} onClick={()=>changeMethod('CASH')}><b>Tiền mặt</b><small>Thu trực tiếp</small></button>
          <button type="button" className={method==='TRANSFER'?'active':''} onClick={()=>changeMethod('TRANSFER')}><b>Chuyển khoản</b><small>VietQR</small></button>
          <button type="button" className={method==='COMBINED'?'active':''} onClick={()=>changeMethod('COMBINED')}><b>Kết hợp</b><small>Tiền mặt + CK</small></button>
        </div>
      </section>

      {method==='TRANSFER'&&<section className="debt-transfer-v2">
        <div className="debt-transfer-qr-v2">
          {qr?<img src={qr} alt="QR thu công nợ"/>:<div className="debt-qr-empty"><b>Chưa cấu hình QR</b><span>Cài đặt → Thanh toán & QR</span></div>}
        </div>
        <div className="debt-transfer-info-v2">
          <div><span>Số tiền</span><b>{money(amount)}</b></div>
          <div><span>Ngân hàng</span><b>{bankConfig?.bank_name??'—'}</b></div>
          <div><span>Số tài khoản</span><b>{bankConfig?.account_no??'—'}</b></div>
          <div><span>Nội dung CK</span><b>{receiptCode}</b></div>
        </div>
      </section>}

      {method==='COMBINED'&&<section className="debt-combined-v2">
        <label><span>Tiền mặt</span><input type="number" min={0} value={cash} onChange={e=>setCash(Math.max(0,Number(e.target.value)||0))}/></label>
        <label><span>Chuyển khoản</span><input type="number" min={0} value={transfer} onChange={e=>setTransfer(Math.max(0,Number(e.target.value)||0))}/></label>
        <div className={(Math.round((cash+transfer)*100)===Math.round(amount*100))?'ok':'bad'}><span>Tổng nhận</span><b>{money(cash+transfer)}</b></div>
      </section>}

      <label className="debt-note-v2"><span>Ghi chú</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Không bắt buộc"/></label>

      <div className="debt-collect-footer-v2">
        <button className="button primary" type="button" onClick={nextStep}>Tiếp tục phân bổ hóa đơn →</button>
      </div>
    </div>}

    {step===2&&<div className="debt-step-body-v2">
      <div className="debt-allocation-summary-v2">
        <div><span>Số tiền thu</span><b>{money(amount)}</b></div>
        <div><span>Đã phân bổ</span><b>{money(allocated)}</b></div>
        <div className={Math.round(allocated*100)===Math.round(amount*100)?'ok':'bad'}><span>Chênh lệch</span><b>{money(amount-allocated)}</b></div>
      </div>

      <div className="debt-allocation-toolbar-v2">
        <div><b>Phân bổ vào hóa đơn</b><span>Ưu tiên nợ cũ trước</span></div>
        <button className="button small" type="button" onClick={()=>setAllocations(allocateFifo(invoices,amount))}>Tự phân bổ</button>
      </div>

      <div className="debt-invoice-allocation-list-v2">
        {invoices.length?invoices.map(row=>{
          const value=Number(allocations[row.id]??0)
          return <div className={'debt-invoice-allocation-v2 '+(value>0?'selected':'')} key={row.id}>
            <div className="debt-invoice-allocation-main-v2">
              <div className="debt-invoice-id-v2"><b>{row.code}</b><span>{row.time} · {row.warehouse}</span></div>
              <div className="debt-invoice-debt-v2"><span>Còn nợ</span><b>{money(row.debt)}</b></div>
              <label><span>Thu vào HĐ</span><input type="number" min={0} max={row.debt} value={value} onChange={e=>{
                const next=Math.max(0,Math.min(row.debt,Number(e.target.value)||0))
                setAllocations(prev=>({...prev,[row.id]:next}))
              }}/></label>
            </div>
            <details className="debt-invoice-products-v2">
              <summary>{row.items.length} sản phẩm · Xem chi tiết</summary>
              <div>{row.items.map(item=><div key={item.id}>
                <span><b>{item.name}</b><small>{item.sku} · {item.variant}</small></span>
                <strong>{item.quantity} × {money(item.sale_price)}</strong>
              </div>)}</div>
            </details>
          </div>
        }):<div className="empty compact">Không còn hóa đơn nợ.</div>}
      </div>

      <div className="debt-collect-footer-v2 split">
        <button className="button" type="button" onClick={()=>setStep(1)}>← Quay lại</button>
        <button className="button primary" type="button" onClick={submit} disabled={pending||balance<=0||Math.round(allocated*100)!==Math.round(amount*100)}>
          {pending?'Đang ghi nhận...':'Xác nhận thu '+money(amount)}
        </button>
      </div>
    </div>}
  </div>
}
