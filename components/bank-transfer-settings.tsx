'use client'

import { useMemo,useState,useTransition } from 'react'
import { saveBankTransferConfig,saveDocumentPrintConfig } from '@/lib/actions/sales'
import { buildTransferDescription,buildVietQRUrl,type BankTransferConfig } from '@/lib/vietqr'
import {
  DEFAULT_DEBT_PRINT_CONFIG,
  DEFAULT_SALE_PRINT_CONFIG,
  normalizeDocumentPrintConfig,
  type DocumentPrintConfig,
} from '@/lib/print-config'

type Tab='payment'|'templates'
type DocumentType='sale'|'debt'

function money(value:number){
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(value))+'đ'
}

export function BankTransferSettings({
  config,
  printConfigs,
  canEdit,
}:{
  config:BankTransferConfig|null
  printConfigs:DocumentPrintConfig[]
  canEdit:boolean
}){
  const [tab,setTab]=useState<Tab>('payment')
  const [documentType,setDocumentType]=useState<DocumentType>('sale')
  const [pending,startTransition]=useTransition()
  const [paymentMessage,setPaymentMessage]=useState('')
  const [templateMessage,setTemplateMessage]=useState('')
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
  const [saleTemplate,setSaleTemplate]=useState<DocumentPrintConfig>(()=>
    normalizeDocumentPrintConfig(
      printConfigs.find(x=>x.document_key==='SALE_INVOICE'),
      DEFAULT_SALE_PRINT_CONFIG,
    )
  )
  const [debtTemplate,setDebtTemplate]=useState<DocumentPrintConfig>(()=>
    normalizeDocumentPrintConfig(
      printConfigs.find(x=>x.document_key==='DEBT_RECEIPT'),
      DEFAULT_DEBT_PRINT_CONFIG,
    )
  )

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

  const template=documentType==='sale'?saleTemplate:debtTemplate

  function patchTemplate(patch:Partial<DocumentPrintConfig>){
    if(documentType==='sale')setSaleTemplate(v=>({...v,...patch}))
    else setDebtTemplate(v=>({...v,...patch}))
    setTemplateMessage('')
  }

  function submitPayment(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    setPaymentMessage('')
    const fd=new FormData(e.currentTarget)
    startTransition(async()=>{
      const result=await saveBankTransferConfig(fd)
      setPaymentMessage(result.ok?'Đã lưu cấu hình thanh toán.':result.error)
    })
  }

  function submitTemplate(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(!canEdit)return
    setTemplateMessage('')
    const current=documentType==='sale'?saleTemplate:debtTemplate
    const fd=new FormData()
    fd.set('document_key',current.document_key)
    fd.set('brand_name',current.brand_name)
    fd.set('title',current.title)
    fd.set('header_note',current.header_note??'')
    fd.set('paper_size',current.paper_size)
    fd.set('footer_text',current.footer_text??'')
    for(const key of [
      'show_customer_phone','show_warehouse','show_sku','show_variant',
      'show_qr','show_signature','show_invoice_details','is_active',
    ] as const){
      if(current[key])fd.set(key,'on')
    }

    startTransition(async()=>{
      const result=await saveDocumentPrintConfig(fd)
      if(!result.ok){
        setTemplateMessage(result.error)
        return
      }
      const next=normalizeDocumentPrintConfig(
        result.data,
        current.document_key==='SALE_INVOICE'?DEFAULT_SALE_PRINT_CONFIG:DEFAULT_DEBT_PRINT_CONFIG,
      )
      if(next.document_key==='SALE_INVOICE')setSaleTemplate(next)
      else setDebtTemplate(next)
      setTemplateMessage('Đã lưu mẫu và áp dụng cho chức năng in.')
    })
  }

  return <div className="bank-transfer-settings payment-settings-v12">
    <div className="destination-detail-tabs settings-subtabs-v6 payment-subtabs-v12">
      <button type="button" className={tab==='payment'?'active':''} onClick={()=>setTab('payment')}>
        Cấu hình thanh toán
      </button>
      <button type="button" className={tab==='templates'?'active':''} onClick={()=>setTab('templates')}>
        Mẫu hóa đơn / phiếu thu
      </button>
    </div>

    {tab==='payment'&&<div className="settings-subtab-body-v6 payment-body-v12">
      <div className="payment-workspace-v11">
        <form onSubmit={submitPayment} className="payment-form-panel-v11">
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
            {paymentMessage&&<span className={paymentMessage.startsWith('Đã lưu')?'success':'error'}>{paymentMessage}</span>}
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

    {tab==='templates'&&<div className="settings-subtab-body-v6 payment-body-v12 payment-template-body-v12">
      <div className="payment-document-switch-v11">
        <button type="button" className={documentType==='sale'?'active':''} onClick={()=>{setDocumentType('sale');setTemplateMessage('')}}>
          Hóa đơn bán hàng
        </button>
        <button type="button" className={documentType==='debt'?'active':''} onClick={()=>{setDocumentType('debt');setTemplateMessage('')}}>
          Phiếu thu công nợ
        </button>
        <span>Chỉnh bên trái · Preview cập nhật ngay bên phải</span>
      </div>

      <section className="payment-template-editor-v12">
        <form className="payment-template-form-v12" onSubmit={submitTemplate}>
          <div className="payment-template-form-head-v12">
            <div>
              <h3>{documentType==='sale'?'Cấu hình hóa đơn bán hàng':'Cấu hình phiếu thu công nợ'}</h3>
              <p>Thay đổi được lưu vào hệ thống và dùng cho chức năng in thực tế.</p>
            </div>
            <label className="payment-enable-v11">
              <input type="checkbox" checked={template.is_active} onChange={e=>patchTemplate({is_active:e.target.checked})} disabled={!canEdit}/>
              <span>{template.is_active?'Đang dùng':'Đang tắt'}</span>
            </label>
          </div>

          <div className="payment-template-form-scroll-v12">
            <div className="payment-template-fields-v12">
              <label>
                <span>Tên thương hiệu</span>
                <input value={template.brand_name} maxLength={80} onChange={e=>patchTemplate({brand_name:e.target.value})} disabled={!canEdit}/>
              </label>
              <label>
                <span>Tiêu đề chứng từ</span>
                <input value={template.title} maxLength={120} onChange={e=>patchTemplate({title:e.target.value})} disabled={!canEdit}/>
              </label>
              <label className="full">
                <span>Dòng phụ đầu phiếu</span>
                <input value={template.header_note??''} maxLength={200} onChange={e=>patchTemplate({header_note:e.target.value})} placeholder="Không bắt buộc" disabled={!canEdit}/>
              </label>
              <label>
                <span>Khổ giấy</span>
                <select value={template.paper_size} onChange={e=>patchTemplate({paper_size:e.target.value as DocumentPrintConfig['paper_size']})} disabled={!canEdit}>
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="RECEIPT_80">Máy in nhiệt 80mm</option>
                </select>
              </label>
              <label className="full">
                <span>Footer</span>
                <textarea value={template.footer_text??''} maxLength={300} onChange={e=>patchTemplate({footer_text:e.target.value})} disabled={!canEdit}/>
              </label>
            </div>

            <div className="payment-template-toggle-head-v12">
              <b>Trường hiển thị</b>
              <span>Bật/tắt trực tiếp trên bản in.</span>
            </div>

            <div className="payment-template-toggles-v12">
              <label><input type="checkbox" checked={template.show_customer_phone} onChange={e=>patchTemplate({show_customer_phone:e.target.checked})} disabled={!canEdit}/><span>SĐT khách hàng</span></label>
              <label><input type="checkbox" checked={template.show_warehouse} onChange={e=>patchTemplate({show_warehouse:e.target.checked})} disabled={!canEdit}/><span>Kho bán</span></label>
              <label><input type="checkbox" checked={template.show_sku} onChange={e=>patchTemplate({show_sku:e.target.checked})} disabled={!canEdit}/><span>Mã SKU</span></label>
              <label><input type="checkbox" checked={template.show_variant} onChange={e=>patchTemplate({show_variant:e.target.checked})} disabled={!canEdit}/><span>Phân loại SP</span></label>
              <label><input type="checkbox" checked={template.show_qr} onChange={e=>patchTemplate({show_qr:e.target.checked})} disabled={!canEdit}/><span>QR chuyển khoản</span></label>
              <label><input type="checkbox" checked={template.show_invoice_details} onChange={e=>patchTemplate({show_invoice_details:e.target.checked})} disabled={!canEdit}/><span>{documentType==='sale'?'Chi tiết sản phẩm':'Chi tiết phân bổ hóa đơn'}</span></label>
              {documentType==='debt'&&<label><input type="checkbox" checked={template.show_signature} onChange={e=>patchTemplate({show_signature:e.target.checked})} disabled={!canEdit}/><span>Khu vực ký xác nhận</span></label>}
            </div>
          </div>

          <div className="payment-template-actions-v12">
            {templateMessage&&<span className={templateMessage.startsWith('Đã lưu')?'success':'error'}>{templateMessage}</span>}
            <button
              className="button"
              type="button"
              disabled={!canEdit||pending}
              onClick={()=>{
                if(documentType==='sale')setSaleTemplate({...DEFAULT_SALE_PRINT_CONFIG})
                else setDebtTemplate({...DEFAULT_DEBT_PRINT_CONFIG})
                setTemplateMessage('Đã khôi phục mặc định trên màn hình. Bấm Lưu mẫu để áp dụng.')
              }}
            >Khôi phục mặc định</button>
            {canEdit&&<button className="button primary" type="submit" disabled={pending}>
              {pending?'Đang lưu...':'Lưu mẫu'}
            </button>}
          </div>
        </form>

        <div className="payment-document-preview-wrap-v11 payment-document-preview-wrap-v12">
          {documentType==='sale'
            ? <article className={'payment-document-preview-v11 sale paper-'+template.paper_size.toLowerCase().replace('_','-')}>
                <header>
                  <div>
                    <b>{template.brand_name||'MYNH ERP'}</b>
                    <span>{template.title||'PHIẾU BÁN HÀNG'}</span>
                    {template.header_note&&<small>{template.header_note}</small>}
                  </div>
                  <strong>ĐÃ THANH TOÁN</strong>
                </header>

                <div className="payment-doc-meta-v11">
                  <div><span>Mã phiếu</span><b>{saleCode}</b></div>
                  {template.show_warehouse&&<div><span>Kho bán</span><b>HN · 164 Hồng Mai</b></div>}
                  <div><span>Khách hàng</span><b>Nguyễn Văn A</b></div>
                  {template.show_customer_phone&&<div><span>SĐT</span><b>09•• ••• 888</b></div>}
                </div>

                {template.show_invoice_details&&<table>
                  <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                  <tbody>
                    <tr><td>1</td><td><b>Sản phẩm mẫu A</b>{(template.show_sku||template.show_variant)&&<small>{template.show_sku?'SKU-A001':''}{template.show_sku&&template.show_variant?' · ':''}{template.show_variant?'Đen':''}</small>}</td><td>1</td><td>{money(85000)}</td><td>{money(85000)}</td></tr>
                    <tr><td>2</td><td><b>Sản phẩm mẫu B</b>{(template.show_sku||template.show_variant)&&<small>{template.show_sku?'SKU-B002':''}{template.show_sku&&template.show_variant?' · ':''}{template.show_variant?'M':''}</small>}</td><td>2</td><td>{money(19000)}</td><td>{money(38000)}</td></tr>
                  </tbody>
                </table>}

                <div className="payment-doc-total-v11">
                  <div><span>Tiền hàng</span><b>{money(123000)}</b></div>
                  <div className="total"><span>TỔNG THANH TOÁN</span><b>{money(123000)}</b></div>
                  <div><span>Đã thu</span><b>{money(123000)}</b></div>
                </div>

                {template.show_qr&&preview&&<div className="payment-doc-qr-v11">
                  <div>
                    <b>THANH TOÁN CHUYỂN KHOẢN</b>
                    <span>{form.bank_name||'Ngân hàng'} · {form.account_no||'Số tài khoản'}</span>
                    <strong>{money(123000)}</strong>
                    <small>{buildTransferDescription(null,saleCode)}</small>
                  </div>
                  <img src={preview} alt="QR mẫu hóa đơn"/>
                </div>}

                {template.footer_text&&<footer>{template.footer_text}</footer>}
              </article>
            : <article className={'payment-document-preview-v11 debt paper-'+template.paper_size.toLowerCase().replace('_','-')}>
                <header>
                  <div>
                    <b>{template.brand_name||'MYNH ERP'}</b>
                    <span>{template.title||'PHIẾU THU CÔNG NỢ'}</span>
                    {template.header_note&&<small>{template.header_note}</small>}
                  </div>
                  <div><strong>PHIẾU THU</strong><small>{debtCode}</small></div>
                </header>

                <div className="payment-doc-meta-v11">
                  <div><span>Khách hàng</span><b>Công ty ABC</b></div>
                  {template.show_customer_phone&&<div><span>SĐT</span><b>09•• ••• 999</b></div>}
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

                {template.show_invoice_details&&<>
                  <div className="payment-doc-section-v11">Phân bổ hóa đơn</div>
                  <div className="payment-debt-invoice-v11">
                    <div><span><b>POS-261001-000088</b><small>01/10/2026 10:15{template.show_warehouse?' · HN':''}</small></span><strong>{money(500000)}</strong></div>
                    <small>Sản phẩm mẫu A{template.show_sku?' · SKU-A001':''}{template.show_variant?' · Đen':''} · 2 × {money(250000)}</small>
                  </div>
                </>}

                {template.show_qr&&debtPreview&&<div className="payment-doc-qr-v11">
                  <div>
                    <b>NỘI DUNG CHUYỂN KHOẢN</b>
                    <span>{form.bank_name||'Ngân hàng'} · {form.account_no||'Số tài khoản'}</span>
                    <strong>{buildTransferDescription(null,debtCode)}</strong>
                  </div>
                  <img src={debtPreview} alt="QR mẫu phiếu thu"/>
                </div>}

                {template.show_signature&&<div className="payment-doc-signatures-v11">
                  <div><b>Khách hàng</b><span>Ký / ghi rõ họ tên</span></div>
                  <div><b>Người thu</b><span>Ký / ghi rõ họ tên</span></div>
                </div>}

                {template.footer_text&&<footer>{template.footer_text}</footer>}
              </article>}
        </div>
      </section>
    </div>}
  </div>
}
