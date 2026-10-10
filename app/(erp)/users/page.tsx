import { requireUser } from '@/lib/supabase/auth'
import { SystemSlidebar } from '@/components/system-slidebar'
import { formatDateTime, formatMoney, formatPhone, sourceLabel, statusLabel } from '@/lib/format'
import { archiveERPUser, createERPUser, deleteERPUserPermanent, restoreERPUser, updateERPUser } from '@/lib/actions/core'
import { PurchaseAccountTable } from '@/components/purchase-account-table'
import { AccountFilterDropdown } from '@/components/account-filter-dropdown'
import { VoucherTags } from '@/components/voucher-tags'
import { UserBulkImport } from '@/components/user-bulk-import'
import { ContextOrderPanel } from '@/components/context-order-panel'
import Link from 'next/link'

type SP={
  mode?:string,user?:string,tab?:string,q?:string,state?:string,platform?:string,
  device?:string,session?:string,voucher?:string,orders?:string,browser?:string,sort?:string,
  range?:string,from?:string,to?:string,archive?:string,
  order?:string,orderTab?:string
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
  return items.length>1?firstName+' +'+(items.length-1):firstName
}
function voucherLabel(v:any){
  return String(v?.voucher_tag||v?.voucher_type||v?.voucher_name||v?.voucher_code||'').trim()
}
function deviceBrowserBucket(value?:string|null){
  const v=String(value??'').toLowerCase()
  if(v.includes('chrome'))return 'chrome'
  if(v.includes('safari'))return 'safari'
  if(v.includes('edge'))return 'edge'
  if(v.includes('shopee app'))return 'app'
  if(!v)return 'none'
  return 'other'
}
function deviceTypeLabel(type?:string|null){
  if(type==='MOBILE')return 'Điện thoại'
  if(type==='TABLET')return 'Máy tính bảng'
  if(type==='BROWSER_PROFILE')return 'Browser Profile'
  return 'Máy tính'
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
  ARCHIVE_USER:'Lưu trữ User',
  RESTORE_USER:'Khôi phục User',
}

