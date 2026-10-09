'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {isTrackingQuietNow,msToQuietBoundary,NOTIFICATION_POLL_MS} from '@/lib/notification-quiet-hours'

type Step={id:string;type:string;label:string;created_at:string;is_read:boolean;reason:string|null}
type ProductSummary={product_name:string;variant:string|null;quantity:number}
type Notice={
  id:string;source:'tracking'|'system';category:string;severity:'info'|'warning'|'critical';
  title:string;message:string;event_type:string;created_at:string;is_read:boolean;
  requires_action:boolean;is_resolved:boolean;legacy_ids:string[];notification_id:string|null;
  order_id:string|null;order_code?:string;destination_hub:string;group_count:number;
  target_path:string|null;timeline?:Step[];
  username?:string|null;cod?:number|null;recipient_name?:string|null;
  recipient_phone?:string|null;recipient_address?:string|null;tracking_number?:string|null;
  carrier?:string|null;products?:ProductSummary[];receive_status?:string;
}
type Feed={
  items:Notice[];total:number;unread_total:number;action_total:number;
  migration_pending?:boolean
}
type Filter='unread'|'action'|'all'
const empty:Feed={items:[],total:0,unread_total:0,action_total:0}
const preference='mynh-erp-in-app-notifications-enabled'
const runtimeKey='mynh-erp-tracking-runtime'

function BellIcon(){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/>
    <path d="M10 20h4"/>
  </svg>
}
function CloseIcon(){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18"/>
  </svg>
}
function CheckIcon(){
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
}
function tone(row:Notice){
  if(row.severity==='critical')return 'danger'
  if(row.event_type==='DELIVERED')return 'success'
  if(row.event_type==='OUT_FOR_DELIVERY'||row.severity==='info')return 'info'
  return 'warning'
}
function when(value:string){
  try{return new Intl.DateTimeFormat('vi-VN',{
    timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',
    hour:'2-digit',minute:'2-digit',
  }).format(new Date(value))}catch{return value}
}
function safeTarget(row:Notice){
  if(row.source==='system'){
    const path=row.target_path??''
    return path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\')&&!path.includes('\n')
      &&!path.includes('\r')?path:null
  }
  if(row.order_id)return '/purchase/orders?order='+encodeURIComponent(row.order_id)
  const q=new URLSearchParams({status:row.event_type})
  if(row.destination_hub)q.set('hub',row.destination_hub)
  return '/purchase/tracking?'+q.toString()
}

