import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatPhone, statusLabel } from '@/lib/format'
import { createERPUser } from '@/lib/actions/core'
import Link from 'next/link'

export default async function UsersPage({searchParams}:{searchParams:Promise<{mode?:string}>}){
  const sp=await searchParams
  const {supabase}=await requireUser()
  const {data,error}=await supabase.from('erp_users').select('id,username,phone,email,status,note,created_at,updated_at').order('created_at',{ascending:false}).limit(100)

  return <>
    <header className="page-head">
      <div>
        <h1>Quản lý tài khoản Shopee</h1>
        <p>Danh sách tài khoản Shopee của MYNH ERP</p>
      </div>
      <div className="head-actions">
        <button className="button" disabled>Nhập hàng loạt</button>
        <Link className="button primary" href="/users?mode=create">+ Thêm tài khoản</Link>
      </div>
    </header>

    <div className={`split-view ${sp.mode==='create'?'with-panel':''}`}>
      <section>
        <div className="toolbar">
          <input className="search" placeholder="Tìm tên đăng nhập / số điện thoại / thư điện tử" disabled/>
          <span className="toolbar-note">{data?.length??0} bản ghi đang hiển thị</span>
        </div>
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tên đăng nhập</th>
                <th>Số điện thoại</th>
                <th>Thư điện tử</th>
                <th>Trạng thái</th>
                <th>Thời gian tạo</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {error
                ? <tr><td colSpan={7} className="error-text">Không thể tải dữ liệu tài khoản.</td></tr>
                : !data?.length
                  ? <tr><td colSpan={7} className="empty">Chưa có tài khoản Shopee trong hệ thống.</td></tr>
                  : data.map((u,i)=><tr key={u.id}>
                      <td>{i+1}</td>
                      <td className="strong">{u.username}</td>
                      <td>{formatPhone(u.phone)}</td>
                      <td>{u.email??'—'}</td>
                      <td><span className={`status-pill ${String(u.status).toLowerCase()==='active'?'green':''}`}>{statusLabel(u.status)}</span></td>
                      <td>{formatDateTime(u.created_at)}</td>
                      <td className="truncate">{u.note??'—'}</td>
                    </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {sp.mode==='create'&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">TÀI KHOẢN SHOPEE</span><h2>Thêm tài khoản</h2></div>
            <Link className="close" href="/users">×</Link>
          </div>
          <form action={createERPUser} className="panel-form panel-scroll">
            <label>Tên đăng nhập<input name="username" required/></label>
            <div className="form-grid">
              <label>Số điện thoại<input name="phone"/></label>
              <label>Thư điện tử<input name="email" type="email"/></label>
            </div>
            <label>Trạng thái
              <select name="status" defaultValue="Active">
                <option value="Active">Hoạt động</option>
                <option value="Blocked">Đã khóa</option>
                <option value="Không xác định">Không xác định</option>
              </select>
            </label>
            <label>Ghi chú<textarea name="note" rows={4}/></label>
            <div className="form-actions">
              <Link className="button" href="/users">Hủy</Link>
              <button className="button primary">Tạo tài khoản</button>
            </div>
          </form>
        </aside>
      }
    </div>
  </>
}
