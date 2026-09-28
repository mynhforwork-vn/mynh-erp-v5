import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { createERPUser, updateERPUser } from '@/lib/actions/core'
import Link from 'next/link'

type SP={mode?:string,user?:string,tab?:string}

function statusClass(status?:string|null){
  if(status==='Active') return 'green'
  if(status==='Blocked') return 'red'
  if(['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(String(status))) return 'orange'
  return ''
}

function DeviceSet({row}:{row:any}){
  const st=Boolean(row.spc_st_secret_id||row.spc_st_encrypted)
  const sf=Boolean(row.spc_f_secret_id||row.spc_f_encrypted)
  return <div className="device-set" aria-label="Thiết bị và phiên">
    <span className={st?'on':''} title="SPC_ST">ST</span>
    <span className={sf?'on':''} title="SPC_F">F</span>
    <span className={row.mobile?'on':''} title="Mobile">M</span>
    <span className={row.web?'on':''} title="Web">W</span>
  </div>
}

const actionLabels:Record<string,string>={
  CREATE:'Tạo tài khoản',
  UPDATE_USERNAME:'Đổi Username',
  UPDATE_PHONE:'Đổi số điện thoại',
  UPDATE_EMAIL:'Đổi email',
  UPDATE_STATUS:'Đổi trạng thái',
  UPDATE_PASSWORD:'Đổi mật khẩu',
  UPDATE_SPC_ST:'Cập nhật SPC_ST',
  UPDATE_SPC_F:'Cập nhật SPC_F',
}

export default async function UsersPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()
  const fields='id,username,phone,email,status,note,created_at,updated_at,mobile,web,voucher_summary,order_count,created_at_source,password_secret_id,spc_st_secret_id,spc_f_secret_id,password_encrypted,spc_st_encrypted,spc_f_encrypted'
  const {data,error}=await supabase.from('erp_users').select(fields).order('created_at',{ascending:false}).limit(100)
  const rows=(data??[]) as any[]
  const selected=sp.user?rows.find((x:any)=>x.id===sp.user)??null:null
  let history:any[]=[]
  if(selected){
    const h=await supabase.from('audit_logs').select('id,action,old_value,new_value,source,created_at').eq('module','USERS').eq('entity_id',selected.id).order('created_at',{ascending:false}).limit(100)
    history=(h.data??[]) as any[]
  }
  const panelOpen=sp.mode==='create'||Boolean(selected)
  const isEdit=Boolean(selected&&sp.mode==='edit')

  return <>
    <header className="page-head">
      <div>
        <h1>Quản lý tài khoản Shopee</h1>
        <p>Quản lý phiên, thiết bị, trạng thái và lịch sử thay đổi tài khoản Shopee</p>
      </div>
      <div className="head-actions">
        <button className="button" disabled>Nhập hàng loạt</button>
        <Link className="button primary" href="/users?mode=create">+ Thêm tài khoản</Link>
      </div>
    </header>

    <div className={`split-view ${panelOpen?'with-panel':''}`}>
      <section>
        <div className="toolbar">
          <input className="search" placeholder="Tìm Username / SĐT / Email" disabled/>
          <span className="toolbar-note">{rows.length} tài khoản</span>
        </div>
        <div className="card table-card">
          <table className="table user-table">
            <thead><tr>
              <th>#</th>
              <th>Username</th>
              <th>SĐT</th>
              <th>Email</th>
              <th>Trạng thái</th>
              <th>Thiết bị</th>
              <th>Voucher</th>
              <th>Số đơn</th>
              <th>Thời gian tạo</th>
              <th>Ghi chú</th>
            </tr></thead>
            <tbody>
              {error
                ? <tr><td colSpan={10} className="error-text">Không thể tải dữ liệu tài khoản.</td></tr>
                : !rows.length
                  ? <tr><td colSpan={10} className="empty">Chưa có tài khoản Shopee trong hệ thống.</td></tr>
                  : rows.map((u:any,i:number)=><tr key={u.id} className={selected?.id===u.id?'selected-row':''}>
                      <td>{i+1}</td>
                      <td><Link className="table-link" href={`/users?user=${u.id}`}>{u.username}</Link></td>
                      <td>{formatPhone(u.phone)}</td>
                      <td>{u.email??'—'}</td>
                      <td><span className={`status-pill ${statusClass(u.status)}`}>{statusLabel(u.status)}</span></td>
                      <td><DeviceSet row={u}/></td>
                      <td className="truncate voucher-cell">{u.voucher_summary??'—'}</td>
                      <td className="count-cell">{u.order_count??0}</td>
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
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Username<input name="username" required/></label>
              <div className="form-grid">
                <label>Số điện thoại<input name="phone"/></label>
                <label>Email<input name="email" type="email"/></label>
              </div>
              <label>Trạng thái
                <select name="status" defaultValue="Active">
                  {['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </label>
            </section>

            <section className="form-section">
              <h3>Đăng nhập & phiên</h3>
              <label>Mật khẩu<input name="password" type="password" autoComplete="new-password" placeholder="Được lưu trong Supabase Vault"/></label>
              <label>SPC_ST<textarea name="spc_st" rows={3} placeholder="Không bắt buộc"/></label>
              <label>SPC_F<textarea name="spc_f" rows={3} placeholder="Không bắt buộc"/></label>
            </section>

            <section className="form-section">
              <h3>Thiết bị & voucher</h3>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" name="mobile"/> Mobile</label>
                <label className="check-row"><input type="checkbox" name="web"/> Web</label>
              </div>
              <label>Voucher<input name="voucher_summary" placeholder="Ví dụ: Freeship · Giảm giá"/></label>
              <label>Ghi chú<textarea name="note" rows={3}/></label>
            </section>

            <div className="form-actions">
              <Link className="button" href="/users">Hủy</Link>
              <button className="button primary">Tạo tài khoản</button>
            </div>
          </form>
        </aside>
      }

      {selected&&!isEdit&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">CHI TIẾT USER</span><h2>{selected.username}</h2></div>
            <Link className="close" href="/users">×</Link>
          </div>
          <div className="panel-tabs">
            <Link className={!sp.tab||sp.tab==='info'?'active':''} href={`/users?user=${selected.id}&tab=info`}>Thông tin</Link>
            <Link className={sp.tab==='history'?'active':''} href={`/users?user=${selected.id}&tab=history`}>Lịch sử</Link>
          </div>
          <div className="panel-scroll">
            {(!sp.tab||sp.tab==='info')&&<>
              <div className="detail-grid">
                <div><span>Username</span><b>{selected.username}</b></div>
                <div><span>Trạng thái</span><b>{statusLabel(selected.status)}</b></div>
                <div><span>Số điện thoại</span><b>{formatPhone(selected.phone)}</b></div>
                <div><span>Email</span><b>{selected.email??'—'}</b></div>
                <div className="full"><span>Thiết bị / phiên</span><DeviceSet row={selected}/></div>
                <div><span>Mật khẩu</span><b>{selected.password_secret_id||selected.password_encrypted?'Đã lưu bảo mật':'Chưa có'}</b></div>
                <div><span>Số đơn</span><b>{selected.order_count??0} đơn</b></div>
                <div className="full"><span>Voucher</span><b>{selected.voucher_summary??'—'}</b></div>
                <div><span>Thời gian tạo</span><b>{formatDateTime(selected.created_at)}</b></div>
                <div><span>Nguồn thời gian</span><b>{selected.created_at_source??'MANUAL'}</b></div>
                <div className="full"><span>Ghi chú</span><b>{selected.note??'—'}</b></div>
              </div>
              <div className="panel-action-row">
                <Link className="button primary" href={`/users?user=${selected.id}&mode=edit`}>Sửa tài khoản</Link>
              </div>
            </>}
            {sp.tab==='history'&&<>
              <h3>Lịch sử User</h3>
              <div className="timeline">
                {!history.length
                  ? <div className="empty compact">Chưa có lịch sử thay đổi.</div>
                  : history.map((h:any)=><div className="timeline-item" key={h.id}>
                      <i></i><div>
                        <b>{actionLabels[h.action]??h.action}</b>
                        <span>{sourceLabel(h.source)}</span>
                        <small>{formatDateTime(h.created_at)}</small>
                      </div>
                    </div>)}
              </div>
            </>}
          </div>
        </aside>
      }

      {selected&&isEdit&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">TÀI KHOẢN SHOPEE</span><h2>Sửa {selected.username}</h2></div>
            <Link className="close" href={`/users?user=${selected.id}`}>×</Link>
          </div>
          <form action={updateERPUser} className="panel-form panel-scroll">
            <input type="hidden" name="user_id" value={selected.id}/>
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Username<input name="username" required defaultValue={selected.username}/></label>
              <div className="form-grid">
                <label>Số điện thoại<input name="phone" defaultValue={selected.phone??''}/></label>
                <label>Email<input name="email" type="email" defaultValue={selected.email??''}/></label>
              </div>
              <label>Trạng thái
                <select name="status" defaultValue={selected.status}>
                  {['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </label>
            </section>

            <section className="form-section">
              <h3>Đăng nhập & phiên</h3>
              <div className="secret-state">Mật khẩu: <b>{selected.password_secret_id||selected.password_encrypted?'Đã có':'Chưa có'}</b> · SPC_ST: <b>{selected.spc_st_secret_id||selected.spc_st_encrypted?'Đã có':'Chưa có'}</b> · SPC_F: <b>{selected.spc_f_secret_id||selected.spc_f_encrypted?'Đã có':'Chưa có'}</b></div>
              <label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_ST mới<textarea name="spc_st" rows={3} placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_F mới<textarea name="spc_f" rows={3} placeholder="Để trống nếu không đổi"/></label>
            </section>

            <section className="form-section">
              <h3>Thiết bị & voucher</h3>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" name="mobile" defaultChecked={selected.mobile}/> Mobile</label>
                <label className="check-row"><input type="checkbox" name="web" defaultChecked={selected.web}/> Web</label>
              </div>
              <label>Voucher<input name="voucher_summary" defaultValue={selected.voucher_summary??''}/></label>
              <label>Ghi chú<textarea name="note" rows={3} defaultValue={selected.note??''}/></label>
            </section>

            <div className="form-actions">
              <Link className="button" href={`/users?user=${selected.id}`}>Hủy</Link>
              <button className="button primary">Lưu thay đổi</button>
            </div>
          </form>
        </aside>
      }
    </div>
  </>
}
