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

  return <div className="bank-transfer-settings">
    <div className="carrier-settings-head">
      <div>
        <span className="module-eyebrow">THANH TOÁN</span>
        <h3>Chuyển khoản & VietQR</h3>
        <p>Cấu hình tài khoản nhận tiền dùng chung cho POS và phiếu bán hàng.</p>
      </div>
      <div className="carrier-settings-summary">
        <span><b>{form.is_active?'Bật':'Tắt'}</b> chuyển khoản</span>
        <span><b>Auto</b> số tiền theo hóa đơn</span>
      </div>
    </div>

    <div className="carrier-settings-note">
      <b>Số tiền không cấu hình cố định.</b>
      <span>POS tự lấy đúng số phải thu; QR sẽ thay đổi theo từng hóa đơn.</span>
    </div>

    <div className="bank-transfer-settings-grid">
      <form onSubmit={submit} className="bank-transfer-form">
        <label>
          <span>Bank ID / BIN</span>
          <input
            name="bank_id"
            value={form.bank_id}
            onChange={e=>setForm(v=>({...v,bank_id:e.target.value}))}
            placeholder="VD: 970436 hoặc VCB"
            disabled={!canEdit}
            required
          />
          <small>Dùng BIN hoặc mã ngân hàng VietQR.</small>
        </label>

        <label>
          <span>Tên ngân hàng</span>
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

        <label className="bank-transfer-toggle">
          <input
            type="checkbox"
            name="is_active"
            checked={Boolean(form.is_active)}
            onChange={e=>setForm(v=>({...v,is_active:e.target.checked}))}
            disabled={!canEdit}
          />
          <span>Bật thanh toán chuyển khoản tại POS</span>
        </label>

        <div className="bank-transfer-actions">
          {message&&<span className={message.startsWith('Đã lưu')?'success':'error'}>{message}</span>}
          {canEdit&&<button className="button primary" type="submit" disabled={pending}>
            {pending?'Đang lưu...':'Lưu cấu hình'}
          </button>}
        </div>
      </form>

      <div className="bank-transfer-preview">
        <div className="bank-transfer-preview-head">
          <span className="module-eyebrow">XEM TRƯỚC</span>
          <b>QR chuyển khoản</b>
          <small>Ví dụ 123.000đ</small>
        </div>
        {preview
          ? <img src={preview} alt="VietQR xem trước"/>
          : <div className="empty compact">Nhập Bank ID và số tài khoản để xem QR.</div>}
        <div className="bank-transfer-preview-meta">
          <div><span>Ngân hàng</span><b>{form.bank_name||'—'}</b></div>
          <div><span>Số tài khoản</span><b>{form.account_no||'—'}</b></div>
          <div><span>Tên tài khoản</span><b>{form.account_name||'—'}</b></div>
          <div><span>Số tiền</span><b>123.000đ</b></div>
          <div><span>Nội dung</span><b>{buildTransferDescription(null,'POS-261001-000123')}</b></div>
        </div>
      </div>
    </div>
  </div>
}
