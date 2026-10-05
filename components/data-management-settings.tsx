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
  return <div className="data-management-settings">
    <div className="data-management-head">
      <div>
        <span className="module-eyebrow">DỮ LIỆU HỆ THỐNG</span>
        <h3>Quản lý dữ liệu</h3>
        <p>Lưu trữ để đưa dữ liệu ra khỏi vận hành. Xóa vĩnh viễn chỉ dùng để dọn dữ liệu đã lưu trữ.</p>
      </div>
      <div className="data-management-summary">
        <span><b>{activeOrders}</b> đơn đang dùng</span>
        <span><b>{archivedOrders}</b> đơn lưu trữ</span>
      </div>
    </div>

    {purged!=null&&<div className="data-maintenance-result success">
      <b>Đã xóa vĩnh viễn {purged} đơn lưu trữ đủ điều kiện.</b>
      <span>{protectedCount??0} đơn được giữ lại vì đã phát sinh nhận hàng, đối soát hoặc chuyển kho.</span>
    </div>}

    <div className="data-management-grid">
      <section className="data-management-card">
        <div className="data-management-card-head">
          <div>
            <span className="data-management-icon">OD</span>
            <div>
              <h4>Dữ liệu đơn hàng</h4>
              <p>Quản lý vòng đời dữ liệu đơn nhập.</p>
            </div>
          </div>
          <Link className="button small" href="/purchase/orders?range=all&archive=archived">Mở đơn lưu trữ</Link>
        </div>

        <div className="data-management-stats">
          <div><span>Đang dùng</span><b>{activeOrders}</b></div>
          <div><span>Đã lưu trữ</span><b>{archivedOrders}</b></div>
        </div>

        <div className="data-management-rule">
          <b>Lưu trữ ≠ Xóa</b>
          <span>Đơn lưu trữ vẫn giữ toàn bộ dữ liệu và có thể khôi phục. Xóa vĩnh viễn loại bản ghi khỏi hệ thống.</span>
        </div>

        <div className="data-danger-section">
          <div>
            <b>Dọn đơn đã lưu trữ</b>
            <span>Chỉ Admin. Mỗi lần dọn tối đa 200 đơn đủ điều kiện; các đơn đã có nhận hàng, đối soát hoặc chuyển kho được giữ lại.</span>
          </div>

          {canDelete
            ? <details className="data-danger-confirm">
                <summary className="button danger" aria-disabled={archivedOrders===0}>Xóa dữ liệu lưu trữ</summary>
                <form action={purgeEligibleArchivedOrders}>
                  <p>
                    Hành động này xóa vĩnh viễn tối đa 200 đơn lưu trữ đủ điều kiện mỗi lần và không thể hoàn tác.
                    Đơn có ràng buộc nghiệp vụ sẽ được giữ lại.
                  </p>
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
        </div>
      </section>

      <section className="data-management-card">
        <div className="data-management-card-head">
          <div>
            <span className="data-management-icon user">US</span>
            <div>
              <h4>Dữ liệu User</h4>
              <p>User hiện chỉ hỗ trợ Lưu trữ / Khôi phục.</p>
            </div>
          </div>
          <Link className="button small" href="/purchase/accounts?archive=archived">Mở User lưu trữ</Link>
        </div>

        <div className="data-management-stats">
          <div><span>Đang dùng</span><b>{activeUsers}</b></div>
          <div><span>Đã lưu trữ</span><b>{archivedUsers}</b></div>
        </div>

        <div className="data-management-rule safe">
          <b>Không xóa User từ Cài đặt hệ thống</b>
          <span>User có thể đang liên kết với lịch sử đơn hàng. Vì vậy hệ thống chỉ cho Lưu trữ và Khôi phục để giữ tính toàn vẹn dữ liệu.</span>
        </div>
      </section>
    </div>

    <div className="data-management-footnote">
      <b>Reset toàn hệ thống được tách khỏi thao tác lưu trữ/xóa đơn.</b>
      <span>{canDelete?'Admin có thể mở tab Phân quyền & tài khoản để reset dữ liệu vận hành hoặc toàn bộ cấu hình với xác nhận nhiều bước.':'Chỉ Admin được truy cập chức năng reset toàn hệ thống.'}</span>
      {canDelete&&<Link className="button small danger" href="/settings?section=access">Mở khu vực Admin</Link>}
    </div>
  </div>
}