export function InAppAlertCenter({
  role='viewer',trackingEnabled:initialTrackingEnabled,
  quietStart:initialQuietStart,quietEnd:initialQuietEnd,
}:{role?:string;trackingEnabled:boolean;quietStart:string;quietEnd:string}){
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [filter,setFilter]=useState<Filter>('all')
  const [hub,setHub]=useState('all')
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const listRef=useRef<HTMLDivElement|null>(null)
  const listScroll=useRef(0)
  const [expanded,setExpanded]=useState<string[]>([])
  const [feed,setFeed]=useState<Feed>(empty)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [pending,setPending]=useState(false)
  const [notificationsEnabled,setNotificationsEnabled]=useState<boolean|null>(null)
  const [trackingEnabled,setTrackingEnabled]=useState(initialTrackingEnabled)
  const [quietStart,setQuietStart]=useState(initialQuietStart)
  const [quietEnd,setQuietEnd]=useState(initialQuietEnd)
  const quietRef=useRef({start:quietStart,end:quietEnd})
  quietRef.current={start:quietStart,end:quietEnd}
  const enabledRef=useRef(false)
  enabledRef.current=notificationsEnabled===true&&trackingEnabled===true
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const lastRequestAt=useRef(0)
  const nextAllowedAt=useRef(0)
  const requestInFlight=useRef(false)
  const pendingRequest=useRef<AbortController|null>(null)
  const canResolve=role==='admin'||role==='operator'

  const load=useCallback(async()=>{
    if(!enabledRef.current||requestInFlight.current)return
    if(isTrackingQuietNow(new Date(),quietRef.current.start,quietRef.current.end))return
    const now=Date.now()
    if(now<nextAllowedAt.current||now-lastRequestAt.current<NOTIFICATION_POLL_MS)return
    requestInFlight.current=true
    lastRequestAt.current=now
    const controller=new AbortController()
    pendingRequest.current=controller
    try{
      // Fetch a page once on the configured 5-minute schedule.
      // Changing the three status tabs and expanding history is 100% local.
      const response=await fetch('/api/alerts/in-app?view=all&category=all&limit=40&offset=0',
        {cache:'no-store',signal:controller.signal})
      if(!enabledRef.current||controller.signal.aborted||
        isTrackingQuietNow(new Date(),quietRef.current.start,quietRef.current.end))return
      if(response.status===429||response.status===503){
        nextAllowedAt.current=Date.now()+900000
        setError('Dịch vụ đang giới hạn request; sẽ tự thử lại sau.')
        return
      }
      if(!response.ok){
        nextAllowedAt.current=Date.now()+300000
        setError('Không tải được thông báo.')
        return
      }
      const body:unknown=await response.json()
      if(!body||typeof body!=='object'||Array.isArray(body))return
      const value=body as Partial<Feed>
      setFeed({
        items:Array.isArray(value.items)?value.items:[],
        total:Math.max(0,Number(value.total)||0),
        unread_total:Math.max(0,Number(value.unread_total)||0),
        action_total:Math.max(0,Number(value.action_total)||0),
        migration_pending:value.migration_pending===true,
      })
      setError('')
    }catch{
      if(!controller.signal.aborted){
        nextAllowedAt.current=Date.now()+300000
        setError('Không kết nối được trung tâm thông báo.')
      }
    }finally{
      if(pendingRequest.current===controller)pendingRequest.current=null
      requestInFlight.current=false
      if(enabledRef.current)setLoading(false)
    }
  },[])

  useEffect(()=>{
    setTrackingEnabled(initialTrackingEnabled)
    setQuietStart(initialQuietStart)
    setQuietEnd(initialQuietEnd)
  },[initialTrackingEnabled,initialQuietStart,initialQuietEnd])

  useEffect(()=>{
    const apply=(payload:unknown)=>{
      if(!payload||typeof payload!=='object')return
      const value=payload as {enabled?:boolean;quietStart?:string;quietEnd?:string}
      const start=value.quietStart??quietRef.current.start
      const end=value.quietEnd??quietRef.current.end
      setTrackingEnabled(value.enabled===true)
      setQuietStart(start);setQuietEnd(end)
      if(value.enabled!==true||isTrackingQuietNow(new Date(),start,end))
        pendingRequest.current?.abort()
    }
    const changed=(event:Event)=>apply((event as CustomEvent).detail)
    const stored=(event:StorageEvent)=>{
      if(event.key!==runtimeKey||!event.newValue)return
      try{apply(JSON.parse(event.newValue))}catch{/* ignore invalid state */}
    }
    window.addEventListener('mynh-erp-tracking-changed',changed)
    window.addEventListener('storage',stored)
    return()=>{
      window.removeEventListener('mynh-erp-tracking-changed',changed)
      window.removeEventListener('storage',stored)
    }
  },[])

  useEffect(()=>{
    try{setNotificationsEnabled(window.localStorage.getItem(preference)!=='off')}
    catch{setNotificationsEnabled(true)}
    const sync=(event:StorageEvent)=>{
      if(event.key!==preference)return
      setNotificationsEnabled(event.newValue!=='off')
      if(event.newValue==='off')pendingRequest.current?.abort()
    }
    window.addEventListener('storage',sync)
    return()=>window.removeEventListener('storage',sync)
  },[])

  useEffect(()=>{
    if(timer.current){clearTimeout(timer.current);timer.current=null}
    if(notificationsEnabled!==true||trackingEnabled!==true){
      pendingRequest.current?.abort()
      setFeed(empty)
      setLoading(false)
      return
    }
    lastRequestAt.current=0
    nextAllowedAt.current=0
    let stopped=false
    const schedule=()=>{
      if(timer.current)clearTimeout(timer.current)
      if(stopped||!enabledRef.current)return
      const at=new Date()
      const {start,end}=quietRef.current
      if(isTrackingQuietNow(at,start,end)){
        pendingRequest.current?.abort()
        timer.current=setTimeout(()=>void tick(),msToQuietBoundary(at,'end',start,end))
        return
      }
      const next=Math.max(lastRequestAt.current+NOTIFICATION_POLL_MS,nextAllowedAt.current)
      const delay=Math.max(0,next-at.getTime(),requestInFlight.current?1000:0)
      timer.current=setTimeout(()=>void tick(),Math.min(delay,msToQuietBoundary(at,'start',start,end)))
    }
    const tick=async()=>{
      if(stopped||!enabledRef.current)return
      if(isTrackingQuietNow(new Date(),quietRef.current.start,quietRef.current.end)){
        pendingRequest.current?.abort()
        schedule()
        return
      }
      await load()
      schedule()
    }
    document.addEventListener('visibilitychange',tick)
    void tick()
    return()=>{
      stopped=true
      if(timer.current){clearTimeout(timer.current);timer.current=null}
      document.removeEventListener('visibilitychange',tick)
    }
  },[notificationsEnabled,trackingEnabled,quietStart,quietEnd,load])

  function toggleNotifications(){
    const next=notificationsEnabled!==true
    enabledRef.current=next&&trackingEnabled
    if(!next){pendingRequest.current?.abort();setFeed(empty);setLoading(false)}
    else setLoading(true)
    try{window.localStorage.setItem(preference,next?'on':'off')}
    catch{/* session-only fallback */}
    setNotificationsEnabled(next)
  }

  useEffect(()=>{
    if(!open)return
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!pending)setOpen(false)}
    window.addEventListener('keydown',close)
    return()=>window.removeEventListener('keydown',close)
  },[open,pending])

  const unread=notificationsEnabled&&trackingEnabled?feed.unread_total:0
  const actionCount=notificationsEnabled&&trackingEnabled?feed.action_total:0
  const hubs=useMemo(()=>[...new Set(feed.items
    .filter(row=>row.source==='tracking'&&row.receive_status!=='RECEIVED')
    .map(row=>row.destination_hub.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')),
    [feed.items])
  const visible=useMemo(()=>feed.items.filter(row=>
    (filter==='all'||(filter==='unread'&&!row.is_read)||
      (filter==='action'&&row.requires_action&&!row.is_resolved))&&
    (hub==='all'||(hub==='unknown'
      ?row.source==='tracking'&&row.receive_status!=='RECEIVED'&&!row.destination_hub
      :row.source==='tracking'&&row.receive_status!=='RECEIVED'&&row.destination_hub===hub))
  ),[feed.items,filter,hub])
  const selectedNotice=feed.items.find(row=>row.id===selectedId)??null
  useEffect(()=>{
    if(!selectedId&&listRef.current)listRef.current.scrollTop=listScroll.current
  },[selectedId])
  function openDetail(row:Notice){
    listScroll.current=listRef.current?.scrollTop??0
    setSelectedId(row.id)
  }
  function backToList(){setSelectedId(null)}
  const money=(v:number|null|undefined)=>v===null||v===undefined||!Number.isFinite(v)
    ?'Chưa có':new Intl.NumberFormat('vi-VN').format(v)+'₫'

  async function changeStatus(body:Record<string,unknown>){
    if(!enabledRef.current||isTrackingQuietNow(new Date(),quietRef.current.start,quietRef.current.end))
      throw Error('Thông báo đang nghỉ theo lịch Tracking')
    const res=await fetch('/api/alerts/in-app',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(body),
    })
    if(!res.ok)throw Error('Không lưu được thao tác thông báo')
  }
  async function mark(row:Notice){
    if(row.is_read||pending)return
    setPending(true)
    try{
      await changeStatus(row.source==='tracking'
        ?{action:'read',source:'tracking',alert_ids:row.legacy_ids}
        :{action:'read',source:'system',notification_id:row.notification_id})
      setFeed(current=>({...current,
        items:current.items.map(x=>x.id===row.id?{...x,is_read:true}:x),
        unread_total:Math.max(0,current.unread_total-1),
      }))
      setError('')
    }catch{setError('Không thể đánh dấu đã đọc.')}
    finally{setPending(false)}
  }
  async function markAll(){
    if(!unread||pending)return
    setPending(true)
    try{
      await changeStatus({action:'read_all'})
      setFeed(current=>({...current,unread_total:0,
        items:current.items.map(x=>({...x,is_read:true}))}))
      setError('')
    }catch{setError('Không thể đánh dấu đã đọc tất cả.')}
    finally{setPending(false)}
  }
  async function resolve(row:Notice){
    if(!canResolve||row.source!=='system'||!row.notification_id||pending)return
    setPending(true)
    try{
      await changeStatus({action:'resolve',source:'system',notification_id:row.notification_id})
      setFeed(current=>({...current,
        items:current.items.map(x=>x.id===row.id?{...x,is_resolved:true,is_read:true}:x),
        action_total:Math.max(0,current.action_total-1),
        unread_total:Math.max(0,current.unread_total-(row.is_read?0:1)),
      }))
      setError('')
    }catch{setError('Không thể đánh dấu đã xử lý.')}
    finally{setPending(false)}
  }
  async function openAlert(row:Notice){
    const destination=safeTarget(row)
    if(!destination){setError('Chưa có trang chi tiết cho thông báo này.');return}
    // Navigation remains available in quiet hours; only alert API calls pause.
    if(!row.is_read&&enabledRef.current&&
      !isTrackingQuietNow(new Date(),quietRef.current.start,quietRef.current.end))
      await mark(row)
    setOpen(false)
    router.push(destination)
  }

  return <>
    <button type="button" className={'sidebar-alert-trigger'+(unread?' has-unread':'')}
      aria-label={'Thông báo'+(unread?' · '+unread+' chưa đọc':'')}
      onClick={()=>setOpen(true)}>
      <BellIcon/>
      {unread>0&&<span className="sidebar-alert-badge">{unread>99?'99+':unread}</span>}
    </button>

    {open&&<>
      <button type="button" className="app-alert-backdrop app-alert-backdrop-v2"
        aria-label="Đóng thông báo" onClick={()=>{if(!pending)setOpen(false)}}/>
      {/* Existing Desktop Preview slidebar geometry and CSS classes unchanged. */}
      <aside className="app-alert-panel app-alert-panel-v2 neo-soft-v1" aria-label="Thông báo trong ứng dụng">
        <header className="app-alert-panel-head-v2">
          <div className="app-alert-panel-title-v2">
            <span className="app-alert-panel-icon-v2"><BellIcon/></span>
            <div><h2>Thông báo</h2><p>Cập nhật đơn hàng theo HUB</p></div>
          </div>
          <div className="app-alert-panel-actions-v2">
            {unread>0&&<button type="button" className="app-alert-mark-all-v2"
              disabled={pending} onClick={()=>void markAll()}>
              <CheckIcon/><span>Đọc tất cả</span>
            </button>}
            <button type="button" className="app-alert-close-v2"
              onClick={()=>setOpen(false)} disabled={pending} aria-label="Đóng"><CloseIcon/></button>
          </div>
        </header>


        <div className="neo-soft-topzone">
          {selectedNotice? <div className="neo-soft-detail-nav">
            <button type="button" onClick={backToList} aria-label="Quay lại thông báo">
              <span aria-hidden="true">←</span> Danh sách thông báo
            </button>
            <span>Chi tiết đơn</span>
          </div>:<>
            <div className="app-alert-tabs-v2 neo-soft-tabs" aria-label="Lọc trạng thái thông báo">
              <button type="button" className={filter==='all'?'active':''}
                onClick={()=>setFilter('all')}>Tất cả <span>{feed.total}</span></button>
              <button type="button" className={filter==='action'?'active':''}
                onClick={()=>setFilter('action')}>Cần xử lý <span>{actionCount}</span></button>
              <button type="button" className={filter==='unread'?'active':''}
                onClick={()=>setFilter('unread')}>Chưa đọc <span>{unread}</span></button>
            </div>
            <div className="neo-soft-hub-line">
              <label htmlFor="neo-soft-hub-select">Lọc HUB</label>
              <select id="neo-soft-hub-select" value={hub} onChange={e=>setHub(e.target.value)}>
                <option value="all">Tất cả HUB</option>
                {hubs.map(x=><option key={x} value={x}>{x}</option>)}
                <option value="unknown">Chưa xác định HUB</option>
              </select>
              <span className="neo-soft-result-count">{visible.length} đơn</span>
            </div>
          </>}
        </div>

        <div ref={listRef} className="app-alert-list app-alert-list-v2 neo-soft-content">
          {error&&<div role="alert" className="neo-soft-error">{error}</div>}
          {!trackingEnabled
            ?<div className="app-alert-empty app-alert-empty-v2">Auto Tracking đang tắt. Không gọi API thông báo.</div>
            :notificationsEnabled===false
            ?<div className="app-alert-empty app-alert-empty-v2">Thông báo đã tắt. Không gửi yêu cầu cập nhật.</div>
            :loading
            ?<div className="app-alert-empty app-alert-empty-v2">Đang tải thông báo…</div>
            :selectedNotice
            ?<div className="neo-soft-detail">
              <div className="neo-soft-detail-intro">
                <span className={'neo-soft-status neo-soft-status-'+tone(selectedNotice)}>{selectedNotice.title}</span>
                <h3>{selectedNotice.order_code??selectedNotice.message??'Thông báo hệ thống'}</h3>
                <p>{selectedNotice.receive_status==='RECEIVED'
                  ?'Đã nhận — không nhóm theo HUB'
                  :selectedNotice.destination_hub||'Chưa xác định HUB'}</p>
              </div>
              <section className="neo-soft-detail-section" aria-label="Tổng quan đơn hàng">
                <div className="neo-soft-section-title">Thông tin đơn hàng</div>
                <dl className="neo-soft-kv">
                  <div><dt>Username</dt><dd>{selectedNotice.username||'Chưa có'}</dd></div>
                  <div><dt>COD</dt><dd className="neo-soft-money">{money(selectedNotice.cod)}</dd></div>
                  <div><dt>ĐVVC</dt><dd>{selectedNotice.carrier||'Chưa có'}</dd></div>
                  <div><dt>Mã vận đơn</dt><dd>{selectedNotice.tracking_number||'Chưa có'}</dd></div>
                  <div><dt>Trạng thái nhận</dt><dd>{selectedNotice.receive_status==='WAITING_RECEIVE'
                    ?'Chờ xác nhận nhận hàng':selectedNotice.receive_status==='RECEIVED'
                    ?'Đã nhận':'Chưa nhận hàng'}</dd></div>
                </dl>
              </section>
              {selectedNotice.source==='tracking'&&<section className="neo-soft-detail-section">
                <div className="neo-soft-section-title">Sản phẩm</div>
                {selectedNotice.products?.length
                  ?selectedNotice.products.map((item,i)=><div key={i} className="neo-soft-product">
                    <div><strong>{item.product_name}</strong>
                      {item.variant&&<span>{item.variant}</span>}</div>
                    <b>×{item.quantity}</b>
                  </div>)
                  :<p className="neo-soft-muted">Chưa có chi tiết sản phẩm.</p>}
              </section>}
              {selectedNotice.recipient_name&&<section className="neo-soft-detail-section">
                <div className="neo-soft-section-title">Người nhận</div>
                <p className="neo-soft-recipient">{selectedNotice.recipient_name}
                  {selectedNotice.recipient_phone&&<span> · {selectedNotice.recipient_phone}</span>}</p>
                {selectedNotice.recipient_address&&<p className="neo-soft-muted">{selectedNotice.recipient_address}</p>}
              </section>}
              <section className="neo-soft-detail-section">
                <div className="neo-soft-section-title">Lịch sử vận chuyển</div>
                {selectedNotice.timeline?.length
                  ?<ol className="neo-soft-timeline">{selectedNotice.timeline.map(step=>
                    <li key={step.id}>
                      <strong>{step.label}</strong><time>{when(step.created_at)}</time>
                      {step.reason&&<small>{step.reason}</small>}
                    </li>)}</ol>
                  :<p className="neo-soft-muted">Chưa có lịch sử vận chuyển.</p>}
              </section>
              <div className="neo-soft-detail-actions">
                {!selectedNotice.is_read&&<button type="button" disabled={pending}
                  onClick={()=>void mark(selectedNotice)}>Đánh dấu đã đọc</button>}
                {safeTarget(selectedNotice)&&<button type="button" className="primary"
                  onClick={()=>void openAlert(selectedNotice)}>Mở đơn trong ERP <span>↗</span></button>}
              </div>
            </div>
            :!visible.length
            ?<div className="app-alert-empty app-alert-empty-v2">
               <span className="app-alert-empty-icon-v2"><CheckIcon/></span>
               <b>Không có thông báo phù hợp</b>
               <small>Thử chọn HUB khác hoặc thay đổi bộ lọc trạng thái.</small>
             </div>
            :<div className="neo-soft-notice-list">{visible.map(row=>
              <article key={row.id} className={'neo-soft-notice neo-soft-'+tone(row)+(row.is_read?' read':' unread')}>
                <button type="button" className="neo-soft-notice-main" onClick={()=>openDetail(row)}
                  aria-label={'Xem chi tiết đơn '+(row.order_code??row.title)}>
                  <div className="neo-soft-notice-first">
                    <span className={'neo-soft-status neo-soft-status-'+tone(row)}>
                      <span className="neo-soft-status-dot" aria-hidden="true"/>
                      {row.title}
                    </span>
                    <time>{when(row.created_at)}</time>
                  </div>
                  <div className="neo-soft-notice-primary">
                    <strong className="neo-soft-notice-code">{row.order_code??row.message??'Thông báo hệ thống'}</strong>
                    <strong className="neo-soft-notice-cod">{money(row.cod)}</strong>
                  </div>
                  <div className="neo-soft-notice-secondary">
                    <span className="neo-soft-notice-hub">{row.receive_status==='RECEIVED'
                      ?'Đã nhận · Lịch sử':row.destination_hub||'Chưa xác định HUB'}</span>
                    {row.source==='tracking'&&row.group_count>1&&
                      <small>{row.group_count} cập nhật</small>}
                    {row.requires_action&&!row.is_resolved&&
                      <span className="neo-soft-action-mark" title="Cần xử lý" aria-label="Cần xử lý">!</span>}
                    {!row.is_read&&<span className="neo-soft-unread-mark" title="Chưa đọc" aria-label="Chưa đọc"/>}
                    <span className="neo-soft-chevron" aria-hidden="true">›</span>
                  </div>
                </button>
              </article>
            )}</div>}
        </div>

        <footer className="app-alert-panel-foot-v2 neo-soft-footer">
          <button type="button" aria-pressed={notificationsEnabled===true}
            onClick={toggleNotifications}>{notificationsEnabled===false?'Bật thông báo':'Tắt thông báo'}</button>
          <button type="button" onClick={()=>{
            setOpen(false);router.push('/purchase/tracking')
          }}>Cảnh báo vận chuyển ↗</button>
          {feed.migration_pending&&<small>Thông báo phân hệ khác đang chờ kích hoạt.</small>}
        </footer>
      </aside>
    </>}
  </>
}
