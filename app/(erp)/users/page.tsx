import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { createERPUser, updateERPUser } from '@/lib/actions/core'
import { PurchaseAccountTable } from '@/components/purchase-account-table'
import { VoucherTags } from '@/components/voucher-tags'
import Link from 'next/link'

type SP={
  mode?:string,user?:string,tab?:string,q?:string,state?:string,platform?:string,
  device?:string,session?:string,voucher?:string,orders?:string,browser?:string
}

function statusClass(status?:string|null){
  if(status==='Active') return 'green'
  if(status==='Blocked') return 'red'
  if(['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(String(status))) return 'orange'
  return ''
}
function hasST(row:any){return Boolean(row?.spc_st_secret_id||row?.spc_st_encrypted)}
function hasF(row:any){return Boolean(row?.spc_f_secret_id||row?.spc_f_encrypted)}
function activeShipment(order:any){
  return (order?.shipments??[]).find((x:any)=>x.is_active)??order?.shipments?.[0]??null
}
function productSummary(items:any[]){
  if(!items?.length)return '—'
  const first=items[0]
  const firstName=[first.product_name,first.variant].filter(Boolean).join(' · ')
  return items.length>1?`${firstName} +${items.length-1}`:firstName
}
function browserBucket(value?:string|null){
  const v=String(value??'').toLowerCase()
  if(v.includes('chrome'))return 'chrome'
  if(v.includes('safari'))return 'safari'
  if(v.includes('edge'))return 'edge'
  if(!v)return 'none'
  return 'other'
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

  const fields='id,username,phone,email,status,platform,browser_name,note,created_at,updated_at,mobile,web,voucher_summary,order_count,created_at_source,password_secret_id,spc_st_secret_id,spc_f_secret_id,password_encrypted,spc_st_encrypted,spc_f_encrypted'
  const platform=sp.platform??'SHOPEE'
  const state=sp.state??'all'
  const device=sp.device??'all'
  const session=sp.session??'all'
  const voucher=sp.voucher??'all'
  const orders=sp.orders??'all'
  const browser=sp.browser??'all'
  const queryText=String(sp.q??'').trim().toLowerCase()

  const {data,error}=await supabase.from('erp_users').select(fields).eq('platform',platform).order('created_at',{ascending:false}).limit(2000)
  const allRows=(data??[]) as any[]

  const counts={
    all:allRows.length,
    active:allRows.filter(x=>x.status==='Active').length,
    error:allRows.filter(x=>['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(x.status)).length,
    blocked:allRows.filter(x=>x.status==='Blocked').length,
    unknown:allRows.filter(x=>x.status==='Không xác định').length,
  }

  const rows=allRows.filter((u:any)=>{
    if(state==='active'&&u.status!=='Active')return false
    if(state==='error'&&!['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(u.status))return false
    if(state==='blocked'&&u.status!=='Blocked')return false
    if(state==='unknown'&&u.status!=='Không xác định')return false

    if(device==='mobile'&&!u.mobile)return false
    if(device==='web'&&!u.web)return false
    if(device==='both'&&!(u.mobile&&u.web))return false
    if(device==='none'&&(u.mobile||u.web))return false

    const st=hasST(u), sf=hasF(u)
    if(session==='full'&&!(st&&sf))return false
    if(session==='st'&&!st)return false
    if(session==='f'&&!sf)return false
    if(session==='missing'&&(st&&sf))return false
    if(session==='none'&&(st||sf))return false

    const voucherText=String(u.voucher_summary??'').toLowerCase()
    if(voucher==='has'&&!voucherText)return false
    if(voucher==='none'&&voucherText)return false
    if(voucher==='freeship'&&!voucherText.includes('free'))return false
    if(voucher==='discount'&&!voucherText.includes('giảm'))return false
    if(voucher==='cashback'&&!(voucherText.includes('hoàn')||voucherText.includes('xu')))return false

    const n=Number(u.order_count??0)
    if(orders==='0'&&n!==0)return false
    if(orders==='1-5'&&(n<1||n>5))return false
    if(orders==='6-10'&&(n<6||n>10))return false
    if(orders==='11+'&&n<11)return false

    if(browser!=='all'&&browserBucket(u.browser_name)!==browser)return false

    if(queryText){
      const hay=[u.username,u.phone,u.email,u.note,u.browser_name,u.voucher_summary].filter(Boolean).join(' ').toLowerCase()
      if(!hay.includes(queryText))return false
    }
    return true
  })

  function filterHref(overrides:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    const current:Record<string,string|undefined>={
      q:sp.q,state:state!=='all'?state:undefined,device:device!=='all'?device:undefined,
      session:session!=='all'?session:undefined,voucher:voucher!=='all'?voucher:undefined,
      orders:orders!=='all'?orders:undefined,browser:browser!=='all'?browser:undefined,
      platform:platform!=='SHOPEE'?platform:undefined,
    }
    for(const [k,v] of Object.entries(current))if(v)p.set(k,v)
    for(const [k,v] of Object.entries(overrides)){
      if(v===null||v===undefined||v==='all'||v==='')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/purchase/accounts'+(qs?'?'+qs:'')
  }
  const detailQuery=new URL(filterHref().replace('/purchase/accounts',''),'https://x.local').searchParams.toString()

  let selected:any=null
  if(sp.user){
    selected=allRows.find((x:any)=>x.id===sp.user)??null
    if(!selected){
      const s=await supabase.from('erp_users').select(fields).eq('id',sp.user).maybeSingle()
      selected=s.data
    }
  }

  let history:any[]=[]
  let userOrders:any[]=[]
  if(selected&&sp.tab==='history'){
    const h=await supabase.from('audit_logs').select('id,action,old_value,new_value,source,created_at').eq('module','USERS').eq('entity_id',selected.id).order('created_at',{ascending:false}).limit(100)
    history=(h.data??[]) as any[]
  }
  if(selected&&sp.tab==='orders'){
    const o=await supabase.from('orders').select(
      'id,shopee_order_id,order_date,cod,receive_status,order_status,order_items(product_name,variant,quantity),order_vouchers(voucher_tag,voucher_type,voucher_code),shipments(id,tracking_number,carrier,current_tracking_status,is_active)'
    ).eq('erp_user_id',selected.id).order('order_date',{ascending:false}).limit(100)
    userOrders=(o.data??[]) as any[]
  }

  const panelOpen=sp.mode==='create'||Boolean(selected)
  const isEdit=Boolean(selected&&sp.mode==='edit')
  const filtersActive=Boolean(queryText||state!=='all'||device!=='all'||session!=='all'||voucher!=='all'||orders!=='all'||browser!=='all')

  return <>
    <header className="page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Tài khoản mua hàng</h1>
        <p>Lưu trữ tài khoản mua hàng theo nền tảng; hiện tại đang vận hành Shopee</p>
      </div>
      <div className="head-actions">
        <span className="platform-badge">SHOPEE</span>
        <button className="button" disabled>Nhập hàng loạt</button>
        <Link className="button primary" href="/purchase/accounts?mode=create">+ Thêm tài khoản</Link>
      </div>
    </header>

    <section className="account-kpi-grid">
      <Link className={`account-kpi ${state==='all'?'active':''}`} href={filterHref({state:null})}>
        <span>Tất cả</span><b>{counts.all}</b><small>Tài khoản</small>
      </Link>
      <Link className={`account-kpi success ${state==='active'?'active':''}`} href={filterHref({state:'active'})}>
        <span>Hoạt động</span><b>{counts.active}</b><small>Sẵn sàng sử dụng</small>
      </Link>
      <Link className={`account-kpi warning ${state==='error'?'active':''}`} href={filterHref({state:'error'})}>
        <span>Cần xử lý</span><b>{counts.error}</b><small>M01–M04 / Captcha / Auto Hủy</small>
      </Link>
      <Link className={`account-kpi danger ${state==='blocked'?'active':''}`} href={filterHref({state:'blocked'})}>
        <span>Đã khóa</span><b>{counts.blocked}</b><small>Blocked</small>
      </Link>
      <Link className={`account-kpi ${state==='unknown'?'active':''}`} href={filterHref({state:'unknown'})}>
        <span>Không xác định</span><b>{counts.unknown}</b><small>Cần kiểm tra</small>
      </Link>
    </section>

    <form className="account-filter-bar" action="/purchase/accounts">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Username / SĐT / Email / Browser / Voucher"/>
      <select name="device" defaultValue={device}>
        <option value="all">Tất cả thiết bị</option>
        <option value="mobile">Có Mobile</option>
        <option value="web">Có Web</option>
        <option value="both">Mobile + Web</option>
        <option value="none">Chưa gắn thiết bị</option>
      </select>
      <select name="browser" defaultValue={browser}>
        <option value="all">Tất cả Browser</option>
        <option value="chrome">Chrome</option>
        <option value="safari">Safari</option>
        <option value="edge">Edge</option>
        <option value="other">Browser khác</option>
        <option value="none">Chưa khai báo Browser</option>
      </select>
      <select name="session" defaultValue={session}>
        <option value="all">Tất cả phiên</option>
        <option value="full">Đủ SPC_ST + SPC_F</option>
        <option value="st">Có SPC_ST</option>
        <option value="f">Có SPC_F</option>
        <option value="missing">Thiếu ít nhất 1 SPC</option>
        <option value="none">Không có SPC</option>
      </select>
      <select name="voucher" defaultValue={voucher}>
        <option value="all">Tất cả Voucher</option>
        <option value="has">Có Voucher</option>
        <option value="none">Không Voucher</option>
        <option value="freeship">Freeship</option>
        <option value="discount">Giảm giá</option>
        <option value="cashback">Hoàn xu</option>
      </select>
      <select name="orders" defaultValue={orders}>
        <option value="all">Tất cả số đơn</option>
        <option value="0">0 đơn</option>
        <option value="1-5">1–5 đơn</option>
        <option value="6-10">6–10 đơn</option>
        <option value="11+">11+ đơn</option>
      </select>
      {state!=='all'&&<input type="hidden" name="state" value={state}/>}
      <button className="button primary small">Áp dụng</button>
      {filtersActive&&<Link className="button small" href="/purchase/accounts">Xóa lọc</Link>}
    </form>

    <div className={`split-view ${panelOpen?'with-panel':''}`}>
      <section>
        <div className="toolbar account-toolbar">
          <div className="account-result-meta">
            <b>{rows.length}</b><span>/ {counts.all} tài khoản phù hợp</span>
          </div>
          <span className="toolbar-note">Bấm Username để mở chi tiết</span>
        </div>

        {error&&<div className="error-box">Không thể tải dữ liệu tài khoản: {error.message}</div>}
        {!error&&<PurchaseAccountTable rows={rows} selectedId={selected?.id} detailQuery={detailQuery}/>}
      </section>

      {sp.mode==='create'&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">TÀI KHOẢN MUA HÀNG</span><h2>Thêm tài khoản</h2></div>
            <Link className="close" href="/purchase/accounts">×</Link>
          </div>
          <form action={createERPUser} className="panel-form panel-scroll">
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Nền tảng<select disabled defaultValue="SHOPEE"><option value="SHOPEE">Shopee</option></select></label>
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
              <h3>Thiết bị, Browser & Voucher</h3>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" name="mobile"/> Mobile</label>
                <label className="check-row"><input type="checkbox" name="web"/> Web</label>
              </div>
              <label>Browser<input name="browser_name" placeholder="Ví dụ: Chrome, Safari, Edge"/></label>
              <label>Voucher<input name="voucher_summary" placeholder="Ví dụ: Freeship · Giảm giá · Hoàn xu"/></label>
              <label>Ghi chú<textarea name="note" rows={3}/></label>
            </section>

            <div className="form-actions">
              <Link className="button" href="/purchase/accounts">Hủy</Link>
              <button className="button primary">Tạo tài khoản</button>
            </div>
          </form>
        </aside>
      }

      {selected&&!isEdit&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">CHI TIẾT USER</span><h2>{selected.username}</h2></div>
            <Link className="close" href={filterHref()}>×</Link>
          </div>
          <div className="panel-tabs user-panel-tabs">
            <Link className={!sp.tab||sp.tab==='info'?'active':''} href={`/purchase/accounts?user=${selected.id}&tab=info`}>Thông tin</Link>
            <Link className={sp.tab==='orders'?'active':''} href={`/purchase/accounts?user=${selected.id}&tab=orders`}>Đơn hàng <span>{selected.order_count??0}</span></Link>
            <Link className={sp.tab==='history'?'active':''} href={`/purchase/accounts?user=${selected.id}&tab=history`}>Lịch sử</Link>
          </div>
          <div className="panel-scroll">
            {(!sp.tab||sp.tab==='info')&&<>
              <div className="detail-grid">
                <div><span>Username</span><b>{selected.username}</b></div>
                <div><span>Nền tảng</span><b>{selected.platform??'SHOPEE'}</b></div>
                <div><span>Trạng thái</span><b>{statusLabel(selected.status)}</b></div>
                <div><span>Số điện thoại</span><b>{formatPhone(selected.phone)}</b></div>
                <div className="full"><span>Email</span><b>{selected.email??'—'}</b></div>
              </div>

              <h3>Thiết bị & Browser</h3>
              <div className="device-detail-grid">
                <div><span>Mobile</span><b className={selected.mobile?'yes':'no'}>{selected.mobile?'Có':'Không'}</b></div>
                <div><span>Web</span><b className={selected.web?'yes':'no'}>{selected.web?'Có':'Không'}</b></div>
                <div className="full"><span>Browser</span><b>{selected.browser_name??'Chưa khai báo'}</b></div>
                <div><span>SPC_ST</span><b className={hasST(selected)?'yes':'no'}>{hasST(selected)?'Đã có':'Chưa có'}</b></div>
                <div><span>SPC_F</span><b className={hasF(selected)?'yes':'no'}>{hasF(selected)?'Đã có':'Chưa có'}</b></div>
              </div>

              <h3>Voucher</h3>
              <div className="detail-voucher-box"><VoucherTags value={selected.voucher_summary}/></div>

              <div className="detail-grid account-meta-grid">
                <div><span>Số đơn</span><b>{selected.order_count??0} đơn</b></div>
                <div><span>Mật khẩu</span><b>{selected.password_secret_id||selected.password_encrypted?'Đã lưu bảo mật':'Chưa có'}</b></div>
                <div><span>Thời gian tạo</span><b>{formatDateTime(selected.created_at)}</b></div>
                <div><span>Nguồn thời gian</span><b>{selected.created_at_source??'MANUAL'}</b></div>
                <div className="full"><span>Ghi chú</span><b>{selected.note??'—'}</b></div>
              </div>

              <div className="panel-action-row">
                <Link className="button primary" href={`/purchase/accounts?user=${selected.id}&mode=edit`}>Sửa tài khoản</Link>
              </div>
            </>}

            {sp.tab==='orders'&&<>
              <div className="panel-section-head">
                <div><h3>Đơn hàng của User</h3><span>{userOrders.length} đơn đang hiển thị</span></div>
                <Link className="button small" href={`/purchase/orders?q=${encodeURIComponent(selected.username)}`}>Mở danh sách đơn</Link>
              </div>
              <div className="user-order-list">
                {!userOrders.length
                  ? <div className="empty compact">User này chưa có đơn hàng.</div>
                  : userOrders.map((o:any)=>{
                      const s=activeShipment(o)
                      return <Link className="user-order-card" href={`/purchase/orders?order=${o.id}`} key={o.id}>
                        <div className="user-order-card-top">
                          <div><b>{o.shopee_order_id??o.id.slice(0,8)}</b><span>{formatDateTime(o.order_date)}</span></div>
                          <strong>{formatMoney(o.cod)}</strong>
                        </div>
                        <div className="user-order-product">{productSummary(o.order_items??[])}</div>
                        <div className="user-order-meta">
                          <span>{s?.tracking_number??'Chưa có MVĐ'}{s?.carrier?` · ${s.carrier}`:''}</span>
                          <div>
                            <span className={`status-pill status-${String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(s?.current_tracking_status)}</span>
                            {o.receive_status!=='NOT_READY'&&<span className={`status-pill ${o.receive_status==='RECEIVED'?'green':'orange'}`}>{statusLabel(o.receive_status)}</span>}
                          </div>
                        </div>
                        {!!o.order_vouchers?.length&&<VoucherTags value={o.order_vouchers.map((v:any)=>v.voucher_tag||v.voucher_type||v.voucher_code).filter(Boolean).join(' · ')}/>}
                      </Link>
                    })}
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
            <div><span className="eyebrow">TÀI KHOẢN MUA HÀNG</span><h2>Sửa {selected.username}</h2></div>
            <Link className="close" href={`/purchase/accounts?user=${selected.id}`}>×</Link>
          </div>
          <form action={updateERPUser} className="panel-form panel-scroll">
            <input type="hidden" name="user_id" value={selected.id}/>
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Nền tảng<select disabled defaultValue={selected.platform??'SHOPEE'}><option value="SHOPEE">Shopee</option></select></label>
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
              <div className="secret-state">Mật khẩu: <b>{selected.password_secret_id||selected.password_encrypted?'Đã có':'Chưa có'}</b> · SPC_ST: <b>{hasST(selected)?'Đã có':'Chưa có'}</b> · SPC_F: <b>{hasF(selected)?'Đã có':'Chưa có'}</b></div>
              <label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_ST mới<textarea name="spc_st" rows={3} placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_F mới<textarea name="spc_f" rows={3} placeholder="Để trống nếu không đổi"/></label>
            </section>

            <section className="form-section">
              <h3>Thiết bị, Browser & Voucher</h3>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" name="mobile" defaultChecked={selected.mobile}/> Mobile</label>
                <label className="check-row"><input type="checkbox" name="web" defaultChecked={selected.web}/> Web</label>
              </div>
              <label>Browser<input name="browser_name" defaultValue={selected.browser_name??''} placeholder="Ví dụ: Chrome, Safari, Edge"/></label>
              <label>Voucher<input name="voucher_summary" defaultValue={selected.voucher_summary??''}/></label>
              <label>Ghi chú<textarea name="note" rows={3} defaultValue={selected.note??''}/></label>
            </section>

            <div className="form-actions">
              <Link className="button" href={`/purchase/accounts?user=${selected.id}`}>Hủy</Link>
              <button className="button primary">Lưu thay đổi</button>
            </div>
          </form>
        </aside>
      }
    </div>
  </>
}
