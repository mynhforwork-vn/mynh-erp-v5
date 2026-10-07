'use client'

import { useMemo,useState,useTransition } from 'react'
import { saveBankTransferConfig } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'

export function BankTransferSettings({
  config,
  canEdit,
}:{
  config:BankTransferConfig|null
  canEdit:boolean
}){
  const [pending,startTransition]=useTransition()
  const [message,setMessage]=useState('')
  const [form,setForm]=useState<BankTransferConfig>({
    config_key:'DEFAULT',
    bank_id:config?.bank_id??'',
    bank_name:config?.bank_name??'',
    account_no:config?.account_no??'',
    account_name:config?.account_name??'',
    qr_template:config?.qr_template??'compact2',
    transfer_prefix:config?.transfer_prefix??'MYNH',
    is_active:config?.is_active??true,
  })

  const preview=useMemo(()=>{
    if(!form.bank_id||!form.account_no)return ''
    const ref=buildTransferDescription(null,'POS-261001-000123')
    return buildVietQRUrl(form,123000,ref,'compact2')
  },[form])

  function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    setMessage('')
    const fd=new FormData(e.currentTarget)
    startTransition(async()=>{
      const result=await saveBankTransferConfig(fd)
      setMessage(result.ok?'Đã lưu cấu hình chuyển khoản.':result.error)
    })
  }

  return <div className="bank-transfer-settings payment-settings-v10">
    <div className="payment-workspace-v10">
      <form onSubmit={submit} className="payment-form-panel-v10">
        <div className="payment-panel-head-v10">
          <div>
            <h3>Tài khoản nhận tiền</h3>
            <p>Dùng chung cho POS, phiếu bán hàng và phiếu thu nợ.</p>
          </div>
          <label className="payment-enable-v10">
            <input
              type="checkbox"
              name="is_active"
              checked={Boolean(form.is_active)}
              onChange={e=>setForm(v=>({...v,is_active:e.target.checked}))}
              disabled={!canEdit}
            />
            <span>{form.is_active?'Đang bật':'Đang tắt'}</span>
          </label>
        </div>

        <div className="payment-form-grid-v10">
          <label>
            <span>Ngân hàng</span>
            <input
              name="bank_name"
              value={form.bank_name}
              onChange={e=>setForm(v=>({...v,bank_name:e.target.value}))}
              placeholder="VD: Vietcombank"
              disabled={!canEdit}
              required
            />
          </label>

          <label>
            <span>Bank ID / BIN</span>
            <input
              name="bank_id"
              value={form.bank_id}
              onChange={e=>setForm(v=>({...v,bank_id:e.target.value}))}
              placeholder="970436 hoặc VCB"
              disabled={!canEdit}
              required
            />
          </label>

          <label>
            <span>Số tài khoản</span>
            <input
              name="account_no"
              value={form.account_no}
              onChange={e=>setForm(v=>({...v,account_no:e.target.value}))}
              placeholder="Số tài khoản nhận tiền"
              disabled={!canEdit}
              required
            />
          </label>

          <label>
            <span>Tên tài khoản</span>
            <input
              name="account_name"
              value={form.account_name}
              onChange={e=>setForm(v=>({...v,account_name:e.target.value}))}
              placeholder="Tên chủ tài khoản"
              disabled={!canEdit}
              required
            />
          </label>
        </div>

        <div className="payment-rule-head-v10">
          <div>
            <b>Quy tắc tạo QR</b>
            <span>Số tiền lấy tự động theo hóa đơn; nội dung chuyển khoản tự ghép với mã chứng từ.</span>
          </div>
        </div>

        <div className="payment-form-grid-v10 payment-rule-grid-v10">
          <label>
            <span>Tiền tố nội dung CK</span>
            <input
              name="transfer_prefix"
              value={String(form.transfer_prefix??'MYNH')}
              onChange={e=>setForm(v=>({...v,transfer_prefix:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12)}))}
              placeholder="MYNH"
              disabled={!canEdit}
            />
            <small>Tối đa 12 ký tự.</small>
          </label>

          <label>
            <span>Mẫu QR</span>
            <select
              name="qr_template"
              value={String(form.qr_template??'compact2')}
              onChange={e=>setForm(v=>({...v,qr_template:e.target.value}))}
              disabled={!canEdit}
            >
              <option value="compact2">compact2 · đủ thông tin</option>
              <option value="compact">compact · gọn</option>
              <option value="qr_only">qr_only · chỉ QR</option>
              <option value="print">print · in</option>
            </select>
          </label>
        </div>

        <div className="payment-form-actions-v10">
          {message&&<span className={message.startsWith('Đã lưu')?'success':'error'}>{message}</span>}
          <span className="payment-auto-note-v10">POS tự gắn đúng số tiền và mã hóa đơn/phiếu thu.</span>
          {canEdit&&<button className="button primary" type="submit" disabled={pending}>
            {pending?'Đang lưu...':'Lưu cấu hình'}
          </button>}
        </div>
      </form>

      <aside className="payment-preview-panel-v10">
        <div className="payment-panel-head-v10">
          <div>
            <h3>Xem trước VietQR</h3>
            <p>Ví dụ giao dịch 123.000đ.</p>
          </div>
          <span className={'payment-state-v10 '+(form.is_active?'on':'')}>{form.is_active?'Sẵn sàng':'Đang tắt'}</span>
        </div>

        <div className="payment-preview-body-v10">
          {preview
            ? <img src={preview} alt="VietQR xem trước"/>
            : <div className="payment-preview-empty-v10">Nhập Bank ID và số tài khoản để xem QR.</div>}

          <div className="payment-preview-info-v10">
            <div><span>Ngân hàng</span><b>{form.bank_name||'—'}{form.bank_id?' · '+form.bank_id:''}</b></div>
            <div><span>Số tài khoản</span><b className="mono">{form.account_no||'—'}</b></div>
            <div><span>Tên tài khoản</span><b>{form.account_name||'—'}</b></div>
            <div><span>Nội dung CK</span><b className="mono">{buildTransferDescription(null,'POS-261001-000123')}</b></div>
          </div>
        </div>
      </aside>
    </div>
  </div>
}
