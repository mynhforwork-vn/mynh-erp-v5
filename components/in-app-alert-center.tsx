'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'

type View='all'|'unread'|'action'
type Category='all'|'tracking'|'purchase'|'warehouse'|'sales'|'finance'|'system'
type Notice={
 id:string;source:'tracking'|'system';category:Category;severity:'info'|'warning'|'critical';
 title:string;message:string;event_type:string;created_at:string;is_read:boolean;
 requires_action:boolean;is_resolved:boolean;legacy_ids:string[];notification_id:string|null;
 order_id:string|null;destination_hub:string;group_count:number;target_path:string|null
}
type Feed={items:Notice[];total:number;unread_total:number;action_total:number;migration_pending?:boolean}
const empty:Feed={items:[],total:0,unread_total:0,action_total:0}
const size=20
const categories:{id:Category;label:string}[]=[
 {id:'all',label:'Tất cả'}, {id:'tracking',label:'Vận chuyển'}, {id:'purchase',label:'Đơn nhập'},
 {id:'warehouse',label:'Kho'}, {id:'sales',label:'Bán hàng'}, {id:'finance',label:'Tài chính'},
 {id:'system',label:'Hệ thống'},
]
const views:{id:View;label:string}[]=[
 {id:'action',label:'Cần xử lý'}, {id:'unread',label:'Chưa đọc'}, {id:'all',label:'Tất cả'},
]
function Bell(){
 return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/><path d="M10 20h4"/></svg>
}
function dateVN(s:string){
 try{return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',
   day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s))}
 catch{return 'Không rõ thời gian'}
}
function feedFrom(raw:unknown):Feed{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return empty
 const v=raw as Record<string,unknown>
 return {
   items:Array.isArray(v.items)?v.items as Notice[]:[],
   total:Math.max(0,Number(v.total)||0),
   unread_total:Math.max(0,Number(v.unread_total)||0),
   action_total:Math.max(0,Number(v.action_total)||0),
   migration_pending:v.migration_pending===true,
 }
}
function target(row:Notice){
 if(row.source==='system'){
   const p=row.target_path??''
   if(!p.startsWith('/')||p.startsWith('//')||p.includes('\\')||p.includes('\n')||p.includes('\r'))return null
   return p
 }
 if(row.group_count===1&&row.order_id)return '/purchase/orders?order='+encodeURIComponent(row.order_id)
 const qs=new URLSearchParams({status:row.event_type})
 if(row.destination_hub)qs.set('hub',row.destination_hub)
 return '/purchase/tracking?'+qs.toString()
}
export function InAppAlertCenter({role='viewer'}:{role?:string}){
 const router=useRouter()
 const [open,setOpen]=useState(false)
 const [view,setView]=useState<View>('all')
 const [category,setCategory]=useState<Category>('all')
 const [page,setPage]=useState(0)
 const [feed,setFeed]=useState<Feed>(empty)
 const [busy,setBusy]=useState(false)
 const [pending,setPending]=useState(false)
 const [error,setError]=useState('')
 const canResolve=role==='admin'||role==='operator'
 const inflight=useRef(false)
 const lastAt=useRef(0)
 const active=useRef(true)
 const selection=useRef({view,category,page})
 const openState=useRef(open)
 selection.current={view,category,page}
 openState.current=open
 const load=useCallback(async(force=false)=>{
   if(typeof document!=='undefined'&&document.visibilityState==='hidden')return
   if(inflight.current)return
   const now=Date.now()
   const minInterval=openState.current?300000:900000
   if(!force&&now-lastAt.current<minInterval)return
   inflight.current=true
   lastAt.current=now
   const {view,category,page}=selection.current
   if(openState.current)setBusy(true)
   try{
     const params=new URLSearchParams({
       view,category,limit:String(size),offset:String(page*size),
     })
     const response=await fetch('/api/alerts/in-app?'+params.toString(),{cache:'no-store'})
     if(!response.ok)throw Error('Không thể tải thông báo.')
     const data=feedFrom(await response.json())
     if(!active.current)return
     if(selection.current.view===view&&selection.current.category===category&&selection.current.page===page){
       setFeed(data)
       setError('')
     }
   }catch{
     if(active.current)setError('Không thể tải thông báo. Hãy thử lại sau.')
   }finally{
     inflight.current=false
     if(active.current)setBusy(false)
   }
 },[])
 useEffect(()=>{
   active.current=true
   void load(true)
   return()=>{active.current=false}
 },[load])
 useEffect(()=>{
   const timer=window.setInterval(()=>void load(),open?300000:900000)
   const wake=()=>{if(document.visibilityState==='visible')void load()}
   window.addEventListener('focus',wake)
   document.addEventListener('visibilitychange',wake)
   return()=>{
     window.clearInterval(timer)
     window.removeEventListener('focus',wake)
     document.removeEventListener('visibilitychange',wake)
   }
 },[load,open])
 useEffect(()=>{
   if(!open)return
   void load(true)
   const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!pending)setOpen(false)}
   window.addEventListener('keydown',key)
   return()=>window.removeEventListener('keydown',key)
 },[open,load,pending])
 useEffect(()=>{
   if(!open)return
   void load(true)
 },[view,category,page,open,load])
 function setTab(next:View){setView(next);setPage(0)}
 function setGroup(next:Category){setCategory(next);setPage(0)}
 async function action(body:Record<string,unknown>){
   const res=await fetch('/api/alerts/in-app',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(body),
   })
   if(!res.ok)throw Error('Không lưu được thao tác.')
 }
 async function mark(row:Notice){
   if(row.is_read)return true
   setPending(true)
   try{
     await action(row.source==='tracking'
       ?{action:'read',source:'tracking',alert_ids:row.legacy_ids}
       :{action:'read',source:'system',notification_id:row.notification_id})
     await load(true)
     return true
   }catch{setError('Không đánh dấu đã đọc được.');return false}
   finally{setPending(false)}
 }
 async function markAll(){
   setPending(true)
   try{await action({action:'read_all'});await load(true)}
   catch{setError('Không thể đánh dấu đã đọc tất cả.')}
   finally{setPending(false)}
 }
 async function resolve(row:Notice){
   if(row.source!=='system'||!row.notification_id||!canResolve)return
   setPending(true)
   try{await action({action:'resolve',source:'system',notification_id:row.notification_id});await load(true)}
   catch{setError('Bạn chưa có quyền hoặc không thể cập nhật trạng thái xử lý.')}
   finally{setPending(false)}
 }
 async function openRow(row:Notice){
   const route=target(row)
   if(!route){setError('Thông báo chưa có đường dẫn chi tiết.');return}
   if(!await mark(row))return
   setOpen(false)
   router.push(route)
 }
 return <>
   <button type="button" className={'sidebar-alert-trigger'+(feed.unread_total?' has-unread':'')}
     aria-label={'Thông báo'+(feed.unread_total?' · '+feed.unread_total+' chưa đọc':'')}
     onClick={()=>setOpen(true)}><Bell/>
     {feed.unread_total>0&&<span className="sidebar-alert-badge">
       {feed.unread_total>99?'99+':feed.unread_total}
     </span>}
   </button>
   {open&&<>
    <button type="button" className="app-alert-backdrop app-alert-backdrop-v2"
      aria-label="Đóng trung tâm thông báo" onClick={()=>{if(!pending)setOpen(false)}}/>
    <aside className="app-alert-panel app-alert-panel-v2 notification-center-v1" aria-label="Trung tâm thông báo">
      <header className="app-alert-panel-head-v2 notification-center-head">
        <div className="app-alert-panel-title-v2">
         <span className="app-alert-panel-icon-v2"><Bell/></span>
         <div><h2>Trung tâm thông báo</h2><p>MYNH ERP · Quản lý công việc</p></div>
        </div>
        <div className="app-alert-panel-actions-v2 notification-center-actions">
          <button type="button" className="app-alert-mark-all-v2" disabled={pending||!feed.unread_total}
            onClick={()=>void markAll()}>Đọc tất cả</button>
          <button type="button" className="app-alert-close-v2" disabled={pending}
            aria-label="Đóng" onClick={()=>setOpen(false)}>×</button>
        </div>
      </header>
      <div className="notification-center-stats">
        <div><strong>{feed.unread_total}</strong><span>Chưa đọc</span></div>
        <div><strong>{feed.action_total}</strong><span>Cần xử lý</span></div>
        <div><strong>{feed.total}</strong><span>Trong bộ lọc</span></div>
      </div>
      <div className="app-alert-tabs-v2 notification-center-tabs" aria-label="Trạng thái thông báo">
        {views.map(t=><button type="button" key={t.id} className={view===t.id?'active':''}
          onClick={()=>setTab(t.id)}>{t.label}{t.id==='unread'?' · '+feed.unread_total:''}
          {t.id==='action'?' · '+feed.action_total:''}</button>)}
      </div>
      <div className="notification-center-categories" aria-label="Bộ lọc phân hệ">
        {categories.map(c=><button type="button" key={c.id}
          className={category===c.id?'active':''} onClick={()=>setGroup(c.id)}>{c.label}</button>)}
      </div>
      {feed.migration_pending&&<p className="notification-center-warning">Đang hiển thị cảnh báo vận chuyển. Trung tâm thông báo mở rộng chờ cập nhật cơ sở dữ liệu.</p>}
      {error&&<div role="alert" className="notification-center-error">{error}
        <button type="button" onClick={()=>void load(true)}>Thử lại</button></div>}
      <div className="app-alert-list-v2 notification-center-list" aria-live="polite">
       {busy?<div className="app-alert-empty-v2">Đang tải thông báo…</div>
        :feed.items.length===0?<div className="app-alert-empty-v2">
          <strong>{view==='action'?'Chưa có việc cần xử lý':
           view==='unread'?'Không có thông báo chưa đọc':'Chưa có thông báo phù hợp'}</strong>
          <small>Các thông báo mới sẽ xuất hiện tại đây.</small>
        </div>
        :feed.items.map(row=><article key={row.id}
           className={'notification-center-row '+(row.is_read?'read':'unread')+' severity-'+row.severity}>
          <div className="notification-center-rowhead">
           <strong>{row.title}</strong><time>{dateVN(row.created_at)}</time>
          </div>
          <p className="notification-center-message">{row.message}</p>
          <div className="notification-center-tags">
            <span>{categories.find(x=>x.id===row.category)?.label??'Hệ thống'}</span>
            {row.group_count>1&&<span>{row.group_count} đơn hàng</span>}
            {row.requires_action&&<span className={row.is_resolved?'resolved':'needs-action'}>
             {row.is_resolved?'Đã xử lý':'Cần xử lý'}
            </span>}
            {!row.is_read&&<span className="new">Mới</span>}
          </div>
          <div className="notification-center-rowbuttons">
            <button type="button" disabled={pending} onClick={()=>void openRow(row)}>Xem chi tiết →</button>
            {!row.is_read&&<button type="button" disabled={pending} onClick={()=>void mark(row)}>Đã đọc</button>}
            {row.source==='system'&&row.requires_action&&!row.is_resolved&&canResolve&&
             <button type="button" disabled={pending} onClick={()=>void resolve(row)}>Đánh dấu đã xử lý</button>}
          </div>
        </article>)}
      </div>
      <footer className="app-alert-panel-foot-v2 notification-center-foot">
        <div className="notification-center-pagination">
          <span>{feed.total?Math.min(page*size+1,feed.total):0}–{Math.min((page+1)*size,feed.total)} / {feed.total}</span>
          <div>
           <button type="button" disabled={!page||pending||busy} onClick={()=>setPage(v=>Math.max(0,v-1))}>Trước</button>
           <button type="button" disabled={(page+1)*size>=feed.total||pending||busy} onClick={()=>setPage(v=>v+1)}>Sau</button>
          </div>
        </div>
        <small>Đã đọc không đồng nghĩa đã xử lý.</small>
      </footer>
    </aside>
   </>}
 </>
}
