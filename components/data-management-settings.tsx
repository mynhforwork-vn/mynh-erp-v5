'use client'

import { useState,useTransition } from 'react'
import Link from 'next/link'
import { purgeEligibleArchivedOrders,resetERPSystemData } from '@/lib/actions/core'

type Tab='overview'|'archive'|'reset'

export function DataManagementSettings({
  activeOrders,
  archivedOrders,
  activeUsers,
  archivedUsers,
  canDelete,
  purged,
  protectedCount,
}:{
  activeOrders:number
  archivedOrders:number
  activeUsers:number
  archivedUsers:number
  canDelete:boolean
  purged?:number|null
  protectedCount?:number|null
}){
  const [tab,setTab]=useState<Tab>('overview')
  const [pending,startTransition]=useTransition()
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [resetScope,setResetScope]=useState<'DATA'|'ALL'|null>(null)
  const [confirm,setConfirm]=useState('')

  function runReset(){
    if(!resetScope)return
    const expected=resetScope==='ALL'?'RESET TOAN HE THONG':'RESET DU LIEU'
    if(confirm!==expected){setError('Chuỗi xác nhận chưa đúng.');return}
    setMessage('');setError('')
    startTransition(async()=>{
      const result=await resetERPSystemData({scope:resetScope,confirm})
      if(!result.ok){setError(result.error);return}
      setMessage(resetScope==='ALL'
        ? 'Đã xóa dữ liệu vận hành và toàn bộ cấu hình người dùng.'
        : 'Đã xóa dữ liệu vận hành. Cấu hình hệ thống được giữ lại.')
      setResetScope(null);setConfirm('')
      window.location.reload()
    })
  }

  return <div className="data-management-settings data-management-settings-v10">
    {message&&<div className="success-box compact">{message}</div>}
    {error&&<div className="error-box compact">{error}</div>}
    {purged!=null&&<div className="data-maintenance-result success">
      <b>Đã xóa vĩnh viễn {purged} đơn lưu trữ đủ điều kiện.</b>
      <span>{protectedCount??0} đơn được giữ lại vì đã phát sinh nhận hàng, đối soát hoặc chuyển kho.</span>
    </div>}

    <div className="destination-detail-tabs settings-subtabs-v6 data-subtabs-v10">
      <button type="button" className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>
        Tổng quan dữ liệu
      </button>
      <button type="button" className={tab==='archive'?'active':''} onClick={()=>setTab('archive')}>
        Lưu trữ & dọn dẹp <span>{archivedOrders+archivedUsers}</span>
      </button>
      {canDelete&&<button type="button" className={tab==='reset'?'active danger-tab':''} onClick={()=>setTab('reset')}>
        Reset hệ thống
      </button>}
    </div>

    {tab==='overview'&&<div className="settings-subtab-body-v6 data-body-v10">
      <section className="data-full-panel-v10">
        <div className="data-panel-head-v10">
          <div>
            <h3>Dữ liệu hệ thống</h3>
            <p>Tổng quan dữ liệu đang vận hành và dữ liệu đã lưu trữ.</p>
          </div>
          <span>{activeOrders+activeUsers} bản ghi đang dùng</span>
        </div>

        <div className="data-overview-table-v10">
          <div className="data-overview-head-v10">
            <span>Nhóm dữ liệu</span>
            <span>Đang dùng</span>
            <span>Lưu trữ</span>
            <span>Chính sách</span>
            <span>Thao tác</span>
          </div>

          <div className="data-overview-row-v10">
            <div className="data-kind-v10">
              <span className="data-kind-code-v10">OD</span>
              <div><b>Đơn hàng</b><small>Đơn nhập và dữ liệu liên quan.</small></div>
            </div>
            <b>{activeOrders}</b>
            <b>{archivedOrders}</b>
            <span>Có thể lưu trữ/khôi phục; chỉ xóa vĩnh viễn khi đủ điều kiện.</span>
            <Link className="button small" href="/purchase/orders?range=all&archive=archived">Mở lưu trữ</Link>
          </div>

          <div className="data-overview-row-v10">
            <div className="data-kind-v10">
              <span className="data-kind-code-v10">US</span>
              <div><b>User Shopee</b><small>Tài khoản mua hàng và lịch sử liên quan.</small></div>
            </div>
            <b>{activeUsers}</b>
            <b>{archivedUsers}</b>
            <span>Lưu trữ/khôi phục để bảo toàn liên kết với lịch sử đơn hàng.</span>
            <Link className="button small" href="/purchase/accounts?archive=archived">Mở lưu trữ</Link>
          </div>
        </div>
      </section>
    </div>}

    {tab==='archive'&&<div className="settings-subtab-body-v6 data-body-v10">
      <section className="data-full-panel-v10">
        <div className="data-panel-head-v10">
          <div>
            <h3>Lưu trữ & dọn dẹp</h3>
            <p>Dọn dữ liệu đã lưu trữ mà không ảnh hưởng các bản ghi đã phát sinh nghiệp vụ cần bảo vệ.</p>
          </div>
          <span>{archivedOrders} đơn lưu trữ</span>
        </div>

        <div className="data-cleanup-grid-v10">
          <div className="data-cleanup-item-v10">
            <div>
              <b>Đơn hàng đã lưu trữ</b>
              <span>Mỗi lần xử lý tối đa 200 đơn đủ điều kiện. Đơn đã nhận hàng, đối soát hoặc chuyển kho sẽ được giữ lại.</span>
            </div>
            <Link className="button" href="/purchase/orders?range=all&archive=archived">Xem danh sách</Link>
          </div>

          <div className="data-cleanup-item-v10">
            <div>
              <b>User Shopee đã lưu trữ</b>
              <span>Không xóa tự động để giữ toàn vẹn liên kết lịch sử đơn hàng.</span>
            </div>
            <Link className="button" href="/purchase/accounts?archive=archived">Xem danh sách</Link>
          </div>

          <div className="data-cleanup-item-v10 danger">
            <div>
              <b>Xóa vĩnh viễn đơn đủ điều kiện</b>
              <span>Không thể hoàn tác. Chỉ áp dụng cho đơn đang ở trạng thái lưu trữ.</span>
            </div>
            {canDelete
              ? <details className="data-danger-confirm data-danger-confirm-v10">
                  <summary className="button danger" aria-disabled={archivedOrders===0}>Xóa dữ liệu lưu trữ</summary>
                  <form action={purgeEligibleArchivedOrders}>
                    <p>Nhập đúng chuỗi xác nhận để tiếp tục.</p>
                    <label>
                      Nhập <b>XOA DON LUU TRU</b>
                      <input name="confirm_text" autoComplete="off" placeholder="XOA DON LUU TRU" required/>
                    </label>
                    <button className="button danger" type="submit" disabled={archivedOrders===0}>Xóa vĩnh viễn</button>
                  </form>
                </details>
              : <span className="data-admin-only">Chỉ Admin được xóa vĩnh viễn dữ liệu.</span>}
          </div>
        </div>
      </section>
    </div>}

    {tab==='reset'&&canDelete&&<div className="settings-subtab-body-v6 data-body-v10">
      <section className="data-full-panel-v10 data-reset-panel-v10">
        <div className="data-panel-head-v10">
          <div>
            <h3>Reset dữ liệu hệ thống</h3>
            <p>Đây là khu vực nguy hiểm. Hai phạm vi reset được tách rõ để tránh xóa nhầm cấu hình.</p>
          </div>
          <span className="danger">Admin only</span>
        </div>

        <div className="data-reset-options-v10">
          <button type="button" className="data-reset-option-v10" onClick={()=>{setResetScope('DATA');setConfirm('');setError('')}}>
            <div>
              <b>Xóa dữ liệu vận hành</b>
              <span>Xóa User Shopee, đơn hàng, tồn phát sinh, bán hàng, khách hàng, công nợ, tài chính và lịch sử vận hành.</span>
            </div>
            <small>Giữ cấu hình ngân hàng, HUB, ĐVVC và danh mục sản phẩm.</small>
          </button>

          <button type="button" className="data-reset-option-v10 danger" onClick={()=>{setResetScope('ALL');setConfirm('');setError('')}}>
            <div>
              <b>Xóa toàn bộ dữ liệu + cài đặt</b>
              <span>Xóa cả dữ liệu vận hành và cấu hình người dùng: QR/ngân hàng, HUB/Shipper, ĐVVC, sản phẩm, phân loại.</span>
            </div>
            <small>Giữ tài khoản đăng nhập, schema, 2 kho nền tảng và danh mục tài chính hệ thống.</small>
          </button>
        </div>
      </section>
    </div>}

    {resetScope&&<div className="admin-reset-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setResetScope(null)}}>
      <div className="admin-reset-dialog" role="dialog" aria-modal="true">
        <div className="admin-reset-dialog-head">
          <div><h3>{resetScope==='ALL'?'Xóa toàn bộ dữ liệu + cài đặt':'Xóa dữ liệu vận hành'}</h3></div>
          <button type="button" onClick={()=>!pending&&setResetScope(null)} aria-label="Đóng">×</button>
        </div>
        <p>Hành động này không thể hoàn tác. Nhập chính xác chuỗi xác nhận bên dưới.</p>
        <label>
          Nhập <b>{resetScope==='ALL'?'RESET TOAN HE THONG':'RESET DU LIEU'}</b>
          <input value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off"/>
        </label>
        <div className="form-actions">
          <button className="button" type="button" onClick={()=>setResetScope(null)} disabled={pending}>Hủy</button>
          <button className="button danger" type="button" onClick={runReset} disabled={pending}>
            {pending?'Đang xóa...':'Xác nhận xóa'}
          </button>
        </div>
      </div>
    </div>}
  </div>
}
