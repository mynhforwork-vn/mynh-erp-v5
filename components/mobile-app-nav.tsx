'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type IconName='home'|'orders'|'warehouse'|'pos'|'more'|'account'|'tracking'|'inventory'|'history'|'customer'|'debt'|'finance'|'payment'|'settings'

function Icon({name}:{name:IconName}){
  const p={width:22,height:22,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(name==='home')return <svg {...p}><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9 21v-6h6v6"/></svg>
  if(name==='orders')return <svg {...p}><path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
  if(name==='warehouse')return <svg {...p}><path d="M3 9 12 4l9 5v11H3Z"/><path d="M8 13h8M8 17h8"/></svg>
  if(name==='pos')return <svg {...p}><path d="M4 5h16v14H4Z"/><path d="M7 9h10M8 14h3M15 14h1"/></svg>
  if(name==='account')return <svg {...p}><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-4.3 3-6.5 7-6.5s6.4 2.2 7 6.5"/></svg>
  if(name==='tracking')return <svg {...p}><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/><path d="M10 20h4"/></svg>
  if(name==='inventory')return <svg {...p}><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>
  if(name==='history')return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>
  if(name==='customer')return <svg {...p}><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-4.3 3-6.5 7-6.5s6.4 2.2 7 6.5"/></svg>
  if(name==='debt')return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/></svg>
  if(name==='finance')return <svg {...p}><path d="M3 9h18M5 9V6l7-3 7 3v3M6 9v8M10 9v8M14 9v8M18 9v8M3 20h18"/></svg>
  if(name==='payment')return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h5"/></svg>
  if(name==='settings')return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6.2L14.7 3h-4L10.4 6.2A7 7 0 0 0 8.9 7L6.5 6 4.5 9.5 6.5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.5.8l.3 3.3h4l.3-3.3a7 7 0 0 0 1.5-.8l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>
  if(name==='more')return <svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>
  return null
}

const primary=[
  {href:'/',label:'Tổng quan',icon:'home' as const,match:(p:string)=>p==='/'},
  {href:'/purchase/orders',label:'Đơn',icon:'orders' as const,match:(p:string)=>p.startsWith('/purchase/orders')},
  {href:'/warehouse',label:'Kho',icon:'warehouse' as const,match:(p:string)=>p.startsWith('/warehouse')},
  {href:'/sales/pos',label:'POS',icon:'pos' as const,match:(p:string)=>p.startsWith('/sales/pos')},
]

const groups=[
  {label:'Mua hàng',items:[
    {href:'/purchase',label:'Tổng quan mua hàng',icon:'home' as const},
    {href:'/purchase/accounts',label:'Tài khoản mua hàng',icon:'account' as const},
    {href:'/purchase/tracking',label:'Cảnh báo vận chuyển',icon:'tracking' as const},
  ]},
  {label:'Kho',items:[
    {href:'/warehouse/receive',label:'Nhập kho',icon:'warehouse' as const},
    {href:'/warehouse/inventory',label:'Tồn kho',icon:'inventory' as const},
    {href:'/warehouse/history',label:'Lịch sử kho',icon:'history' as const},
  ]},
  {label:'Bán hàng',items:[
    {href:'/sales/history',label:'Lịch sử bán',icon:'history' as const},
    {href:'/sales/customers',label:'Khách hàng',icon:'customer' as const},
    {href:'/sales/debt',label:'Công nợ',icon:'debt' as const},
  ]},
  {label:'Tài chính',items:[
    {href:'/finance',label:'Tổng quan tài chính',icon:'finance' as const},
    {href:'/finance/cashflow',label:'Thu / Chi',icon:'finance' as const},
    {href:'/finance/shipper-payments',label:'Đối soát',icon:'payment' as const},
    {href:'/finance/reports',label:'Báo cáo',icon:'history' as const},
  ]},
  {label:'Hệ thống',items:[
    {href:'/settings',label:'Cài đặt',icon:'settings' as const},
  ]},
]

export function MobileAppNav(){
  const pathname=usePathname()
  const [open,setOpen]=useState(false)

  useEffect(()=>setOpen(false),[pathname])
  useEffect(()=>{
    if(!open)return
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)}
    document.addEventListener('keydown',onKey)
    return ()=>document.removeEventListener('keydown',onKey)
  },[open])

  const moreActive=!primary.some(item=>item.match(pathname))

  return <>
    {open&&<button className="mobile-more-scrim" aria-label="Đóng menu" onClick={()=>setOpen(false)}/>}
    {open&&<section className="mobile-more-sheet" aria-label="Tất cả chức năng">
      <div className="mobile-more-handle"/>
      <div className="mobile-more-head"><div><b>Tất cả chức năng</b><span>MYNH ERP</span></div><button type="button" onClick={()=>setOpen(false)}>×</button></div>
      <div className="mobile-more-scroll">
        {groups.map(group=><section className="mobile-more-group" key={group.label}>
          <h3>{group.label}</h3>
          <div>
            {group.items.map(item=><Link className={pathname===item.href||pathname.startsWith(item.href+'/')?'active':''} href={item.href} key={item.href}>
              <span><Icon name={item.icon}/></span><b>{item.label}</b><i>›</i>
            </Link>)}
          </div>
        </section>)}
      </div>
    </section>}

    <nav className="mobile-bottom-nav" aria-label="Điều hướng ứng dụng">
      {primary.map(item=><Link href={item.href} className={item.match(pathname)?'active':''} key={item.href}>
        <Icon name={item.icon}/><span>{item.label}</span>
      </Link>)}
      <button type="button" className={open||moreActive?'active':''} onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
        <Icon name="more"/><span>Thêm</span>
      </button>
    </nav>
  </>
}
