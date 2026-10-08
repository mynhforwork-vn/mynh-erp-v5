'use client'

import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { useRouter } from 'next/navigation'

type AlertGroup={
  alert_ids:string[]
  alert_type:string
  label:string
  destination_hub:string
  alert_count:number
  order_codes:string[]
  tracking_numbers:string[]
  primary_order_id:string
  reason_summary:string|null
  created_at:string
  is_read:boolean
}
type Filter='unread'|'all'
const NOTIFICATION_PREFERENCE_KEY='mynh-erp-in-app-notifications-enabled'

function BellIcon(){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/>
    <path d="M10 20h4"/>
  </svg>
}
function CloseIcon(){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18"/>
  </svg>
}
function CheckIcon(){
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 4 4L19 6"/>
  </svg>
}

function tone(type:string){
  if(type==='PICKUP_FAILED'||type==='DELIVERY_FAILED')return 'danger'
  if(type==='DELIVERED')return 'success'
  if(type==='OUT_FOR_DELIVERY')return 'info'
  return 'warning'
}

function when(value:string){
  try{
    return new Intl.DateTimeFormat('vi-VN',{
      timeZone:'Asia/Ho_Chi_Minh',
      day:'2-digit',month:'2-digit',
      hour:'2-digit',minute:'2-digit',
    }).format(new Date(value))
  }catch{return value}
}

