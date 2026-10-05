'use client'

import { useMemo,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registerCustomerDebtPayment } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'

type Invoice={id:string,code:string,time:string,total:number,paid:number,debt:number,warehouse:string}
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
  function submit(){
    setError('')
    if(amount<=0){setError('Số tiền thu phải lớn hơn 0');return}
    if(Math.round(allocated*100)!==Math.round(amount*100)){setError('Tổng phân bổ phải bằng số tiền thu');return}
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

  return <div className="debt-collect-live">
    <div className="debt-collect-head">
      <div><span className="module-eyebrow">THU CÔNG NỢ</span><b>{receiptCode}</b><small>{customer.name} · {customer.phone}</small></div>
    </div>

    {error&&<div className="error-box">{error}</div>}
    {success&&<div className="success-box">Đã ghi nhận {String(success.receipt_code??receiptCode)} · {money(Number(success.amount??amount))}</div>}

    <div className="debt-collect-amount">
      <span>Số tiền thu</span>
      <input type="number" min={1} max={balance} value={amount} onChange={e=>changeAmount(Number(e.target.value))}/>
      <small>Công nợ hiện tại {money(balance)}</small>
      <div className="debt-quick-amounts">
        <button type="button" onClick={()=>changeAmount(balance)}>Thu toàn bộ</button>
        <button type="button" onClick={()=>changeAmount(Math.round(balance/2))}>50%</button>
        <button type="button" onClick={()=>changeAmount(Math.min(balance,100000))}>100.000đ</button>
      </div>
    </div>

    <div className="debt-collect-methods">
      <button type="button" className={method==='CASH'?'active':''} onClick={()=>changeMethod('CASH')}>Tiền mặt</button>
      <button type="button" className={method==='TRANSFER'?'active':''} onClick={()=>changeMethod('TRANSFER')}>Chuyển khoản</button>
      <button type="button" className={method==='COMBINED'?'active':''} onClick={()=>changeMethod('COMBINED')}>Kết hợp</button>
    </div>

    {method==='TRANSFER'&&<div className="debt-collect-transfer">
      {qr?<img src={qr} alt="QR thu công nợ"/>:<div className="debt-qr-empty"><b>Chưa cấu hình QR</b><span>Cài đặt → Thanh toán & QR</span></div>}
      <div>
        <div><span>Số tiền</span><b className="amount">{money(amount)}</b></div>
        <div><span>Ngân hàng</span><b>{bankConfig?.bank_name??'—'}</b></div>
        <div><span>Số tài khoản</span><b>{bankConfig?.account_no??'—'}</b></div>
        <div><span>Nội dung CK</span><b>{receiptCode}</b></div>
      </div>
    </div>}

    {method==='COMBINED'&&<div className="debt-combined-live">
      <label>Tiền mặt<input type="number" min={0} value={cash} onChange={e=>setCash(Math.max(0,Number(e.target.value)||0))}/></label>
      <label>Chuyển khoản<input type="number" min={0} value={transfer} onChange={e=>setTransfer(Math.max(0,Number(e.target.value)||0))}/></label>
      {transfer>0&&<div className="debt-combined-qr">{qr?<img src={qr} alt="QR phần chuyển khoản"/>:<div className="debt-qr-empty">Chưa cấu hình QR</div>}<span>{money(transfer)} · {receiptCode}</span></div>}
      <div className={(Math.round((cash+transfer)*100)===Math.round(amount*100))?'valid':'invalid'}>
        <span>Tổng nhận</span><b>{money(cash+transfer)}</b>
      </div>
    </div>}

    <div className="debt-allocation debt-allocation-edit">
      <span>Phân bổ vào hóa đơn</span>
      {invoices.length?invoices.map(row=><label key={row.id}>
        <div><b>{row.code}</b><small>{row.time} · {row.warehouse} · còn {money(row.debt)}</small></div>
        <input type="number" min={0} max={row.debt} value={allocations[row.id]??0} onChange={e=>{
          const value=Math.max(0,Math.min(row.debt,Number(e.target.value)||0))
          setAllocations(prev=>({...prev,[row.id]:value}))
        }}/>
      </label>):<div className="empty compact">Không còn hóa đơn nợ.</div>}
      <div className={(Math.round(allocated*100)===Math.round(amount*100))?'allocation-ok':'allocation-bad'}>
        <span>Đã phân bổ</span><b>{money(allocated)}</b><small>Chênh lệch {money(amount-allocated)}</small>
      </div>
      <button className="button small" type="button" onClick={()=>setAllocations(allocateFifo(invoices,amount))}>Tự phân bổ nợ cũ</button>
    </div>

    <label className="debt-note-live">Ghi chú<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú phiếu thu..."/></label>

    <div className="debt-collect-actions">
      <button className="button" type="button" onClick={()=>window.print()}>In phiếu dự kiến</button>
      <button className="button primary" type="button" onClick={submit} disabled={pending||balance<=0}>{pending?'Đang ghi nhận...':'Xác nhận thu '+money(amount)}</button>
    </div>
  </div>
}
