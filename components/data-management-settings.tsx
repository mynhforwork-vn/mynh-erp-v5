'use client'

import Link from 'next/link'
import { purgeEligibleArchivedOrders } from '@/lib/actions/core'

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
  return <div className="data-management-settings data-management-settings-v8">
    <div className="settings-module-head-v8">
      <div>
        <h3>Dữ liệu hệ thống</h3>
        <p>Lưu trữ để đưa dữ liệu ra khỏi vận hành; xóa vĩnh viễn chỉ dùng cho dữ liệu đã lưu trữ đủ điều kiện.</p>
      </div>
      <div className="settings-module-summary-v8">
        <span><b>{activeOrders+activeUsers}</b> đang dùng</span>
        <span><b>{archivedOrders+archivedUsers}</b> lưu trữ</span>
      </div>
    </div>

    {purged!=null&&<div className="data-maintenance-result success">
      <b>Đã xóa vĩnh viễn {purged} đơn lưu trữ đủ điều kiện.</b>
      <span>{protectedCount??0} đơn được giữ lại vì đã phát sinh nhận hàng, đối soát hoặc chuyển kho.</span>
    </div>}

    <section className="settings-table-panel-v8">
      <div className="settings-table-title-v8">
        <div>
          <b>Phạm vi dữ liệu</b>
          <span>Quản lý vòng đời đơn hàng và User Shopee.</span>
        </div>
      </div>

      <div className="data-table-v8">
        <div className="data-table-head-v8">
          <span>Nhóm dữ liệu</span>
          <span>Đang dùng</span>
          <span>Lưu trữ</span>
          <span>Chính sách</span>
          <span>Thao tác</span>
        </div>

        <div className="data-table-row-v8">
          <div className="data-kind-v8">
            <span className="data-kind-code-v8">OD</span>
            <div><b>Đơn hàng</b><small>Đơn nhập và dữ liệu liên quan.</small></div>
          </div>
          <b>{activeOrders}</b>
          <b>{archivedOrders}</b>
          <span className="data-policy-v8">Có thể lưu trữ/khôi phục; xóa vĩnh viễn chỉ khi đủ điều kiện.</span>
          <Link className="button small" href="/purchase/orders?range=all&archive=archived">Mở lưu trữ</Link>
        </div>

        <div className="data-table-row-v8">
          <div className="data-kind-v8">
            <span className="data-kind-code-v8">US</span>
            <div><b>User Shopee</b><small>Tài khoản mua hàng và lịch sử liên quan.</small></div>
          </div>
          <b>{activeUsers}</b>
          <b>{archivedUsers}</b>
          <span className="data-policy-v8">Chỉ lưu trữ/khôi phục để bảo toàn liên kết lịch sử đơn hàng.</span>
          <Link className="button small" href="/purchase/accounts?archive=archived">Mở lưu trữ</Link>
        </div>
      </div>
    </section>

    <section className="settings-danger-panel-v8">
      <div className="settings-danger-copy-v8">
        <b>Dọn đơn đã lưu trữ</b>
        <span>Mỗi lần tối đa 200 đơn đủ điều kiện. Đơn đã nhận hàng, đối soát hoặc chuyển kho sẽ được bảo vệ.</span>
      </div>

      {canDelete
        ? <details className="data-danger-confirm data-danger-confirm-v8">
            <summary className="button danger" aria-disabled={archivedOrders===0}>Xóa dữ liệu lưu trữ</summary>
            <form action={purgeEligibleArchivedOrders}>
              <p>Hành động này không thể hoàn tác.</p>
              <label>
                Nhập <b>XOA DON LUU TRU</b> để xác nhận
                <input name="confirm_text" autoComplete="off" placeholder="XOA DON LUU TRU" required/>
              </label>
              <button className="button danger" type="submit" disabled={archivedOrders===0}>
                Xóa vĩnh viễn đơn đủ điều kiện
              </button>
            </form>
          </details>
        : <span className="data-admin-only">Chỉ Admin được xóa vĩnh viễn dữ liệu.</span>}
    </section>

    <div className="settings-inline-note settings-inline-note-v8">
      <b>Reset toàn hệ thống được tách riêng.</b>
      <span>{canDelete?'Admin có thể mở tab Tài khoản & quyền để reset dữ liệu vận hành hoặc toàn bộ cấu hình với xác nhận nhiều bước.':'Chỉ Admin được truy cập chức năng reset toàn hệ thống.'}</span>
      {canDelete&&<Link className="button small danger" href="/settings?section=access">Mở khu vực Admin</Link>}
    </div>
  </div>
}