export function InAppAlertCenter(){
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [filter,setFilter]=useState<Filter>('unread')
  const [alerts,setAlerts]=useState<AlertGroup[]>([])
  const [loading,setLoading]=useState(true)
  // null until browser preference has loaded; avoid an unwanted first request.
  const [notificationsEnabled,setNotificationsEnabled]=useState<boolean|null>(null)
  const enabledRef=useRef(false)
  enabledRef.current=notificationsEnabled===true
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const lastRequestAt=useRef(0)
  const nextAllowedAt=useRef(0)
  const requestInFlight=useRef(false)
  const pendingRequest=useRef<AbortController|null>(null)

  const load=useCallback(async()=>{
    if(!enabledRef.current||requestInFlight.current)return
    const now=Date.now()
    const interval=document.visibilityState==='hidden'?900000:300000
    if(now<nextAllowedAt.current||now-lastRequestAt.current<interval)return
    requestInFlight.current=true
    lastRequestAt.current=now
    const controller=new AbortController()
    pendingRequest.current=controller
    try{
      const res=await fetch('/api/alerts/in-app',{cache:'no-store',signal:controller.signal})
      if(!enabledRef.current)return
      if(res.status===429||res.status===503){
        nextAllowedAt.current=Date.now()+900000
        return
      }
      if(!res.ok)return
      const body=await res.json()
      if(enabledRef.current)setAlerts(Array.isArray(body.alerts)?body.alerts:[])
    }catch{
      if(!controller.signal.aborted)nextAllowedAt.current=Date.now()+300000
    }finally{
      if(pendingRequest.current===controller)pendingRequest.current=null
      requestInFlight.current=false
      if(enabledRef.current)setLoading(false)
    }
  },[])

  // Preference is local to this browser; changes propagate to other ERP tabs.
  useEffect(()=>{
    try{setNotificationsEnabled(window.localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)!=='off')}
    catch{setNotificationsEnabled(true)}
    const syncPreference=(event:StorageEvent)=>{
      if(event.key===NOTIFICATION_PREFERENCE_KEY){
        setNotificationsEnabled(event.newValue!=='off')
        if(event.newValue==='off')pendingRequest.current?.abort()
      }
    }
    window.addEventListener('storage',syncPreference)
    return()=>window.removeEventListener('storage',syncPreference)
  },[])

  useEffect(()=>{
    if(timer.current){clearTimeout(timer.current);timer.current=null}
    if(notificationsEnabled!==true){
      pendingRequest.current?.abort()
      setLoading(false)
      return
    }
    lastRequestAt.current=0
    nextAllowedAt.current=0
    let stopped=false
    const schedule=()=>{
      if(timer.current)clearTimeout(timer.current)
      if(stopped||!enabledRef.current)return
      const interval=document.visibilityState==='hidden'?900000:300000
      const next=Math.max(lastRequestAt.current+interval,nextAllowedAt.current)
      const delay=Math.max(0,next-Date.now(),requestInFlight.current?1000:0)
      timer.current=setTimeout(()=>void tick(),delay)
    }
    const tick=async()=>{
      if(stopped||!enabledRef.current)return
      await load()
      schedule()
    }
    const onVisibility=()=>void tick()
    document.addEventListener('visibilitychange',onVisibility)
    void tick()
    return()=>{
      stopped=true
      if(timer.current){clearTimeout(timer.current);timer.current=null}
      document.removeEventListener('visibilitychange',onVisibility)
    }
  },[notificationsEnabled,load])

  function toggleNotifications(){
    const next=notificationsEnabled!==true
    enabledRef.current=next
    if(!next){
      pendingRequest.current?.abort()
      setAlerts([])
      setLoading(false)
    }else{
      setLoading(true)
    }
    try{window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY,next?'on':'off')}
    catch{/* Browsers with storage restrictions keep the state for this session. */}
    setNotificationsEnabled(next)
  }

  useEffect(()=>{
    if(!open)return
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)}
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[open])

  const unread=useMemo(()=>notificationsEnabled?alerts.filter(x=>!x.is_read).length:0,[alerts,notificationsEnabled])
  const visible=useMemo(
    ()=>!notificationsEnabled?[]:filter==='unread'?alerts.filter(x=>!x.is_read):alerts,
    [alerts,filter,notificationsEnabled],
  )

  async function mark(ids:string[]){
    if(!ids.length)return
    setAlerts(current=>current.map(x=>x.alert_ids.some(id=>ids.includes(id))?{...x,is_read:true}:x))
    await fetch('/api/alerts/in-app',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({alert_ids:ids}),
    }).catch(()=>null)
  }

  async function markAll(){
    setAlerts(current=>current.map(x=>({...x,is_read:true})))
    await fetch('/api/alerts/in-app',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({all:true}),
    }).catch(()=>null)
  }

  async function openAlert(row:AlertGroup){
    await mark(row.alert_ids)
    setOpen(false)
    if(row.alert_count===1&&row.primary_order_id){
      router.push('/purchase/orders?order='+encodeURIComponent(row.primary_order_id))
      return
    }
    const p=new URLSearchParams()
    p.set('status',row.alert_type)
    if(row.destination_hub)p.set('hub',row.destination_hub)
    router.push('/purchase/tracking?'+p.toString())
  }

  return <>
    <button
      type="button"
      className={'sidebar-alert-trigger'+(unread?' has-unread':'')}
      aria-label={'Thông báo'+(unread?' · '+unread+' chưa đọc':'')}
      onClick={()=>setOpen(true)}
    >
      <BellIcon/>
      {unread>0&&<span className="sidebar-alert-badge">{unread>99?'99+':unread}</span>}
    </button>

    {open&&<>
      <button className="app-alert-backdrop app-alert-backdrop-v2" aria-label="Đóng thông báo" onClick={()=>setOpen(false)}/>
      <aside className="app-alert-panel app-alert-panel-v2" aria-label="Thông báo trong ứng dụng">
        <header className="app-alert-panel-head-v2">
          <div className="app-alert-panel-title-v2">
            <span className="app-alert-panel-icon-v2"><BellIcon/></span>
            <div>
              <h2>Thông báo</h2>
              <p>Cảnh báo vận chuyển từ MYNH ERP</p>
            </div>
          </div>
          <div className="app-alert-panel-actions-v2">
            <button type="button" className="app-alert-mark-all-v2" aria-pressed={notificationsEnabled===true}
              onClick={toggleNotifications}>{notificationsEnabled===false?'Bật thông báo':'Tắt thông báo'}</button>
            {unread>0&&<button type="button" className="app-alert-mark-all-v2" onClick={markAll}>
              <CheckIcon/><span>Đọc tất cả</span>
            </button>}
            <button type="button" className="app-alert-close-v2" onClick={()=>setOpen(false)} aria-label="Đóng"><CloseIcon/></button>
          </div>
        </header>

        <div className="app-alert-tabs-v2">
          <button type="button" className={filter==='unread'?'active':''} onClick={()=>setFilter('unread')}>
            Chưa đọc <span>{unread}</span>
          </button>
          <button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>
            Tất cả <span>{alerts.length}</span>
          </button>
        </div>

        <div className="app-alert-list app-alert-list-v2">
          {notificationsEnabled===false
            ? <div className="app-alert-empty app-alert-empty-v2">Thông báo đã tắt. Hệ thống không gửi yêu cầu cập nhật thông báo từ trình duyệt.</div>
            : loading
            ? <div className="app-alert-empty app-alert-empty-v2">Đang tải thông báo…</div>
            : !visible.length
              ? <div className="app-alert-empty app-alert-empty-v2">
                  <span className="app-alert-empty-icon-v2"><CheckIcon/></span>
                  <b>{filter==='unread'?'Không có thông báo chưa đọc':'Chưa có thông báo'}</b>
                  <small>{filter==='unread'?'Bạn đã xử lý hết cảnh báo hiện tại.':'Cảnh báo vận chuyển mới sẽ xuất hiện tại đây.'}</small>
                </div>
              : visible.map((row,index)=><button
                  type="button"
                  onClick={()=>openAlert(row)}
                  className={'app-alert-row app-alert-row-v2 '+tone(row.alert_type)+(row.is_read?' read':' unread')}
                  key={row.alert_type+'-'+row.created_at+'-'+index}
                >
                  <span className={'app-alert-type-mark-v2 '+tone(row.alert_type)}/>
                  <div className="app-alert-row-main-v2">
                    <div className="app-alert-row-title-v2">
                      <b>{row.label}</b>
                      <time>{when(row.created_at)}</time>
                    </div>
                    <div className="app-alert-row-order-v2">
                      {(row.order_codes??[]).slice(0,2).filter(Boolean).join(' · ')||'Đơn hàng'}
                      {Number(row.alert_count)>2&&' · +'+(Number(row.alert_count)-2)}
                    </div>
                    <div className="app-alert-row-meta-v2">
                      <span>{row.destination_hub||'Chưa xác định HUB'}</span>
                      {Number(row.alert_count)>1&&<em>{row.alert_count} đơn</em>}
                    </div>
                    {row.reason_summary&&<small>{row.reason_summary}</small>}
                  </div>
                  {!row.is_read&&<span className="app-alert-unread-dot-v2"/>}
                </button>)}
        </div>

        <footer className="app-alert-panel-foot-v2">
          <button type="button" onClick={()=>{
            setOpen(false)
            router.push('/purchase/tracking')
          }}>Mở Cảnh báo vận chuyển</button>
        </footer>
      </aside>
    </>}
  </>
}
