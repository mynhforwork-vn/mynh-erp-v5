import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { ManualSyncButton } from '@/components/manual-sync-button'
import { replaceShipment } from '@/lib/actions/core'
import { CopyOrderButton } from '@/components/copy-order-button'
import { OrderEditorForm } from '@/components/order-editor-form'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'

type RangeKey='today'|'week'|'month'|'custom'|'7d'|'30d'|'quarter'|'year'
type SP={order?:string,receive?:string,mode?:string,tab?:string,q?:string,range?:RangeKey,from?:string,to?:string,tracking?:string}

const HOUR=60*60*1000
const DAY=24*HOUR

function vnDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+7*HOUR)
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}
}
function ymd(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function shiftLocalDay(y:number,m:number,d:number,days:number){
  const x=new Date(Date.UTC(y,m-1,d)+days*DAY)
  return ymd(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())
}
function currentWeekRange(y:number,m:number,d:number){
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay()
  const daysFromMonday=(weekday+6)%7
  return {
    from:shiftLocalDay(y,m,d,-daysFromMonday),
    to:shiftLocalDay(y,m,d,6-daysFromMonday),
  }
}
function resolveRange(sp:SP){
  const key:RangeKey=sp.range??'today'
  const p=vnDateParts()
  const today=ymd(p.year,p.month,p.day)
  let from=today,to=today,label='Hôm nay'
  if(key==='week'){
    const week=currentWeekRange(p.year,p.month,p.day)
    from=week.from
    to=week.to
    label='Tuần này'
  }
  if(key==='7d'){from=shiftLocalDay(p.year,p.month,p.day,-6);label='7 ngày'}
  if(key==='30d'){from=shiftLocalDay(p.year,p.month,p.day,-29);label='30 ngày'}
  if(key==='month'){from=ymd(p.year,p.month,1);label='Tháng này'}
  if(key==='quarter'){
    const qStart=Math.floor((p.month-1)/3)*3+1
    from=ymd(p.year,qStart,1)
    label='Quý này'
  }
  if(key==='year'){
    from=ymd(p.year,1,1)
    label='Năm nay'
  }
  if(key==='custom'){
    from=/^\d{4}-\d{2}-\d{2}$/.test(sp.from??'')?String(sp.from):today
    to=/^\d{4}-\d{2}-\d{2}$/.test(sp.to??'')?String(sp.to):today
    if(from>to)[from,to]=[to,from]
    label=`${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`
  }
  return {
    key,from,to,label,
    start:new Date(`${from}T00:00:00+07:00`).toISOString(),
    end:new Date(`${to}T23:59:59.999+07:00`).toISOString(),
  }
}

function toLocalInput(value?:string|null){
  if(!value)return ''
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return ''
  const p=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(d)
  const x=Object.fromEntries(p.map(i=>[i.type,i.value])) as Record<string,string>
  return `${x.year}-${x.month}-${x.day}T${x.hour}:${x.minute}`
}

function activeShipment(order:any){
  return (order?.shipments??[]).find((x:any)=>x.is_active)??order?.shipments?.[0]??null
}

function productSummary(items:any[]){
  if(!items?.length)return '—'
  const first=items[0]
  const name=[first.product_name,first.variant].filter(Boolean).join(' · ')
  return items.length>1?`${name} +${items.length-1}`:name
}

function voucherSummary(vouchers:any[]){
  if(!vouchers?.length)return '—'
  return vouchers.map(v=>[v.voucher_tag,v.voucher_type].filter(Boolean).join(' · ')).filter(Boolean).join(', ')||'Có voucher'
}

export default async function OrdersPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')

  const range=resolveRange(sp)
  const queryText=String(sp.q??'').trim().toLowerCase()

  const [{data,error},{data:userOptions}]=await Promise.all([
    supabase.from('orders').select(
      'id,shopee_order_id,erp_user_id,order_date,area,order_status,payment_status,recipient_name,recipient_phone,recipient_address,destination_hub,cod,receive_status,warehouse_status,created_at,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active,tracking_enabled,next_track_at),order_items(product_name,variant,quantity),order_vouchers(voucher_tag,voucher_type,voucher_code,voucher_name)'
    ).gte('order_date',range.start).lte('order_date',range.end).order('order_date',{ascending:false}).limit(1000),
    supabase.from('erp_users').select('id,username').order('username').limit(500)
  ])

  const dateRows=(data??[]) as any[]
  const rows=dateRows.filter((o:any)=>{
    if(sp.receive&&o.receive_status!==sp.receive)return false
    const shipment=activeShipment(o)
    if(sp.tracking==='DELIVERED'&&shipment?.current_tracking_status!=='DELIVERED')return false
    if(sp.tracking==='shipping'){
      const status=shipment?.current_tracking_status
      if(!status||['DELIVERED','CANCELLED','RETURNED'].includes(status))return false
    }
    if(sp.tracking==='missing'&&shipment?.tracking_number)return false
    if(!queryText)return true
    const s=activeShipment(o)
    const hay=[
      o.shopee_order_id,o.erp_users?.username,s?.tracking_number,s?.carrier,
      o.recipient_name,o.recipient_phone,o.area,o.destination_hub,
      ...(o.order_items??[]).flatMap((x:any)=>[x.product_name,x.variant]),
      ...(o.order_vouchers??[]).flatMap((x:any)=>[x.voucher_code,x.voucher_name,x.voucher_tag,x.voucher_type]),
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(queryText)
  })

  const totalOrders=dateRows.length
  const totalCod=dateRows.reduce((sum:number,o:any)=>sum+Number(o.cod??0),0)
  const shipping=dateRows.filter((o:any)=>{
    const s=activeShipment(o)?.current_tracking_status
    return s&&!['DELIVERED','CANCELLED','RETURNED'].includes(s)
  }).length
  const delivered=dateRows.filter((o:any)=>activeShipment(o)?.current_tracking_status==='DELIVERED').length
  const waiting=dateRows.filter((o:any)=>o.receive_status==='WAITING_RECEIVE').length
  const missingTracking=dateRows.filter((o:any)=>!activeShipment(o)?.tracking_number).length

  function listHref(extra:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    if(range.key!=='today')p.set('range',range.key)
    if(range.key==='custom'){p.set('from',range.from);p.set('to',range.to)}
    if(queryText)p.set('q',sp.q??'')
    if(sp.receive)p.set('receive',sp.receive)
    if(sp.tracking)p.set('tracking',sp.tracking)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return `/purchase/orders${qs?`?${qs}`:''}`
  }

  let detail:any=null
  let items:any[]=[]
  let vouchers:any[]=[]
  let trackingEvents:any[]=[]
  let auditRows:any[]=[]

  if(sp.order){
    const [od,it,vo]=await Promise.all([
      supabase.from('orders').select(
        'id,shopee_order_id,erp_user_id,order_date,area,order_status,payment_status,recipient_name,recipient_phone,recipient_address,destination_hub,cod,receive_status,warehouse_status,created_at,updated_at,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active,tracking_enabled,last_track_at,next_track_at,created_at,replaced_at)'
      ).eq('id',sp.order).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id',sp.order).order('created_at'),
      supabase.from('order_vouchers').select('*').eq('order_id',sp.order).order('created_at')
    ])
    detail=od.data
    items=(it.data??[]) as any[]
    vouchers=(vo.data??[]) as any[]

    const shipmentIds=(detail?.shipments??[]).map((x:any)=>x.id)
    if((sp.tab==='tracking'||!sp.tab)&&shipmentIds.length){
      const ev=await supabase.from('tracking_events').select('*').in('shipment_id',shipmentIds).order('event_time',{ascending:false}).limit(100)
      trackingEvents=(ev.data??[]) as any[]
    }
    if(sp.tab==='history'){
      const au=await supabase.from('audit_logs').select('*').eq('entity_id',sp.order).order('created_at',{ascending:false}).limit(100)
      auditRows=(au.data??[]) as any[]
    }
  }

  const createMode=sp.mode==='create'
  const editMode=Boolean(detail&&sp.mode==='edit')
  const panelOpen=createMode||Boolean(detail)
  const currentShip=activeShipment(detail)

  return <div className="order-screen">
    <header className="page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Đơn nhập hàng</h1>
        <p>Lưu trữ toàn bộ đơn mua, sản phẩm, voucher, vận đơn và lịch sử xử lý</p>
      </div>
      <div className="head-actions">
        <Link className="button primary" href={listHref({mode:'create'})}>+ Tạo đơn nhập</Link>
      </div>
    </header>

    <PurchaseDateFilter
      activeRange={range.key}
      from={range.from}
      to={range.to}
      label={range.label}
      basePath="/purchase/orders"
    />

    <section className="kpi-grid order-kpi-grid">
      <Link className="kpi-card" href={listHref({receive:null,tracking:null})}><span>Tổng đơn</span><b>{totalOrders}</b><small>Trong khoảng đã chọn</small></Link>
      <Link className="kpi-card" href={listHref({receive:null,tracking:null})}><span>Tổng COD</span><b className="kpi-money">{formatMoney(totalCod)}</b><small>Giá trị đơn nhập</small></Link>
      <Link className="kpi-card" href={listHref({receive:null,tracking:'shipping'})}><span>Đang vận chuyển</span><b>{shipping}</b><small>Chưa ở trạng thái kết thúc</small></Link>
      <Link className="kpi-card" href={listHref({receive:null,tracking:'DELIVERED'})}><span>Giao thành công</span><b>{delivered}</b><small>Đã có trạng thái giao thành công</small></Link>
      <Link className="kpi-card warning" href={listHref({receive:'WAITING_RECEIVE',tracking:null})}><span>Chờ nhận</span><b>{waiting}</b><small>Cần xác nhận vật lý</small></Link>
      <Link className="kpi-card danger" href={listHref({receive:null,tracking:'missing'})}><span>Chưa có MVĐ</span><b>{missingTracking}</b><small>Cần bổ sung vận đơn</small></Link>
    </section>

    <div className={`split-view order-workspace ${panelOpen?'with-panel':''}`}>
      <section className="order-list-pane">
        <div className="toolbar order-toolbar">
          <form className="order-search-form" action="/purchase/orders">
            {range.key!=='today'&&<input type="hidden" name="range" value={range.key}/>}
            {range.key==='custom'&&<><input type="hidden" name="from" value={range.from}/><input type="hidden" name="to" value={range.to}/></>}
            {sp.receive&&<input type="hidden" name="receive" value={sp.receive}/>}
            {sp.tracking&&<input type="hidden" name="tracking" value={sp.tracking}/>}
            <input className="search" name="q" defaultValue={sp.q??''} placeholder="Mã đơn / MVĐ / Username / sản phẩm / voucher"/>
            <button className="button small">Tìm</button>
            {queryText&&<Link className="button small" href={listHref({q:null})}>Xóa tìm</Link>}
          </form>
          <div className="segmented">
            <Link className={!sp.receive?'active':''} href={listHref({receive:null})}>Tất cả</Link>
            <Link className={sp.receive==='WAITING_RECEIVE'?'active':''} href={listHref({receive:'WAITING_RECEIVE'})}>Chờ nhận</Link>
            <Link className={sp.receive==='RECEIVED'?'active':''} href={listHref({receive:'RECEIVED'})}>Đã nhận</Link>
          </div>
          <span className="toolbar-note">{rows.length} / {totalOrders} đơn</span>
        </div>

        <div className="card table-card order-table-card">
          <table className="table order-table">
            <thead><tr>
              <th>#</th>
              <th>Mã đơn</th>
              <th>Username</th>
              <th>Sản phẩm</th>
              <th>COD</th>
              <th>Mã vận đơn</th>
              <th>ĐVVC</th>
              <th>Voucher</th>
              <th>Xử lý</th>
            </tr></thead>
            <tbody>
              {error
                ? <tr><td colSpan={9} className="error-text">{error.message}</td></tr>
                : !rows.length
                  ? <tr><td colSpan={9} className="empty">Không có đơn phù hợp với bộ lọc hiện tại.</td></tr>
                  : rows.map((o:any,i:number)=>{
                      const s=activeShipment(o)
                      return <tr key={o.id} className={sp.order===o.id?'selected-row':''}>
                        <td>{i+1}</td>
                        <td><Link className="table-link" href={listHref({order:o.id})}>{o.shopee_order_id??o.id.slice(0,8)}</Link></td>
                        <td>{o.erp_users?.username??'—'}</td>
                        <td className="truncate product-cell">{productSummary(o.order_items??[])}</td>
                        <td className="money">{formatMoney(o.cod)}</td>
                        <td>{s?.tracking_number??'Chưa có'}</td>
                        <td>{s?.carrier??'—'}</td>
                        <td className="truncate voucher-cell">{voucherSummary(o.order_vouchers??[])}</td>
                        <td>
                          <div className="order-state-cell">
                            <span className={`status-pill status-${String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(s?.current_tracking_status)}</span>
                            {o.receive_status!=='NOT_READY'&&<span className={`status-pill ${o.receive_status==='RECEIVED'?'green':'orange'}`}>{statusLabel(o.receive_status)}</span>}
                          </div>
                        </td>
                      </tr>
                    })}
            </tbody>
          </table>
        </div>
      </section>

      {createMode&&
        <aside className="detail-panel order-panel">
          <div className="panel-head">
            <div><span className="eyebrow">ĐƠN NHẬP HÀNG</span><h2>Tạo đơn mới</h2></div>
            <Link className="close" href={listHref({mode:null})}>×</Link>
          </div>
          <OrderEditorForm
            mode="create"
            users={(userOptions??[]) as any[]}
            values={{order_status:'PENDING',payment_status:'UNPAID',cod:0}}
            cancelHref={listHref({mode:null})}
          />
        </aside>
      }

      {detail&&editMode&&
        <aside className="detail-panel order-panel">
          <div className="panel-head">
            <div><span className="eyebrow">ĐƠN NHẬP HÀNG</span><h2>Sửa {detail.shopee_order_id??detail.id.slice(0,8)}</h2></div>
            <Link className="close" href={listHref({order:detail.id,mode:null})}>×</Link>
          </div>
          <OrderEditorForm
            mode="edit"
            users={(userOptions??[]) as any[]}
            values={{
              id:detail.id,
              shopee_order_id:detail.shopee_order_id,
              erp_user_id:detail.erp_user_id,
              order_date_local:toLocalInput(detail.order_date),
              tracking_number:currentShip?.tracking_number,
              carrier:currentShip?.carrier,
              cod:detail.cod,
              order_status:detail.order_status,
              payment_status:detail.payment_status,
              recipient_name:detail.recipient_name,
              recipient_phone:detail.recipient_phone,
              recipient_address:detail.recipient_address,
              area:detail.area,
              destination_hub:detail.destination_hub,
            }}
            initialItems={items}
            initialVouchers={vouchers}
            cancelHref={listHref({order:detail.id,mode:null})}
          />
        </aside>
      }

      {detail&&!editMode&&
        <aside className="detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">CHI TIẾT ĐƠN</span><h2>{detail.shopee_order_id??detail.id.slice(0,8)}</h2></div>
            <Link className="close" href={listHref({order:null,tab:null,mode:null})}>×</Link>
          </div>

          <div className="panel-tabs">
            <Link className={!sp.tab||sp.tab==='info'?'active':''} href={listHref({order:detail.id,tab:'info'})}>Thông tin</Link>
            <Link className={sp.tab==='tracking'?'active':''} href={listHref({order:detail.id,tab:'tracking'})}>Tracking</Link>
            <Link className={sp.tab==='history'?'active':''} href={listHref({order:detail.id,tab:'history'})}>Lịch sử</Link>
          </div>

          <div className="panel-scroll">
            {(!sp.tab||sp.tab==='info')&&<>
              <div className="detail-grid">
                <div><span>Username</span><b>{detail.erp_users?.username??'—'}</b></div>
                <div><span>Ngày đặt</span><b>{formatDateTime(detail.order_date)}</b></div>
                <div><span>Trạng thái đơn</span><b>{statusLabel(detail.order_status)}</b></div>
                <div><span>Thanh toán</span><b>{statusLabel(detail.payment_status)}</b></div>
                <div><span>COD</span><b>{formatMoney(detail.cod)}</b></div>
                <div><span>Khu vực</span><b>{detail.area??'—'}</b></div>
                <div><span>Người nhận</span><b>{detail.recipient_name??'—'}</b></div>
                <div><span>Số điện thoại</span><b>{formatPhone(detail.recipient_phone)}</b></div>
                <div className="full"><span>Địa chỉ nhận</span><b>{detail.recipient_address??'—'}</b></div>
                <div><span>Kho đích</span><b>{detail.destination_hub??'—'}</b></div>
                <div><span>Nhận hàng</span><b>{statusLabel(detail.receive_status)}</b></div>
                <div><span>Kho</span><b>{statusLabel(detail.warehouse_status)}</b></div>
                <div><span>Mã vận đơn</span><b>{currentShip?.tracking_number??'Chưa có'}</b></div>
                <div><span>ĐVVC</span><b>{currentShip?.carrier??'—'}</b></div>
              </div>

              <div className="panel-action-row split-actions">
                <CopyOrderButton text={`Mã đơn: ${detail.shopee_order_id??''}\nMã vận đơn: ${currentShip?.tracking_number??''}\nCOD: ${detail.cod??0}\nNgười nhận: ${detail.recipient_name??''}\nSĐT: ${detail.recipient_phone??''}\nĐịa chỉ: ${detail.recipient_address??''}`}/>
                {['admin','operator'].includes(role)&&<Link className="button primary" href={listHref({order:detail.id,mode:'edit'})}>Sửa đơn</Link>}
              </div>

              <h3>Sản phẩm</h3>
              <div className="mini-table">
                <div className="mini-head"><span>Sản phẩm</span><span>SKU / Phân loại</span><span>SL</span><span>Giá</span></div>
                {!items.length
                  ? <div className="empty compact">Chưa có sản phẩm.</div>
                  : items.map((it:any)=><div className="mini-row" key={it.id}>
                      <span>{it.product_name??'Sản phẩm'}</span>
                      <span>{[it.sku,it.variant].filter(Boolean).join(' · ')||'—'}</span>
                      <span>{it.quantity??1}</span>
                      <span>{formatMoney(it.final_price??it.original_price)}</span>
                    </div>)}
              </div>

              <h3>Voucher</h3>
              {!vouchers.length
                ? <div className="empty compact">Không sử dụng voucher.</div>
                : <div className="voucher-list">{vouchers.map((v:any)=><div className="voucher-row" key={v.id}>
                    <div><b>{v.voucher_tag??'Voucher'}</b><span>{v.voucher_name??'—'}</span></div>
                    <div><span>{v.voucher_type??'—'}</span><b>{v.voucher_code??'—'}</b></div>
                  </div>)}</div>}
            </>}

            {sp.tab==='tracking'&&<>
              <h3>Vận đơn</h3>
              {!(detail.shipments??[]).length
                ? <div className="empty compact">Chưa có mã vận đơn.</div>
                : (detail.shipments??[]).sort((a:any,b:any)=>Number(b.is_active)-Number(a.is_active)).map((s:any)=><div className={`shipment-box ${s.is_active?'active-shipment':''}`} key={s.id}>
                    <div className="shipment-top">
                      <div><span className="muted">{s.carrier??'Đơn vị vận chuyển'} {s.is_active?'· ĐANG DÙNG':'· ĐÃ THAY'}</span><b>{s.tracking_number}</b></div>
                      <span className={`status-pill status-${String(s.current_tracking_status).toLowerCase()}`}>{statusLabel(s.current_tracking_status)}</span>
                    </div>
                    <div className="meta-row">
                      <span>Lần đồng bộ cuối: {formatDateTime(s.last_track_at)}</span>
                      <span>{s.is_active?'Lần kế tiếp: '+formatDateTime(s.next_track_at):'Thay lúc: '+formatDateTime(s.replaced_at)}</span>
                    </div>
                    {s.is_active&&<ManualSyncButton shipmentId={s.id}/>}
                  </div>)}

              {['admin','operator'].includes(role)&&
                <form action={replaceShipment} className="replace-form">
                  <input type="hidden" name="order_id" value={detail.id}/>
                  <b>Cập nhật mã vận đơn</b>
                  <div className="form-grid">
                    <input name="tracking_number" required placeholder="Mã vận đơn mới"/>
                    <input name="carrier" placeholder="Đơn vị vận chuyển"/>
                  </div>
                  <button className="button small primary">Lưu MVĐ mới</button>
                </form>}

              <h3>Hành trình vận chuyển</h3>
              <div className="timeline">
                {!trackingEvents.length
                  ? <div className="empty compact">Chưa có sự kiện vận chuyển.</div>
                  : trackingEvents.map((e:any)=><div className="timeline-item" key={e.id}>
                      <i></i><div>
                        <b>{statusLabel(e.normalized_status)}</b>
                        <span>{e.raw_description??e.raw_status??'—'}</span>
                        <small>{formatDateTime(e.event_time)}{e.raw_location?` · ${e.raw_location}`:''}</small>
                      </div>
                    </div>)}
              </div>
            </>}

            {sp.tab==='history'&&<>
              <h3>Lịch sử hệ thống</h3>
              <div className="timeline">
                {!auditRows.length
                  ? <div className="empty compact">Chưa có lịch sử hệ thống cho đơn này.</div>
                  : auditRows.map((a:any)=><div className="timeline-item" key={a.id}>
                      <i></i><div>
                        <b>{a.action??'CẬP NHẬT'}</b>
                        <span>{sourceLabel(a.source??a.module??'SYSTEM')}</span>
                        <small>{formatDateTime(a.created_at??a.time)}</small>
                      </div>
                    </div>)}
              </div>
            </>}

            <div className="panel-meta">Tạo đơn: {formatDateTime(detail.created_at)}</div>
          </div>
        </aside>
      }
    </div>
  </div>
}
