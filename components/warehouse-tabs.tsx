import Link from 'next/link'

const TABS=[
  {href:'/warehouse',label:'Tổng quan kho'},
  {href:'/warehouse/receive',label:'Bóc tách nhập kho'},
  {href:'/warehouse/inventory',label:'Tồn kho'},
  {href:'/warehouse/history',label:'Lịch sử kho'},
] as const

export function WarehouseTabs({active}:{active:string}){
  return <nav className="whx-tabs" aria-label="Vận hành kho">
    {TABS.map(tab=><Link
      key={tab.href}
      href={tab.href}
      className={active===tab.href?'active':''}
    >{tab.label}</Link>)}
  </nav>
}
