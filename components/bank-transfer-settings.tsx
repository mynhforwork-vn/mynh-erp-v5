'use client'

import { useMemo,useState,useTransition } from 'react'
import { saveBankTransferConfig } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'

type Tab='payment'|'templates'
type DocumentType='sale'|'debt'

function money(value:number){
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(value))+'đ'
}

export function BankTransferSettings({
  config,
  canEdit,
}:{
  config:BankTransferConfig|null
  canEdit:boolean
}){
  const [tab,setTab]=useState<Tab>('payment')
  const [documentType,setDocumentType]=useState<DocumentType>('sale')
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

  const saleCode='POS-261007-000123'
  const debtCode='PT-261007-000045'
  const preview=useMemo(()=>{
    if(!form.bank_id||!form.account_no)return ''
    const ref=buildTransferDescription(null,saleCode)
    return buildVietQRUrl(form,123000,ref,'compact2')
  },[form])

  const debtPreview=useMemo(()=>{
    if(!form.bank_id||!form.account_no)return ''
    const ref=buildTransferDescription(null,debtCode)
    return buildVietQRUrl(form,500000,ref,'compact2')
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

  return <div className="bank-transfer-settings payment-settings-v11">
    <div className="destination-detail-tabs settings-subtabs-v6 payment-subtabs-v11">
      <button type="button" className={tab==='payment'?'active':''} onClick={()=>setTab('payment')}>
        Cấu hình thanh toán
      </button>
      <button type="button" className={tab==='templates'?'active':''} onClick={()=>setTab('templates')}>
        Mẫu hóa đơn / phiếu thu
      </button>
    </div>

    {tab==='payment'&&<div className="settings-subtab-body-v6 payment-body-v11">
      <div className="payment-workspace-v11">
        <form onSubmit={submit} className="payment-form-panel-v11">
          <div className="payment-panel-head-v11">
            <div>
              <h3>Thông tin chuyển khoản</h3>
              <p>Dùng chung cho POS, hóa đơn bán hàng và phiếu thu công nợ.</p>
            </div>
            <label className="payment-enable-v11">
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

          <div className="payment-form-grid-v11">
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

          <div className="payment-section-head-v11">
            <div>
              <b>Quy tắc QR & nội dung chuyển khoản</b>
              <span>Số tiền lấy tự động từ chứng từ; nội dung CK ghép theo mã hóa đơn/phiếu thu.</span>
            </div>
          </div>

          <div className="payment-form-grid-v11 payment-rule-grid-v11">
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

          <div className="payment-form-actions-v11">
            {message&&<span className={message.startsWith('Đã lưu')?'success':'error'}>{message}</span>}
            <span>POS tự gắn đúng số tiền và mã hóa đơn/phiếu thu.</span>
            {canEdit&&<button className="button primary" type="submit" disabled={pending}>
              {pending?'Đang lưu...':'Lưu cấu hình'}
            </button>}
          </div>
        </form>

        <aside className="payment-preview-panel-v11">
          <div className="payment-panel-head-v11">
            <div>
              <h3>QR thanh toán</h3>
              <p>Xem trước với giao dịch mẫu 123.000đ.</p>
            </div>
            <span className={'payment-state-v11 '+(form.is_active?'on':'')}>{form.is_active?'Sẵn sàng':'Đang tắt'}</span>
          </div>

          <div className="payment-preview-body-v11">
            {preview
              ? <img src={preview} alt="VietQR xem trước"/>
              : <div className="payment-preview-empty-v11">Nhập Bank ID và số tài khoản để xem QR.</div>}

            <div className="payment-preview-info-v11">
              <div><span>Ngân hàng</span><b>{form.bank_name||'—'}{form.bank_id?' · '+form.bank_id:''}</b></div>
              <div><span>Số tài khoản</span><b className="mono">{form.account_no||'—'}</b></div>
              <div><span>Tên tài khoản</span><b>{form.account_name||'—'}</b></div>
              <div><span>Nội dung CK</span><b className="mono">{buildTransferDescription(null,saleCode)}</b></div>
            </div>
          </div>
        </aside>
      </div>
    </div>}

    {tab==='templates'&&<div className="settings-subtab-body-v6 payment-body-v11 payment-template-body-v11">
      <div className="payment-document-switch-v11">
        <button type="button" className={documentType==='sale'?'active':''} onClick={()=>setDocumentType('sale')}>
          Hóa đơn bán hàng
        </button>
        <button type="button" className={documentType==='debt'?'active':''} onClick={()=>setDocumentType('debt')}>
          Phiếu thu công nợ
        </button>
        <span>Mẫu đang dùng trong POS / Thu nợ</span>
      </div>

      <section className="payment-template-workspace-v11">
        <div className="payment-template-info-v11">
          <div>
            <h3>{documentType==='sale'?'Hóa đơn bán hàng':'Phiếu thu công nợ'}</h3>
            <p>{documentType==='sale'
              ? 'Mẫu in từ POS trước hoặc sau thanh toán, có thể kèm QR chuyển khoản.'
              : 'Mẫu in trước khi thu hoặc in lại sau khi đã ghi nhận giao dịch công nợ.'}</p>
          </div>

          <div className="payment-template-spec-v11">
            <div><span>Khổ in</span><b>A4 / Print browser</b></div>
            <div><span>Nguồn dữ liệu</span><b>{documentType==='sale'?'POS / Lịch sử bán':'Công nợ / Thu nợ'}</b></div>
            <div><span>QR</span><b>{form.is_active?'Dùng cấu hình thanh toán':'Đang tắt'}</b></div>
            <div><span>Trạng thái</span><b>Đang sử dụng</b></div>
          </div>

          <div className="payment-template-note-v11">
            <b>Ghi chú</b>
            <span>Tab này phản ánh đúng mẫu in hiện đang dùng trong hệ thống. Khi cần tùy chỉnh thêm logo, footer, trường hiển thị hoặc khổ giấy, cấu hình sẽ được mở rộng tại đây.</span>
          </div>
        </div>

        <div className="payment-document-preview-wrap-v11">
          {documentType==='sale'
            ? <article className="payment-document-preview-v11 sale">
                <header>
                  <div><b>MYNH ERP</b><span>PHIẾU BÁN HÀNG</span></div>
                  <strong>ĐÃ THANH TOÁN</strong>
                </header>

                <div className="payment-doc-meta-v11">
                  <div><span>Mã phiếu</span><b>{saleCode}</b></div>
                  <div><span>Kho bán</span><b>HN · 164 Hồng Mai</b></div>
                  <div><span>Khách hàng</span><b>Nguyễn Văn A</b></div>
                  <div><span>SĐT</span><b>09•• ••• 888</b></div>
                </div>

                <table>
                  <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                  <tbody>
                    <tr><td>1</td><td><b>Sản phẩm mẫu A</b><small>SKU-A001 · Đen</small></td><td>1</td><td>{money(85000)}</td><td>{money(85000)}</td></tr>
                    <tr><td>2</td><td><b>Sản phẩm mẫu B</b><small>SKU-B002 · M</small></td><td>2</td><td>{money(19000)}</td><td>{money(38000)}</td></tr>
                  </tbody>
                </table>

                <div className="payment-doc-total-v11">
                  <div><span>Tiền hàng</span><b>{money(123000)}</b></div>
                  <div className="total"><span>TỔNG THANH TOÁN</span><b>{money(123000)}</b></div>
                  <div><span>Đã thu</span><b>{money(123000)}</b></div>
                </div>

                {preview&&<div className="payment-doc-qr-v11">
                  <div>
                    <b>THANH TOÁN CHUYỂN KHOẢN</b>
                    <span>{form.bank_name||'Ngân hàng'} · {form.account_no||'Số tài khoản'}</span>
                    <strong>{money(123000)}</strong>
                    <small>{buildTransferDescription(null,saleCode)}</small>
                  </div>
                  <img src={preview} alt="QR mẫu hóa đơn"/>
                </div>}

                <footer>Cảm ơn quý khách!</footer>
              </article>
            : <article className="payment-document-preview-v11 debt">
                <header>
                  <div><b>MYNH ERP</b><span>Phiếu thu công nợ khách hàng</span></div>
                  <div><strong>PHIẾU THU</strong><small>{debtCode}</small></div>
                </header>

                <div className="payment-doc-meta-v11">
                  <div><span>Khách hàng</span><b>Công ty ABC</b></div>
                  <div><span>SĐT</span><b>09•• ••• 999</b></div>
                  <div><span>Thời gian</span><b>07/10/2026 13:50</b></div>
                  <div><span>Phương thức</span><b>Chuyển khoản</b></div>
                </div>

                <div className="payment-debt-amount-v11">
                  <span>SỐ TIỀN THU</span>
                  <strong>{money(500000)}</strong>
                </div>

                <div className="payment-debt-summary-v11">
                  <div><span>Công nợ trước thu</span><b>{money(1250000)}</b></div>
                  <div><span>Công nợ còn lại</span><b>{money(750000)}</b></div>
                </div>

                <div className="payment-doc-section-v11">Phân bổ hóa đơn</div>
                <div className="payment-debt-invoice-v11">
                  <div><span><b>POS-261001-000088</b><small>01/10/2026 10:15 · HN</small></span><strong>{money(500000)}</strong></div>
                  <small>Sản phẩm mẫu A · SKU-A001 · 2 × {money(250000)}</small>
                </div>

                {debtPreview&&<div className="payment-doc-qr-v11">
                  <div>
                    <b>NỘI DUNG CHUYỂN KHOẢN</b>
                    <span>{form.bank_name||'Ngân hàng'} · {form.account_no||'Số tài khoản'}</span>
                    <strong>{buildTransferDescription(null,debtCode)}</strong>
                  </div>
                  <img src={debtPreview} alt="QR mẫu phiếu thu"/>
                </div>}

                <div className="payment-doc-signatures-v11">
                  <div><b>Khách hàng</b><span>Ký / ghi rõ họ tên</span></div>
                  <div><b>Người thu</b><span>Ký / ghi rõ họ tên</span></div>
                </div>

                <footer>Phiếu được phát hành sau khi giao dịch đã ghi nhận trên MYNH ERP.</footer>
              </article>}
        </div>
      </section>
    </div>}
  </div>
}