export default async function UsersPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canOperate=['admin','operator'].includes(role)
  const archiveView=sp.archive==='archived'

  const fields='id,username,phone,email,status,platform,browser_name,note,created_at,updated_at,mobile,web,order_count,created_at_source,password_secret_id,spc_st_secret_id,spc_f_secret_id,password_encrypted,spc_st_encrypted,spc_f_encrypted,archived_at,archived_by'
  const platform=sp.platform??'SHOPEE'
  const state=sp.state??'all'
  const session=sp.session??'all'
  const voucher=sp.voucher??'all'
  const orders=sp.orders??'all'
  const browser=sp.browser??'all'
  const sort=sp.sort??'newest'
  const queryText=String(sp.q??'').trim().toLowerCase()

  let userListQuery=supabase.from('erp_users').select(fields).eq('platform',platform)
  userListQuery=archiveView
    ? userListQuery.not('archived_at','is',null)
    : userListQuery.is('archived_at',null)
  userListQuery=userListQuery.limit(2000)

  const [{data:userData,error},{data:deviceData},{data:voucherOrderData}]=await Promise.all([
    userListQuery,
    supabase.from('purchase_account_devices')
      .select('id,erp_user_id,device_key,device_name,device_type,browser_name,browser_profile,is_active,last_seen_at,source,note')
      .order('last_seen_at',{ascending:false,nullsFirst:false})
      .limit(5000),
    supabase.from('orders')
      .select('erp_user_id,order_date,order_vouchers(voucher_tag,voucher_type,voucher_code,voucher_name)')
      .not('erp_user_id','is',null)
      .limit(5000),
  ])

  const allRows=(userData??[]) as any[]
  const devices=(deviceData??[]) as any[]
  const voucherOrders=(voucherOrderData??[]) as any[]

  const deviceMap=new Map<string,any[]>()
  for(const d of devices){
    const arr=deviceMap.get(d.erp_user_id)??[]
    arr.push(d)
    deviceMap.set(d.erp_user_id,arr)
  }

  const voucherMap=new Map<string,any[]>()
  const firstOrderDate=new Map<string,string>()
  for(const o of voucherOrders){
    if(o.order_date&&Number.isFinite(Date.parse(o.order_date))){
      const prev=firstOrderDate.get(o.erp_user_id)
      if(!prev||Date.parse(o.order_date)<Date.parse(prev))firstOrderDate.set(o.erp_user_id,o.order_date)
    }
    if(!o.erp_user_id)continue
    const arr=voucherMap.get(o.erp_user_id)??[]
    for(const v of (o.order_vouchers??[]))arr.push(v)
    voucherMap.set(o.erp_user_id,arr)
  }

  const enriched=allRows.map((u:any)=>{
    const activeDevices=(deviceMap.get(u.id)??[]).filter((d:any)=>d.is_active)
    const voucherRows=voucherMap.get(u.id)??[]
    const uniqueVoucherLabels=[...new Set(voucherRows.map(voucherLabel).filter(Boolean))]
    return {
      ...u,
      active_devices:activeDevices,
      all_devices:deviceMap.get(u.id)??[],
      voucher_used_rows:voucherRows,
      voucher_used_summary:uniqueVoucherLabels.join(' · '),
      voucher_tags:uniqueVoucherLabels,
      effective_created_at:(firstOrderDate.get(u.id)&&Date.parse(firstOrderDate.get(u.id)!)<Date.parse(u.created_at))
        ?firstOrderDate.get(u.id):u.created_at,
    }
  })

  function matchesAccountScope(u:any){
    const activeDevices=u.active_devices??[]
    const allDevices=u.all_devices??[]
    if(browser!=='all'&&!activeDevices.some((d:any)=>deviceBrowserBucket(d.browser_name)===browser))return false

    const st=hasST(u),sf=hasF(u)
    if(session==='full'&&!(st&&sf))return false
    if(session==='st'&&!st)return false
    if(session==='f'&&!sf)return false
    if(session==='missing'&&(st&&sf))return false
    if(session==='none'&&(st||sf))return false

    const voucherLabels=(u.voucher_used_rows??[]).map(voucherLabel).filter(Boolean)
    const voucherText=voucherLabels.join(' ').toLowerCase()
    if(voucher==='has'&&!voucherLabels.length)return false
    if(voucher==='none'&&voucherLabels.length)return false
    if(voucher==='freeship'&&!voucherText.includes('free'))return false
    if(voucher==='discount'&&!voucherText.includes('giảm'))return false
    if(voucher==='cashback'&&!(voucherText.includes('hoàn')||voucherText.includes('xu')))return false
    if(voucher.startsWith('tag:')&&!voucherLabels.includes(voucher.slice(4)))return false

    const n=Number(u.order_count??0)
    if(orders==='0'&&n!==0)return false
    if(orders==='1-5'&&(n<1||n>5))return false
    if(orders==='6-10'&&(n<6||n>10))return false
    if(orders==='11+'&&n<11)return false
    if(/^\d+$/.test(orders)&&orders!=='0'&&n!==Number(orders))return false
    if(orders==='21+'&&n<21)return false

    if(queryText){
      const deviceSearch=allDevices.flatMap((d:any)=>[d.device_name,d.browser_name,d.browser_profile]).filter(Boolean)
      const hay=[u.username,u.phone,u.email,u.note,...deviceSearch,...voucherLabels].filter(Boolean).join(' ').toLowerCase()
      if(!hay.includes(queryText))return false
    }
    return true
  }

  const voucherOptions=[...new Set(enriched.flatMap((u:any)=>u.voucher_tags as string[]))]
    .sort((a,b)=>a.localeCompare(b,'vi')).map(tag=>({value:'tag:'+tag,label:tag}))
  const maxOrders=Math.max(5,...enriched.map((u:any)=>Number(u.order_count??0)))
  const orderOptions=Array.from({length:Math.min(20,maxOrders)+1},(_,i)=>({value:String(i),label:i+' đơn'}))
  if(maxOrders>20)orderOptions.push({value:'21+',label:'21+ đơn'})

  const scopeRows=enriched.filter(matchesAccountScope)
  const counts={
    all:scopeRows.length,
    active:scopeRows.filter(x=>x.status==='Active').length,
    error:scopeRows.filter(x=>['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(x.status)).length,
    blocked:scopeRows.filter(x=>x.status==='Blocked').length,
    unknown:scopeRows.filter(x=>x.status==='Không xác định').length,
  }

  let rows=scopeRows.filter((u:any)=>{
    if(state==='active'&&u.status!=='Active')return false
    if(state==='error'&&!['M01','M02','M03','M04','Captcha','Auto Hủy'].includes(u.status))return false
    if(state==='blocked'&&u.status!=='Blocked')return false
    if(state==='unknown'&&u.status!=='Không xác định')return false
    return true
  })

  rows=[...rows].sort((a:any,b:any)=>{
    if(sort==='name_asc')return String(a.username).localeCompare(String(b.username),'vi')
    if(sort==='name_desc')return String(b.username).localeCompare(String(a.username),'vi')
    if(sort==='oldest')return new Date(a.effective_created_at).getTime()-new Date(b.effective_created_at).getTime()
    return new Date(b.effective_created_at).getTime()-new Date(a.effective_created_at).getTime()
  })

  function filterHref(overrides:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    const current:Record<string,string|undefined>={
      q:sp.q,state:state!=='all'?state:undefined,
      session:session!=='all'?session:undefined,voucher:voucher!=='all'?voucher:undefined,
      orders:orders!=='all'?orders:undefined,browser:browser!=='all'?browser:undefined,
      sort:sort!=='newest'?sort:undefined,platform:platform!=='SHOPEE'?platform:undefined,
      range:sp.range,from:sp.range==='custom'?sp.from:undefined,to:sp.range==='custom'?sp.to:undefined,
      user:sp.user,mode:sp.mode,tab:sp.tab,archive:sp.archive,
      order:sp.order,orderTab:sp.orderTab,
    }
    for(const [k,v] of Object.entries(current))if(v)p.set(k,v)
    for(const [k,v] of Object.entries(overrides)){
      if(v===null||v===undefined||v==='all'||v==='')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/purchase/accounts'+(qs?'?'+qs:'')
  }

  const detailParams=new URLSearchParams()
  if(sp.q)detailParams.set('q',sp.q)
  if(state!=='all')detailParams.set('state',state)
  if(session!=='all')detailParams.set('session',session)
  if(voucher!=='all')detailParams.set('voucher',voucher)
  if(orders!=='all')detailParams.set('orders',orders)
  if(browser!=='all')detailParams.set('browser',browser)
  if(sort!=='newest')detailParams.set('sort',sort)
  if(sp.range)detailParams.set('range',sp.range)
  if(sp.range==='custom'&&sp.from)detailParams.set('from',sp.from)
  if(sp.range==='custom'&&sp.to)detailParams.set('to',sp.to)
  if(sp.user)detailParams.set('user',sp.user)
  if(sp.mode)detailParams.set('mode',sp.mode)
  if(sp.tab)detailParams.set('tab',sp.tab)
  if(sp.archive)detailParams.set('archive',sp.archive)
  if(sp.order)detailParams.set('order',sp.order)
  if(sp.orderTab)detailParams.set('orderTab',sp.orderTab)
  const detailQuery=detailParams.toString()

  function contextHref(path:string,extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams()
    if(sp.range)p.set('range',sp.range)
    if(sp.range==='custom'&&sp.from)p.set('from',sp.from)
    if(sp.range==='custom'&&sp.to)p.set('to',sp.to)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return path+(qs?'?'+qs:'')
  }

  function detailHref(extra:Record<string,string|null|undefined>={}){
    const p=new URLSearchParams(detailQuery)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    return '/purchase/accounts?'+p.toString()
  }

  function kpiHref(nextState?:string){
    return filterHref({state:nextState&&nextState!=='all'?nextState:null})
  }

  function selectedOrderHref(order:any){
    return detailHref({
      user:sp.user,
      tab:'orders',
      order:order.id,
      orderTab:'info',
      mode:null,
    })
  }

  function allUserOrdersHref(username:string){
    return contextHref('/purchase/orders',{
      q:username,
      range:'all',
      from:null,
      to:null,
    })
  }

  let selected:any=null
  if(sp.user)selected=enriched.find((x:any)=>x.id===sp.user)??null
  const selectedOutsideFilter=Boolean(selected&&!rows.some((u:any)=>u.id===selected.id))
  const displayRows=selectedOutsideFilter?[selected,...rows]:rows

  let history:any[]=[]
  let userOrders:any[]=[]
  let contextOrder:any=null
  let contextOrderItems:any[]=[]
  let contextOrderVouchers:any[]=[]
  let contextTrackingEvents:any[]=[]
  let contextOrderAudit:any[]=[]
  if(selected&&sp.tab==='history'){
    const h=await supabase.from('audit_logs').select('id,action,old_value,new_value,source,created_at').eq('module','USERS').eq('entity_id',selected.id).order('created_at',{ascending:false}).limit(100)
    history=(h.data??[]) as any[]
  }
  if(selected&&sp.tab==='orders'){
    const o=await supabase.from('orders').select(
      'id,shopee_order_id,order_date,area,destination_hub,cod,receive_status,warehouse_status,order_status,payment_status,recipient_name,recipient_phone,recipient_address,source,archived_at,order_items(sku,product_name,variant,quantity,original_price,final_price),order_vouchers(voucher_tag,voucher_type,voucher_code,voucher_name),shipments(id,tracking_number,carrier,current_tracking_status,is_active)'
    ).eq('erp_user_id',selected.id).order('order_date',{ascending:false}).limit(100)
    userOrders=(o.data??[]) as any[]
  }

  if(selected&&sp.order){
    const [od,it,vo]=await Promise.all([
      supabase.from('orders').select(
        'id,shopee_order_id,erp_user_id,order_date,area,shipping_service,order_status,payment_status,recipient_name,recipient_phone,recipient_address,destination_hub,cod,receive_status,warehouse_status,created_at,updated_at,archived_at,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active,last_track_at,next_track_at,replaced_at)'
      ).eq('id',sp.order).eq('erp_user_id',selected.id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id',sp.order).order('created_at'),
      supabase.from('order_vouchers').select('*').eq('order_id',sp.order).order('created_at'),
    ])
    contextOrder=od.data
    contextOrderItems=(it.data??[]) as any[]
    contextOrderVouchers=(vo.data??[]) as any[]

    const shipmentIds=(contextOrder?.shipments??[]).map((x:any)=>x.id)
    if(sp.orderTab==='tracking'&&shipmentIds.length){
      const ev=await supabase.from('tracking_events')
        .select('id,shipment_id,normalized_status,raw_status,raw_description,raw_location,event_time')
        .in('shipment_id',shipmentIds)
        .order('event_time',{ascending:false})
        .limit(100)
      contextTrackingEvents=(ev.data??[]) as any[]
    }
    if(sp.orderTab==='history'){
      const au=await supabase.from('audit_logs')
        .select('id,module,action,source,created_at')
        .eq('entity_id',sp.order)
        .order('created_at',{ascending:false})
        .limit(100)
      contextOrderAudit=(au.data??[]) as any[]
    }
  }

  const selectedDevices=selected?.all_devices??[]
  const primaryDevice=selectedDevices.find((d:any)=>d.device_key==='manual-primary')??selectedDevices.find((d:any)=>d.is_active)??null
  const selectedVoucherRows=selected?.voucher_used_rows??[]
  const voucherCounts=new Map<string,number>()
  for(const v of selectedVoucherRows){
    const label=voucherLabel(v)
    if(label)voucherCounts.set(label,(voucherCounts.get(label)??0)+1)
  }
  const selectedVoucherSummary=[...voucherCounts.keys()].join(' · ')

  const panelOpen=(canOperate&&sp.mode==='create')||Boolean(selected)
  const isEdit=Boolean(canOperate&&selected&&sp.mode==='edit'&&!selected.archived_at)
  const filtersActive=Boolean(queryText||state!=='all'||session!=='all'||voucher!=='all'||orders!=='all'||browser!=='all'||sort!=='newest')

  return <div className="account-screen">
    <header className="page-head entity-page-head">
      <div>
        <span className="module-eyebrow">MUA HÀNG</span>
        <h1>Tài khoản mua hàng</h1>
        <p>Tài khoản, thiết bị hoạt động, đơn hàng và voucher đã sử dụng</p>
      </div>
      <div className="head-actions">
        <span className="platform-badge">SHOPEE</span>
        {canOperate&&<UserBulkImport/>}
        {canOperate&&<Link className="button primary" href={filterHref({mode:'create',user:null,tab:null,archive:null})}>+ Thêm tài khoản</Link>}
      </div>
    </header>

    <section className="account-kpi-grid compact entity-status-strip">
      <Link className={`account-kpi entity-status-metric ${state==='all'?'active':''}`} href={kpiHref('all')}><span>Tất cả</span><b>{counts.all}</b></Link>
      <Link className={`account-kpi entity-status-metric success ${state==='active'?'active':''}`} href={kpiHref('active')}><span>Hoạt động</span><b>{counts.active}</b></Link>
      <Link className={`account-kpi entity-status-metric warning ${state==='error'?'active':''}`} href={kpiHref('error')}><span>Cần xử lý</span><b>{counts.error}</b></Link>
      <Link className={`account-kpi entity-status-metric danger ${state==='blocked'?'active':''}`} href={kpiHref('blocked')}><span>Đã khóa</span><b>{counts.blocked}</b></Link>
      <Link className={`account-kpi entity-status-metric ${state==='unknown'?'active':''}`} href={kpiHref('unknown')}><span>Không xác định</span><b>{counts.unknown}</b></Link>
    </section>

    <form className="account-filter-bar one-line entity-command-bar entity-user-command" action="/purchase/accounts">
      <input className="search" name="q" defaultValue={sp.q??''} placeholder="Tìm User / SĐT / Email / máy / voucher"/>
      <AccountFilterDropdown name="browser" value={browser} label="Browser" options={[
        {value:'all',label:'Browser: Tất cả'},
        {value:'chrome',label:'Chrome'},{value:'safari',label:'Safari'},
        {value:'edge',label:'Edge'},{value:'app',label:'Shopee App'},
        {value:'other',label:'Khác'},
      ]}/>
      <AccountFilterDropdown name="session" value={session} label="SPC" options={[
        {value:'all',label:'SPC: Tất cả'},
        {value:'full',label:'Đủ ST + F'},{value:'st',label:'Có SPC_ST'},
        {value:'f',label:'Có SPC_F'},{value:'missing',label:'Thiếu SPC'},
        {value:'none',label:'Không SPC'},
      ]}/>
      <AccountFilterDropdown name="orders" value={orders} label="Số đơn" options={[
        {value:'all',label:'Số đơn: Tất cả'},
        ...orderOptions,
      ]}/>
      <AccountFilterDropdown name="voucher" value={voucher} label="Tag voucher" options={[
        {value:'all',label:'Tag: Tất cả'},
        {value:'none',label:'Chưa dùng voucher'},
        ...voucherOptions,
      ]}/>
      {state!=='all'&&<input type="hidden" name="state" value={state}/>}
      {sort!=='newest'&&<input type="hidden" name="sort" value={sort}/>}
      {sp.range&&<input type="hidden" name="range" value={sp.range}/>}
      {sp.range==='custom'&&sp.from&&<input type="hidden" name="from" value={sp.from}/>}
      {sp.range==='custom'&&sp.to&&<input type="hidden" name="to" value={sp.to}/>}
      {sp.user&&<input type="hidden" name="user" value={sp.user}/>}
      {sp.mode&&<input type="hidden" name="mode" value={sp.mode}/>}
      {sp.tab&&<input type="hidden" name="tab" value={sp.tab}/>}
      {sp.archive&&<input type="hidden" name="archive" value={sp.archive}/>}
      {sp.order&&<input type="hidden" name="order" value={sp.order}/>}
      {sp.orderTab&&<input type="hidden" name="orderTab" value={sp.orderTab}/>}
      <button className="button primary small">Lọc</button>
      {filtersActive&&<Link className="button small filter-clear" href={filterHref({
        q:null,state:null,device:null,session:null,voucher:null,orders:null,browser:null,sort:null,platform:null,
      })}>×</Link>}
      <div className="archive-view-toggle">
        <Link className={!archiveView?'active':''} href={filterHref({archive:null,user:null,mode:null,tab:null})}>Đang dùng</Link>
        <Link className={archiveView?'active':''} href={filterHref({archive:'archived',user:null,mode:null,tab:null})}>Đã lưu trữ</Link>
      </div>
      <div className="entity-result-meta"><b>{rows.length}</b><span>/ {counts.all} User{selectedOutsideFilter?' · +1 đang mở':''}</span></div>
      <div id="p1-account-filter-actions" className="p1-account-filter-actions"/>
    </form>

    <div className={`split-view account-workspace ${panelOpen?'with-panel':''}`}>
      <section className="account-list-pane">
        {error&&<div className="error-box">Không thể tải dữ liệu tài khoản: {error.message}</div>}
        {!error&&<PurchaseAccountTable
          rows={displayRows}
          selectedId={selected?.id}
          detailQuery={detailQuery}
          sort={sort}
          canManage={canOperate}
        />} 
      </section>

      {canOperate&&sp.mode==='create'&&
        <SystemSlidebar className="detail-panel account-detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">TÀI KHOẢN MUA HÀNG</span><h2>Thêm tài khoản</h2></div>
            <Link className="close" href={filterHref({mode:null,user:null,tab:null})}>×</Link>
          </div>
          <form action={createERPUser} className="panel-form panel-scroll">
            <input type="hidden" name="return_query" value={detailQuery}/>
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Username<input name="username" required/></label>
              <div className="form-grid"><label>Số điện thoại<input name="phone"/></label><label>Email<input name="email" type="email"/></label></div>
              <label>Trạng thái<select name="status" defaultValue="Active">{['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
            </section>
            <section className="form-section">
              <h3>Đăng nhập & phiên</h3>
              <label>Mật khẩu<input name="password" type="password" autoComplete="new-password"/></label>
              <label>SPC_ST<textarea name="spc_st" rows={2}/></label>
              <label>SPC_F<textarea name="spc_f" rows={2}/></label>
            </section>
            <section className="form-section">
              <h3>Thiết bị đang hoạt động</h3>
              <label>Tên máy<input name="device_name" placeholder="Ví dụ: MacBook M1 · Máy mua 01"/></label>
              <div className="form-grid">
                <label>Loại<select name="device_type" defaultValue="DESKTOP"><option value="DESKTOP">Máy tính</option><option value="MOBILE">Điện thoại</option><option value="BROWSER_PROFILE">Browser Profile</option></select></label>
                <label>Browser<input name="browser_name" placeholder="Chrome"/></label>
              </div>
              <label>Profile<input name="browser_profile" placeholder="Profile A / NST Profile..."/></label>
              <label>Ghi chú<textarea name="note" rows={2}/></label>
            </section>
            <div className="form-actions"><Link className="button" href={filterHref({mode:null,user:null,tab:null})}>Hủy</Link><button className="button primary">Tạo tài khoản</button></div>
          </form>
        </SystemSlidebar>
      }

      {selected&&!isEdit&&contextOrder&&
        <ContextOrderPanel
          order={contextOrder}
          items={contextOrderItems}
          vouchers={contextOrderVouchers}
          trackingEvents={contextTrackingEvents}
          auditRows={contextOrderAudit}
          activeTab={sp.orderTab==='tracking'?'tracking':sp.orderTab==='history'?'history':'info'}
          backHref={sp.orderTab==='tracking'||sp.orderTab==='history'
            ? detailHref({user:selected.id,tab:'orders',order:contextOrder.id,orderTab:'info'})
            : detailHref({user:selected.id,tab:'orders',order:null,orderTab:null})}
          closeHref={filterHref({user:null,mode:null,tab:null,order:null,orderTab:null})}
          infoHref={detailHref({user:selected.id,tab:'orders',order:contextOrder.id,orderTab:'info'})}
          trackingHref={detailHref({user:selected.id,tab:'orders',order:contextOrder.id,orderTab:'tracking'})}
          historyHref={detailHref({user:selected.id,tab:'orders',order:contextOrder.id,orderTab:'history'})}
          openModuleHref={contextHref('/purchase/orders',{
            order:contextOrder.id,
            range:'all',
            archive:contextOrder.archived_at?'archived':null,
          })}
        />
      }

      {selected&&!isEdit&&!contextOrder&&
        <SystemSlidebar className="detail-panel account-detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">CHI TIẾT USER</span><h2>{selected.username}</h2></div>
            <Link className="close" href={filterHref({user:null,mode:null,tab:null})}>×</Link>
          </div>
          <div className="panel-tabs user-panel-tabs">
            <Link className={!sp.tab||sp.tab==='info'?'active':''} href={detailHref({user:selected.id,tab:'info'})}>Thông tin</Link>
            <Link className={sp.tab==='orders'?'active':''} href={detailHref({user:selected.id,tab:'orders'})}>Đơn hàng <span>{selected.order_count??0}</span></Link>
            <Link className={sp.tab==='history'?'active':''} href={detailHref({user:selected.id,tab:'history'})}>Lịch sử</Link>
          </div>
          <div className="panel-scroll">
            {(!sp.tab||sp.tab==='info')&&<>
              <div className="detail-grid compact-detail-grid">
                <div><span>Username</span><b>{selected.username}</b></div>
                <div><span>Trạng thái</span><b>{selected.archived_at?'Đã lưu trữ':statusLabel(selected.status)}</b></div>
                <div><span>SĐT</span><b>{formatPhone(selected.phone)}</b></div>
                <div><span>Email</span><b>{selected.email??'—'}</b></div>
                <div><span>SPC_ST</span><b>{hasST(selected)?'Đã có':'Chưa có'}</b></div>
                <div><span>SPC_F</span><b>{hasF(selected)?'Đã có':'Chưa có'}</b></div>
                <div><span>Số đơn</span><b>{selected.order_count??0} đơn</b></div>
                <div><span>Ngày tạo</span><b title="Lấy thời gian đặt đơn sớm hơn khi có đơn trước ngày nhập tài khoản">{formatDateTime(selected.effective_created_at??selected.created_at)}</b></div>
                {selected.archived_at&&<div><span>Lưu trữ lúc</span><b>{formatDateTime(selected.archived_at)}</b></div>}
              </div>

              <div className="panel-section-head"><div><h3>Thiết bị hoạt động</h3><span>{selectedDevices.filter((d:any)=>d.is_active).length} active / {selectedDevices.length} đã ghi nhận</span></div></div>
              <div className="device-card-scroll">
                {!selectedDevices.length
                  ? <div className="empty compact">Chưa ghi nhận thiết bị.</div>
                  : selectedDevices.map((d:any)=><div className={`device-activity-card ${d.is_active?'active':''}`} key={d.id}>
                      <div className="device-activity-main">
                        <div><b>{d.device_name}</b><span>{deviceTypeLabel(d.device_type)}</span></div>
                        <span className={`device-live-dot ${d.is_active?'on':''}`}>{d.is_active?'Đang hoạt động':'Ngừng hoạt động'}</span>
                      </div>
                      <div className="device-activity-meta">
                        <span>Browser <b>{d.browser_name??'—'}</b></span>
                        <span>Profile <b>{d.browser_profile??'—'}</b></span>
                        <span>Hoạt động gần nhất <b>{formatDateTime(d.last_seen_at)}</b></span>
                      </div>
                    </div>)}
              </div>

              <div className="panel-section-head voucher-section-title"><div><h3>Voucher đã dùng</h3><span>Tự tổng hợp từ đơn hàng của User</span></div></div>
              <div className="voucher-usage-box">
                <VoucherTags value={selectedVoucherSummary}/>
                {!!voucherCounts.size&&<div className="voucher-counts">{[...voucherCounts.entries()].map(([label,count])=><span key={label}>{label} <b>×{count}</b></span>)}</div>}
              </div>

              <div className="panel-note-row"><span>Ghi chú</span><b>{selected.note??'—'}</b></div>
              <div className="panel-action-row split-actions">
                {canOperate&&!selected.archived_at&&selected.status!=='Blocked'&&<Link className="button" href={contextHref('/purchase/orders',{mode:'create',user:selected.id})}>+ Tạo đơn</Link>}
                {canOperate&&!selected.archived_at&&<Link className="button primary" href={detailHref({user:selected.id,mode:'edit'})}>Sửa tài khoản</Link>}
              </div>

              {canOperate&&<div className={'record-lifecycle-zone '+(selected.archived_at?'archived':'')}>
                {!selected.archived_at
                  ? <form action={archiveERPUser} className="record-lifecycle-action">
                      <input type="hidden" name="user_id" value={selected.id}/>
                      <input type="hidden" name="return_query" value={detailQuery}/>
                      <div><b>Lưu trữ User</b><span>Ẩn khỏi danh sách sử dụng và không cho chọn khi tạo đơn. Có thể khôi phục.</span></div>
                      <button className="button archive-button" type="submit">Lưu trữ</button>
                    </form>
                  : <>
                      <form action={restoreERPUser} className="record-lifecycle-action">
                        <input type="hidden" name="user_id" value={selected.id}/>
                        <input type="hidden" name="return_query" value={detailQuery}/>
                        <div><b>User đang lưu trữ</b><span>Đơn hàng và toàn bộ lịch sử vẫn được giữ.</span></div>
                        <button className="button primary" type="submit">Khôi phục</button>
                      </form>

                    </>}
              </div>}
            </>}

            {sp.tab==='orders'&&<>
              <div className="panel-section-head">
                <div><h3>Đơn hàng của User</h3><span>{userOrders.length} đơn · chi tiết sản phẩm, voucher, giao nhận</span></div>
                <Link className="button small" href={allUserOrdersHref(selected.username)}>Mở module Đơn ↗</Link>
              </div>
              <div className="user-order-list detailed">
                {!userOrders.length
                  ? <div className="empty compact">User này chưa có đơn hàng.</div>
                  : userOrders.map((o:any)=>{
                      const s=activeShipment(o)
                      const voucherText=(o.order_vouchers??[]).map(voucherLabel).filter(Boolean).join(' · ')
                      return <Link className="user-order-card detailed" href={selectedOrderHref(o)} key={o.id}>
                        <div className="user-order-card-top">
                          <div><b>{o.shopee_order_id??o.id.slice(0,8)}</b><span>{formatDateTime(o.order_date)} · {o.area??'Chưa rõ khu vực'}</span></div>
                          <strong>{formatMoney(o.cod)}</strong>
                        </div>

                        <div className="order-detail-strip">
                          <span>Đơn <b>{statusLabel(o.order_status)}</b></span>
                          <span>Thanh toán <b>{statusLabel(o.payment_status)}</b></span>
                          <span>Nhận <b>{statusLabel(o.receive_status)}</b></span>
                        </div>

                        <div className="user-order-products">
                          {(o.order_items??[]).map((it:any,i:number)=><div key={i}>
                            <span>{it.product_name??'Sản phẩm'}{it.variant?' · '+it.variant:''}</span>
                            <b>{it.sku??'—'} · ×{it.quantity??1} · {formatMoney(it.final_price??it.original_price)}</b>
                          </div>)}
                        </div>

                        <div className="user-order-recipient">
                          <span>{o.recipient_name??'—'} · {formatPhone(o.recipient_phone)}</span>
                          <small>{o.recipient_address??'—'}</small>
                        </div>

                        <div className="user-order-shipping">
                          <div><span>MVĐ</span><b>{s?.tracking_number??'Chưa có'}</b><small>{s?.carrier??'—'} · {o.destination_hub??'Chưa rõ kho đích'}</small></div>
                          <span className={`status-pill status-${String(s?.current_tracking_status??'UNKNOWN').toLowerCase()}`}>{statusLabel(s?.current_tracking_status)}</span>
                          {o.archived_at&&<span className="status-pill archived">Lưu trữ</span>}
                        </div>

                        {voucherText&&<VoucherTags value={voucherText}/>}
                      </Link>
                    })}
              </div>
            </>}

            {sp.tab==='history'&&<>
              <h3>Lịch sử User</h3>
              <div className="timeline user-history-scroll">
                {!history.length
                  ? <div className="empty compact">Chưa có lịch sử thay đổi.</div>
                  : history.map((h:any)=><div className="timeline-item" key={h.id}><i></i><div><b>{actionLabels[h.action]??h.action}</b><span>{sourceLabel(h.source)}</span><small>{formatDateTime(h.created_at)}</small></div></div>)}
              </div>
            </>}
          </div>
        </SystemSlidebar>
      }

      {selected&&isEdit&&
        <SystemSlidebar className="detail-panel account-detail-panel">
          <div className="panel-head">
            <div><span className="eyebrow">TÀI KHOẢN MUA HÀNG</span><h2>Sửa {selected.username}</h2></div>
            <Link className="close" href={detailHref({user:selected.id,mode:null})}>×</Link>
          </div>
          <form action={updateERPUser} className="panel-form panel-scroll">
            <input type="hidden" name="return_query" value={detailQuery}/>
            <input type="hidden" name="user_id" value={selected.id}/>
            <section className="form-section">
              <h3>Thông tin tài khoản</h3>
              <label>Username<input name="username" required defaultValue={selected.username}/></label>
              <div className="form-grid"><label>Số điện thoại<input name="phone" defaultValue={selected.phone??''}/></label><label>Email<input name="email" type="email" defaultValue={selected.email??''}/></label></div>
              <label>Trạng thái<select name="status" defaultValue={selected.status}>{['Active','M01','M02','M03','M04','Captcha','Auto Hủy','Blocked','Không xác định'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
            </section>
            <section className="form-section">
              <h3>Đăng nhập & phiên</h3>
              <div className="secret-state">SPC_ST: <b>{hasST(selected)?'Đã có':'Chưa có'}</b> · SPC_F: <b>{hasF(selected)?'Đã có':'Chưa có'}</b></div>
              <label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_ST mới<textarea name="spc_st" rows={2} placeholder="Để trống nếu không đổi"/></label>
              <label>SPC_F mới<textarea name="spc_f" rows={2} placeholder="Để trống nếu không đổi"/></label>
            </section>
            <section className="form-section">
              <h3>Thiết bị chính</h3>
              <label>Tên máy<input name="device_name" defaultValue={primaryDevice?.device_name??''} placeholder="MacBook M1 · Máy mua 01"/></label>
              <div className="form-grid">
                <label>Loại<select name="device_type" defaultValue={primaryDevice?.device_type??'DESKTOP'}><option value="DESKTOP">Máy tính</option><option value="MOBILE">Điện thoại</option><option value="BROWSER_PROFILE">Browser Profile</option></select></label>
                <label>Browser<input name="browser_name" defaultValue={primaryDevice?.browser_name??selected.browser_name??''}/></label>
              </div>
              <label>Profile<input name="browser_profile" defaultValue={primaryDevice?.browser_profile??''}/></label>
              <label>Ghi chú<textarea name="note" rows={2} defaultValue={selected.note??''}/></label>
            </section>
            <div className="form-actions"><Link className="button" href={detailHref({user:selected.id,mode:null})}>Hủy</Link><button className="button primary">Lưu thay đổi</button></div>
          </form>
        </SystemSlidebar>
      }
    </div>
  </div>
}
