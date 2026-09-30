'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type IconName=
  |'home'|'dashboard'|'account'|'orders'|'alert'
  |'warehouse'|'receive'|'inventory'|'history'
  |'sales'|'customer'|'debt'|'finance'|'cash'|'payment'|'report'|'settings'

function NavIcon({name}:{name:IconName}){
  const p={width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(name==='home') return <svg {...p}><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9 21v-6h6v6"/></svg>
  if(name==='dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/></svg>
  if(name==='account') return <svg {...p}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.5-6 5.5-6s5.1 2 5.5 6"/><path d="M16 7.5a2.5 2.5 0 1 1 0 5"/><path d="M17 15c2 .5 3.2 2.1 3.5 4.5"/></svg>
  if(name==='orders') return <svg {...p}><path d="M6 3h12l2 5v13H4V8l2-5Z"/><path d="M4 8h16"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
  if(name==='alert') return <svg {...p}><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/><path d="M10 20h4"/></svg>
  if(name==='warehouse') return <svg {...p}><path d="M3 9 12 4l9 5v11H3Z"/><path d="M7 13h10"/><path d="M7 17h10"/><path d="M9 20v-7h6v7"/></svg>
  if(name==='receive') return <svg {...p}><path d="M4 5h16v14H4Z"/><path d="M8 9h8"/><path d="m9 14 3 3 4-5"/></svg>
  if(name==='inventory') return <svg {...p}><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>
  if(name==='history') return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>
  if(name==='sales') return <svg {...p}><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>
  if(name==='customer') return <svg {...p}><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-4.3 3-6.5 7-6.5s6.4 2.2 7 6.5"/></svg>
  if(name==='debt') return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10"/><path d="M7 14h6"/></svg>
  if(name==='finance') return <svg {...p}><path d="M3 9h18"/><path d="M5 9V6l7-3 7 3v3"/><path d="M6 9v8M10 9v8M14 9v8M18 9v8"/><path d="M3 20h18"/></svg>
  if(name==='cash') return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9h.01M17 15h.01"/></svg>
  if(name==='payment') return <svg {...p}><path d="M4 7h16v11H4Z"/><path d="M4 10h16"/><path d="M8 15h4"/></svg>
  if(name==='settings') return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V20.5h-3v-.09a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06-2.12-2.12.06-.06A1.8 1.8 0 0 0 6.6 15a1.8 1.8 0 0 0-1.65-1.1H4.5v-3h.45A1.8 1.8 0 0 0 6.6 9.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.12-2.12.06.06a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 11.44 4.4V4.3h3v.1a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06 2.12 2.12-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.45v3h-.45A1.8 1.8 0 0 0 19.4 15Z"/></svg>
  return <svg {...p}><path d="M5 3h10l4 4v14H5Z"/><path d="M15 3v5h5"/><path d="M8 13h8M8 17h6"/></svg>
}

type Item={href:string,label:string,icon:IconName,exact?:boolean}
type Group={label:string,items:Item[]}

const groups:Group[]=[
  {label:'TỔNG QUAN',items:[
    {href:'/',label:'Tổng quan hệ thống',icon:'home',exact:true},
  ]},
  {label:'MUA HÀNG',items:[
    {href:'/purchase',label:'Tổng quan mua hàng',icon:'dashboard',exact:true},
    {href:'/purchase/accounts',label:'Tài khoản mua hàng',icon:'account'},
    {href:'/purchase/orders',label:'Đơn nhập hàng',icon:'orders'},
    {href:'/purchase/tracking',label:'Cảnh báo vận chuyển',icon:'alert'},
  ]},
  {label:'VẬN HÀNH KHO',items:[
    {href:'/warehouse',label:'Tổng quan kho',icon:'warehouse',exact:true},
    {href:'/warehouse/receive',label:'Nhập kho',icon:'receive'},
    {href:'/warehouse/inventory',label:'Tồn kho',icon:'inventory'},
    {href:'/warehouse/history',label:'Lịch sử kho',icon:'history'},
  ]},
  {label:'BÁN HÀNG',items:[
    {href:'/sales',label:'Tổng quan bán hàng',icon:'sales',exact:true},
    {href:'/sales/orders',label:'Đơn bán hàng',icon:'orders'},
    {href:'/sales/customers',label:'Khách hàng',icon:'customer'},
    {href:'/sales/debt',label:'Công nợ khách hàng',icon:'debt'},
  ]},
  {label:'TÀI CHÍNH',items:[
    {href:'/finance',label:'Tổng quan tài chính',icon:'finance',exact:true},
    {href:'/finance/cashflow',label:'Thu / Chi',icon:'cash'},
    {href:'/finance/shipper-payments',label:'Đối soát HUB',icon:'payment'},
    {href:'/finance/customer-payments',label:'Thanh toán khách hàng',icon:'payment'},
    {href:'/finance/reports',label:'Báo cáo tài chính',icon:'report'},
  ]},
  {label:'HỆ THỐNG',items:[
    {href:'/settings',label:'Cài đặt hệ thống',icon:'settings',exact:true},
  ]},
]

export function Nav(){
  const pathname=usePathname()
  const searchParams=useSearchParams()

  function contextualHref(href:string){
    if(!href.startsWith('/purchase'))return href
    if(!pathname.startsWith('/purchase'))return href

    const p=new URLSearchParams()
    const range=searchParams.get('range')
    const from=searchParams.get('from')
    const to=searchParams.get('to')
    if(range)p.set('range',range)
    if(range==='custom'&&from)p.set('from',from)
    if(range==='custom'&&to)p.set('to',to)

    const qs=p.toString()
    return href+(qs?'?'+qs:'')
  }

  return <nav className="nav" aria-label="Điều hướng chính">
    {groups.map(group=><section className="nav-group" key={group.label}>
      <div className="nav-section-label">{group.label}</div>
      <div className="nav-group-items">
        {group.items.map(item=>{
          const active=item.exact?pathname===item.href:pathname===item.href||pathname.startsWith(item.href+'/')
          return <Link key={item.href} href={contextualHref(item.href)} className={active?'active':''}>
            <span className="nav-icon"><NavIcon name={item.icon}/></span>
            <span>{item.label}</span>
          </Link>
        })}
      </div>
    </section>)}
  </nav>
}
