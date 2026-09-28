'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  ['/', 'Tổng quan', '⌂'],
  ['/users', 'Tài khoản Shopee', 'U'],
  ['/orders', 'Đơn hàng', 'Đ'],
  ['/tracking', 'Vận chuyển', 'V'],
  ['/warehouse', 'Quản lý kho', 'K'],
] as const

export function Nav(){
  const pathname=usePathname()
  return <nav className="nav">{items.map(([href,label,icon])=>{
    const active=href==='/'?pathname===href:pathname.startsWith(href)
    return <Link key={href} href={href} className={active?'active':''}><span className="nav-icon">{icon}</span><span>{label}</span></Link>
  })}</nav>
}
