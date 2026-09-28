'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type IconName='home'|'users'|'orders'|'tracking'|'warehouse'

function NavIcon({name}:{name:IconName}){
  const common={width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(name==='home') return <svg {...common}><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9 21v-6h6v6"/></svg>
  if(name==='users') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.5-6 5.5-6s5.1 2 5.5 6"/><path d="M16 7.5a2.5 2.5 0 1 1 0 5"/><path d="M17 15c2 .5 3.2 2.1 3.5 4.5"/></svg>
  if(name==='orders') return <svg {...common}><path d="M6 3h12l2 5v13H4V8l2-5Z"/><path d="M4 8h16"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>
  if(name==='tracking') return <svg {...common}><path d="M3 17h2l2-9h10l2 9h2"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/><path d="M9 5h6"/><path d="m12 2 3 3-3 3"/></svg>
  return <svg {...common}><path d="M3 9 12 4l9 5v11H3Z"/><path d="M7 13h10"/><path d="M7 17h10"/><path d="M9 20v-7h6v7"/></svg>
}

const items = [
  {href:'/',label:'Tổng quan',icon:'home' as IconName},
  {href:'/users',label:'Tài khoản Shopee',icon:'users' as IconName},
  {href:'/orders',label:'Đơn hàng',icon:'orders' as IconName},
  {href:'/tracking',label:'Vận chuyển',icon:'tracking' as IconName},
  {href:'/warehouse',label:'Quản lý kho',icon:'warehouse' as IconName},
]

export function Nav(){
  const pathname=usePathname()
  return <nav className="nav" aria-label="Điều hướng chính">
    <div className="nav-section-label">VẬN HÀNH</div>
    {items.map(item=>{
      const active=item.href==='/'?pathname===item.href:pathname.startsWith(item.href)
      return <Link key={item.href} href={item.href} className={active?'active':''}>
        <span className="nav-icon"><NavIcon name={item.icon}/></span>
        <span>{item.label}</span>
      </Link>
    })}
  </nav>
}
