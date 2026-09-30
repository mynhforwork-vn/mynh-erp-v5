import Link from 'next/link'

const items=[
  {href:'/warehouse',label:'Tổng quan kho'},
  {href:'/warehouse/receive',label:'Bóc tách nhập kho'},
  {href:'/warehouse/inventory',label:'Tồn kho'},
  {href:'/warehouse/history',label:'Lịch sử kho'},
]

export function WarehouseSectionNav({active}:{active:string}){
  return <div className="warehouse-section-nav" aria-label="Điều hướng vận hành kho">
    {items.map(item=><Link
      key={item.href}
      href={item.href}
      className={active===item.href?'active':''}
    >{item.label}</Link>)}
  </div>
}
