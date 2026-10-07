'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
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

function BellIcon(){
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/>
    <path d="M10 20h4"/>
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
      day:'2-digit',month:'2-digit',year:'numeric',
      hour:'2-digit',minute:'2-digit',
    }).format(new Date(value))
  }catch{return value}
}

export function InAppAlertCenter(){
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [alerts,setAlerts]=useState<AlertGroup[]>([])
  const [loading,setLoading]=useState(true)
  const timer=useRef<ReturnType<typeof setInterval>|null>(null)

  async function load(){
    try{
      const res=await fetch('/api/alerts/in-app',{cache:'no-store'})
      if(!res.ok)return
      const body=await res.json()
      setAlerts(Array.isArray(body.alerts)?body.alerts:[])
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    load()
    timer.current=setInterval(load,30000)
    return()=>{if(timer.current)clearInterval(timer.current)}
  },[])

  useEffect(()=>{
    if(!open)return
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)}
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[open])

  const unread=useMemo(()=>alerts.filter(x=>!x.is_read).length,[alerts])

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
      className={'app-alert-trigger'+(unread?' has-unread':'')}
      aria-label={'Thông báo'+(unread?' · '+unread+' chưa đọc':'')}
      onClick={()=>setOpen(true)}
    >
      <BellIcon/>
      {unread>0&&<span className="app-alert-badge">{unread>99?'99+':unread}</span>}
    </button>

    {open&&<>
      <button className="app-alert-backdrop" aria-label="Đóng thông báo" onClick={()=>setOpen(false)}/>
      <aside className="app-alert-panel" aria-label="Thông báo trong ứng dụng">
        <header className="app-alert-panel-head">
          <div>
            <span>THÔNG BÁO</span>
            <h2>Cảnh báo vận chuyển</h2>
          </div>
          <div className="app-alert-panel-actions">
            {unread>0&&<button type="button" onClick={markAll}>Đọc tất cả</button>}
            <button type="button" className="app-alert-close" onClick={()=>setOpen(false)}>×</button>
          </div>
        </header>

        <div className="app-alert-list">
          {loading
            ? <div className="app-alert-empty">Đang tải thông báo…</div>
            : !alerts.length
              ? <div className="app-alert-empty">Chưa có cảnh báo vận chuyển.</div>
              : alerts.map((row,index)=><button
                  type="button"
                  onClick={()=>openAlert(row)}
                  className={'app-alert-row '+tone(row.alert_type)+(row.is_read?' read':' unread')}
                  key={row.alert_type+'-'+row.created_at+'-'+index}
                >
                  <i className="app-alert-dot"/>
                  <div className="app-alert-row-main">
                    <div className="app-alert-row-title">
                      <b>{row.label}</b>
                      {Number(row.alert_count)>1&&<span>{row.alert_count} đơn</span>}
                    </div>
                    <div className="app-alert-row-orders">
                      {(row.order_codes??[]).slice(0,3).filter(Boolean).join(' · ')||'Đơn hàng'}
                      {Number(row.alert_count)>3&&' · +'+(Number(row.alert_count)-3)}
                    </div>
                    <div className="app-alert-row-meta">
                      <span>{row.destination_hub||'Chưa xác định HUB'}</span>
                      <time>{when(row.created_at)}</time>
                    </div>
                    {row.reason_summary&&<small>{row.reason_summary}</small>}
                  </div>
                </button>)}
        </div>

        <footer className="app-alert-panel-foot">
          <button type="button" onClick={()=>{
            setOpen(false)
            router.push('/purchase/tracking')
          }}>Mở Cảnh báo vận chuyển</button>
        </footer>
      </aside>
    </>}
  </>
}
