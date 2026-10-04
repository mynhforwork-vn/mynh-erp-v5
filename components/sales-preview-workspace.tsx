'use client'
import { useEffect,useMemo,useState } from 'react'

type View='overview'|'pos'|'history'|'customers'|'debt'
type Sale={id:string,code:string,time:string,customer:string,phone:string,warehouse:string,total:number,paid:number,debt:number,status:'PAID'|'PARTIAL'|'UNPAID',method:string,items:number}
type Customer={id:string,name:string,phone:string,address:string,orders:number,revenue:number,debt:number,last:string,status:'GOOD'|'DEBT'|'VIP'}
type TableId='recent'|'history'|'customers'|'debt'
type SortDir='asc'|'desc'
type TablePrefs={order:string[],hidden:string[]}
type DebtRow=Customer&{invoiceCount:number,oldest:string,lastPaid:string,risk:'high'|'medium'}

const TABLE_COLUMNS:Record<TableId,{key:string,label:string}[]>={
  recent:[
    {key:'code',label:'Mã HĐ'},{key:'customer',label:'Khách hàng'},{key:'warehouse',label:'Kho'},
    {key:'method',label:'Thanh toán'},{key:'total',label:'Tổng tiền'},{key:'paid',label:'Đã thu'},
    {key:'debt',label:'Còn nợ'},{key:'status',label:'Trạng thái'},
  ],
  history:[
    {key:'time',label:'Thời gian'},{key:'code',label:'Mã HĐ'},{key:'customer',label:'Khách hàng'},
    {key:'warehouse',label:'Kho'},{key:'items',label:'SP'},{key:'method',label:'Phương thức'},
    {key:'total',label:'Tổng tiền'},{key:'debt',label:'Còn nợ'},{key:'status',label:'Trạng thái'},
  ],
  customers:[
    {key:'name',label:'Khách hàng'},{key:'phone',label:'SĐT'},{key:'address',label:'Địa chỉ'},
    {key:'orders',label:'Số đơn'},{key:'revenue',label:'Doanh thu'},{key:'debt',label:'Công nợ'},
    {key:'last',label:'Mua gần nhất'},{key:'status',label:'Nhóm'},
  ],
  debt:[
    {key:'name',label:'Khách hàng'},{key:'phone',label:'SĐT'},{key:'invoiceCount',label:'HĐ nợ'},
    {key:'debt',label:'Công nợ'},{key:'oldest',label:'Nợ cũ nhất'},{key:'lastPaid',label:'Thu gần nhất'},
    {key:'risk',label:'Mức độ'},{key:'action',label:'Xử lý'},
  ],
}
const DEFAULT_TABLE_PREFS:Record<TableId,TablePrefs>={
  recent:{order:TABLE_COLUMNS.recent.map(x=>x.key),hidden:[]},
  history:{order:TABLE_COLUMNS.history.map(x=>x.key),hidden:[]},
  customers:{order:TABLE_COLUMNS.customers.map(x=>x.key),hidden:[]},
  debt:{order:TABLE_COLUMNS.debt.map(x=>x.key),hidden:[]},
}
const SALES_TABLE_PREFS_KEY='mynh-sales-preview-table-prefs-v1'

const money=(v:number)=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(v)
const SALES:Sale[]=[
  {id:'1',code:'POS-261002-00128',time:'02/10/2026 20:16',customer:'Nguyễn Văn An',phone:'0986 123 456',warehouse:'HN',total:685000,paid:500000,debt:185000,status:'PARTIAL',method:'Kết hợp',items:4},
  {id:'2',code:'POS-261002-00127',time:'02/10/2026 19:42',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:493000,paid:493000,debt:0,status:'PAID',method:'Chuyển khoản',items:3},
  {id:'3',code:'POS-261002-00126',time:'02/10/2026 18:05',customer:'Phạm Thu Trang',phone:'0388 223 344',warehouse:'BG',total:622000,paid:0,debt:622000,status:'UNPAID',method:'Ghi nợ',items:4},
  {id:'4',code:'POS-261002-00125',time:'02/10/2026 17:21',customer:'Lê Minh C',phone:'0966 456 789',warehouse:'HN',total:1163000,paid:1163000,debt:0,status:'PAID',method:'Tiền mặt',items:2},
  {id:'5',code:'POS-261002-00124',time:'02/10/2026 16:08',customer:'Bùi Lan Anh',phone:'0855 332 211',warehouse:'BG',total:410000,paid:210000,debt:200000,status:'PARTIAL',method:'Kết hợp',items:3},
  {id:'6',code:'POS-261002-00123',time:'02/10/2026 14:56',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:278000,paid:278000,debt:0,status:'PAID',method:'Tiền mặt',items:6},
]
const CUSTOMERS:Customer[]=[
  {id:'c1',name:'Nguyễn Văn An',phone:'0986 123 456',address:'Hoàng Mai, Hà Nội',orders:14,revenue:6850000,debt:185000,last:'02/10/2026 20:16',status:'VIP'},
  {id:'c2',name:'Phạm Thu Trang',phone:'0388 223 344',address:'Thanh Xuân, Hà Nội',orders:8,revenue:3380000,debt:622000,last:'02/10/2026 18:05',status:'DEBT'},
  {id:'c3',name:'Lê Minh C',phone:'0966 456 789',address:'Cầu Giấy, Hà Nội',orders:11,revenue:5240000,debt:0,last:'02/10/2026 17:21',status:'GOOD'},
  {id:'c4',name:'Bùi Lan Anh',phone:'0855 332 211',address:'Ba Đình, Hà Nội',orders:6,revenue:2110000,debt:410000,last:'02/10/2026 16:08',status:'DEBT'},
  {id:'c5',name:'Trần Thị Mai',phone:'0912 110 245',address:'Bắc Giang',orders:9,revenue:3960000,debt:0,last:'30/09/2026 20:18',status:'GOOD'},
]
const PRODUCTS=[
  ['OMO Matic 3kg','OMO-3KG-D','Túi 3kg',289000,18],
  ['Ensure Gold 850g','ENS-850','Lon',535000,6],
  ['Dove 640g','DOVE-640','Chai',195000,11],
  ['Nước rửa chén Sunlight','SUN-750','750g',64000,4],
  ['Coca Cola 1.5L','COKE-15','Chai',18000,26],
  ['Mì Hảo Hảo','MI-HAOHAO','Gói',4500,84],
] as const

function vnTimeValue(value:string){
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  if(!match)return value
  const [,d,m,y,h='00',min='00']=match
  return new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min)).getTime()
}
function cmp(a:string|number,b:string|number){
  if(typeof a==='number'&&typeof b==='number')return a-b
  return String(a).localeCompare(String(b),'vi',{numeric:true,sensitivity:'base'})
}
function SortHead({table,col,sort,onSort}:{table:TableId,col:{key:string,label:string},sort:{key:string,dir:SortDir},onSort:(table:TableId,key:string)=>void}){
  return <th><button className="sp-sort-head" type="button" onClick={()=>onSort(table,col.key)}><span>{col.label}</span>{sort.key===col.key&&<b>{sort.dir==='asc'?'↑':'↓'}</b>}</button></th>
}
function ColumnManager({table,prefs,open,setOpen,dragged,setDragged,onToggle,onMove,onReset}:{table:TableId,prefs:TablePrefs,open:boolean,setOpen:(table:TableId|null)=>void,dragged:{table:TableId,key:string}|null,setDragged:(v:{table:TableId,key:string}|null)=>void,onToggle:(table:TableId,key:string)=>void,onMove:(table:TableId,from:string,to:string)=>void,onReset:(table:TableId)=>void}){
  const labels=new Map(TABLE_COLUMNS[table].map(x=>[x.key,x.label]))
  return <div className="sp-column-manager-wrap">
    <button className={'sp-btn '+(open?'active':'')} type="button" onClick={()=>setOpen(open?null:table)}>☷ Cột</button>
    {open&&<div className="sp-column-menu" onClick={e=>e.stopPropagation()}>
      <div className="sp-column-menu-head"><div><b>Hiển thị & thứ tự cột</b><span>Kéo ⋮⋮ để sắp xếp</span></div><button type="button" onClick={()=>onReset(table)}>Đặt lại</button></div>
      <div className="sp-column-menu-list">{prefs.order.map(key=>{
        const hidden=prefs.hidden.includes(key)
        return <div className={'sp-column-menu-row '+(hidden?'hidden':'')} key={key} draggable
          onDragStart={()=>setDragged({table,key})}
          onDragOver={e=>e.preventDefault()}
          onDrop={()=>{if(dragged?.table===table)onMove(table,dragged.key,key);setDragged(null)}}
          onDragEnd={()=>setDragged(null)}>
          <span className="sp-drag-handle">⋮⋮</span>
          <label><input type="checkbox" checked={!hidden} onChange={()=>onToggle(table,key)}/><span>{labels.get(key)}</span></label>
        </div>
      })}</div>
    </div>}
  </div>
}
function Status({status}:{status:Sale['status']}){
  return <span className={'sp-status '+status.toLowerCase()}>{status==='PAID'?'Đã thanh toán':status==='PARTIAL'?'Một phần':'Chưa thanh toán'}</span>
}
function Kpi({tone,label,value,sub,onClick}:{tone:string,label:string,value:string,sub:string,onClick?:()=>void}){
  return <button type="button" className={'sp-kpi '+tone} onClick={onClick}><span>{label}</span><b>{value}</b><small>{sub}</small></button>
}
function Header({title,desc,actions}:{title:string,desc:string,actions?:React.ReactNode}){
  return <header className="sp-head"><div><span>BÁN HÀNG · PREVIEW</span><h1>{title}</h1><p>{desc}</p></div><div className="sp-head-actions">{actions}</div></header>
}

function PreviewNavIcon({kind}:{kind:'home'|'purchase'|'warehouse'|'sales'|'pos'|'history'|'customer'|'debt'|'finance'|'settings'}){
  const p={width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(kind==='home')return <svg {...p}><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/></svg>
  if(kind==='purchase')return <svg {...p}><path d="M6 3h12l2 5v13H4V8l2-5Z"/><path d="M4 8h16"/><path d="M9 12h6"/></svg>
  if(kind==='warehouse')return <svg {...p}><path d="M3 9 12 4l9 5v11H3Z"/><path d="M7 13h10"/><path d="M9 20v-7h6v7"/></svg>
  if(kind==='sales')return <svg {...p}><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>
  if(kind==='pos')return <svg {...p}><path d="M3 4h2l2.2 10h9.8l2-7H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>
  if(kind==='history')return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>
  if(kind==='customer')return <svg {...p}><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-4.3 3-6.5 7-6.5s6.4 2.2 7 6.5"/></svg>
  if(kind==='debt')return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10"/><path d="M7 14h6"/></svg>
  if(kind==='finance')return <svg {...p}><path d="M3 9h18"/><path d="M5 9V6l7-3 7 3v3"/><path d="M6 9v8M10 9v8M14 9v8M18 9v8"/><path d="M3 20h18"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V20.5h-3v-.09a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06-2.12-2.12.06-.06A1.8 1.8 0 0 0 6.6 15"/></svg>
}

export function SalesPreviewWorkspace(){
  const [view,setView]=useState<View>('overview')
  const [selectedSale,setSelectedSale]=useState<Sale|null>(null)
  const [selectedCustomer,setSelectedCustomer]=useState<Customer|null>(null)
  const [query,setQuery]=useState('')
  const [saleFilter,setSaleFilter]=useState<'ALL'|Sale['status']>('ALL')
  const [debtPanel,setDebtPanel]=useState<Customer|null>(null)
  const [tablePrefs,setTablePrefs]=useState<Record<TableId,TablePrefs>>(DEFAULT_TABLE_PREFS)
  const [tableSort,setTableSort]=useState<Record<TableId,{key:string,dir:SortDir}>>({
    recent:{key:'code',dir:'desc'},history:{key:'time',dir:'desc'},customers:{key:'revenue',dir:'desc'},debt:{key:'debt',dir:'desc'},
  })
  const [columnMenu,setColumnMenu]=useState<TableId|null>(null)
  const [draggedColumn,setDraggedColumn]=useState<{table:TableId,key:string}|null>(null)
  const [cart,setCart]=useState<{name:string,qty:number,price:number}[]>([
    {name:'OMO Matic 3kg',qty:1,price:289000},{name:'Dove 640g',qty:1,price:195000}
  ])

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(SALES_TABLE_PREFS_KEY)
      if(raw){
        const parsed=JSON.parse(raw) as Partial<Record<TableId,TablePrefs>>
        setTablePrefs(prev=>{
          const next={...prev}
          ;(['recent','history','customers','debt'] as TableId[]).forEach(table=>{
            const value=parsed[table]
            const allowed=new Set(TABLE_COLUMNS[table].map(x=>x.key))
            if(value&&Array.isArray(value.order)&&value.order.length===TABLE_COLUMNS[table].length&&value.order.every(x=>allowed.has(x))){
              next[table]={order:value.order,hidden:Array.isArray(value.hidden)?value.hidden.filter(x=>allowed.has(x)):[]}
            }
          })
          return next
        })
      }
    }catch{}
  },[])
  useEffect(()=>{try{localStorage.setItem(SALES_TABLE_PREFS_KEY,JSON.stringify(tablePrefs))}catch{}},[tablePrefs])
  useEffect(()=>{
    const close=(event:MouseEvent)=>{if(!(event.target as HTMLElement).closest('.sp-column-manager-wrap'))setColumnMenu(null)}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setColumnMenu(null)}
    document.addEventListener('mousedown',close);window.addEventListener('keydown',key)
    return ()=>{document.removeEventListener('mousedown',close);window.removeEventListener('keydown',key)}
  },[])

  function toggleColumn(table:TableId,key:string){
    setTablePrefs(prev=>{
      const current=prev[table]
      if(current.hidden.includes(key))return {...prev,[table]:{...current,hidden:current.hidden.filter(x=>x!==key)}}
      const visible=current.order.filter(x=>!current.hidden.includes(x))
      if(visible.length<=1)return prev
      return {...prev,[table]:{...current,hidden:[...current.hidden,key]}}
    })
  }
  function moveColumn(table:TableId,from:string,to:string){
    if(from===to)return
    setTablePrefs(prev=>{
      const current=prev[table],order=[...current.order],a=order.indexOf(from),b=order.indexOf(to)
      if(a<0||b<0)return prev
      order.splice(a,1);order.splice(b,0,from)
      return {...prev,[table]:{...current,order}}
    })
  }
  function resetColumns(table:TableId){setTablePrefs(prev=>({...prev,[table]:DEFAULT_TABLE_PREFS[table]}))}
  function changeSort(table:TableId,key:string){
    setTableSort(prev=>({...prev,[table]:prev[table].key===key?{key,dir:prev[table].dir==='asc'?'desc':'asc'}:{key,dir:'asc'}}))
  }
  function visibleColumns(table:TableId){return tablePrefs[table].order.filter(key=>!tablePrefs[table].hidden.includes(key)).map(key=>TABLE_COLUMNS[table].find(x=>x.key===key)!)}
  function saleValue(row:Sale,key:string){
    if(key==='time')return vnTimeValue(row.time)
    if(key==='code')return row.code
    if(key==='customer')return row.customer
    if(key==='warehouse')return row.warehouse
    if(key==='items')return row.items
    if(key==='method')return row.method
    if(key==='total')return row.total
    if(key==='paid')return row.paid
    if(key==='debt')return row.debt
    if(key==='status')return row.status
    return ''
  }
  function sortedSales(rows:Sale[],table:'recent'|'history'){
    const sort=tableSort[table]
    return [...rows].sort((a,b)=>(sort.dir==='asc'?1:-1)*cmp(saleValue(a,sort.key),saleValue(b,sort.key)))
  }
  function customerValue(row:Customer,key:string){
    if(key==='name')return row.name
    if(key==='phone')return row.phone
    if(key==='address')return row.address
    if(key==='orders')return row.orders
    if(key==='revenue')return row.revenue
    if(key==='debt')return row.debt
    if(key==='last')return vnTimeValue(row.last)
    if(key==='status')return row.status
    return ''
  }

  const filteredSales=useMemo(()=>SALES.filter(s=>{
    if(saleFilter!=='ALL'&&s.status!==saleFilter)return false
    if(query&&!([s.code,s.customer,s.phone,s.method].join(' ').toLowerCase().includes(query.toLowerCase())))return false
    return true
  }),[query,saleFilter])
  const historyRows=useMemo(()=>sortedSales(filteredSales,'history'),[filteredSales,tableSort.history])
  const recentRows=useMemo(()=>sortedSales(SALES.slice(0,5),'recent'),[tableSort.recent])
  const customerRows=useMemo(()=>{
    const sort=tableSort.customers
    return [...CUSTOMERS].sort((a,b)=>(sort.dir==='asc'?1:-1)*cmp(customerValue(a,sort.key),customerValue(b,sort.key)))
  },[tableSort.customers])
  const debtRows=useMemo(()=>{
    const rows:DebtRow[]=CUSTOMERS.filter(c=>c.debt>0).map((c,i)=>({...c,invoiceCount:i+1,oldest:i===1?'25/09/2026':'01/10/2026',lastPaid:i===1?'—':'01/10/2026 10:20',risk:i===1?'high':'medium'}))
    const sort=tableSort.debt
    const value=(row:DebtRow,key:string):string|number=>{
      if(key==='name')return row.name
      if(key==='phone')return row.phone
      if(key==='invoiceCount')return row.invoiceCount
      if(key==='debt')return row.debt
      if(key==='oldest')return vnTimeValue(row.oldest)
      if(key==='lastPaid')return row.lastPaid==='—'?0:vnTimeValue(row.lastPaid)
      if(key==='risk')return row.risk
      return ''
    }
    return rows.sort((a,b)=>(sort.dir==='asc'?1:-1)*cmp(value(a,sort.key),value(b,sort.key)))
  },[tableSort.debt])
  const cartTotal=cart.reduce((sum,x)=>sum+x.qty*x.price,0)
  const revenue=SALES.reduce((s,x)=>s+x.total,0)
  const collected=SALES.reduce((s,x)=>s+x.paid,0)
  const debt=SALES.reduce((s,x)=>s+x.debt,0)

  function saleCell(row:Sale,key:string,compact=false){
    if(key==='time')return <td key={key}>{row.time}</td>
    if(key==='code')return <td key={key}><b>{row.code}</b>{compact&&<small>{row.time}</small>}</td>
    if(key==='customer')return <td key={key}><b>{row.customer}</b>{!compact&&<small>{row.phone}</small>}</td>
    if(key==='warehouse')return <td key={key}>{row.warehouse}</td>
    if(key==='items')return <td key={key}>{row.items}</td>
    if(key==='method')return <td key={key}>{row.method}</td>
    if(key==='total')return <td key={key} className="money">{money(row.total)}</td>
    if(key==='paid')return <td key={key} className="income">{money(row.paid)}</td>
    if(key==='debt')return <td key={key} className={row.debt?'expense':''}>{row.debt?money(row.debt):'—'}</td>
    return <td key={key}><Status status={row.status}/></td>
  }
  function customerCell(row:Customer,key:string){
    if(key==='name')return <td key={key}><b>{row.name}</b></td>
    if(key==='phone')return <td key={key}>{row.phone}</td>
    if(key==='address')return <td key={key}>{row.address}</td>
    if(key==='orders')return <td key={key}>{row.orders}</td>
    if(key==='revenue')return <td key={key} className="income">{money(row.revenue)}</td>
    if(key==='debt')return <td key={key} className={row.debt?'expense':''}>{row.debt?money(row.debt):'—'}</td>
    if(key==='last')return <td key={key}>{row.last}</td>
    return <td key={key}><span className={'sp-customer-tag '+row.status.toLowerCase()}>{row.status==='VIP'?'VIP':row.status==='DEBT'?'Đang nợ':'Ổn định'}</span></td>
  }
  function debtCell(row:DebtRow,key:string){
    if(key==='name')return <td key={key}><b>{row.name}</b><small>{row.address}</small></td>
    if(key==='phone')return <td key={key}>{row.phone}</td>
    if(key==='invoiceCount')return <td key={key}>{row.invoiceCount}</td>
    if(key==='debt')return <td key={key} className="expense"><b>{money(row.debt)}</b></td>
    if(key==='oldest')return <td key={key}>{row.oldest}</td>
    if(key==='lastPaid')return <td key={key}>{row.lastPaid}</td>
    if(key==='risk')return <td key={key}><span className={'sp-risk '+row.risk}>{row.risk==='high'?'Ưu tiên':'Theo dõi'}</span></td>
    return <td key={key}><button className="sp-btn small primary" onClick={e=>{e.stopPropagation();setDebtPanel(row)}}>Thu nợ</button></td>
  }

  const openView=(next:View)=>{setView(next);setSelectedSale(null);setSelectedCustomer(null);setDebtPanel(null)}
  const salesNav:[View,string,'sales'|'pos'|'history'|'customer'|'debt'][]=[
    ['overview','Tổng quan bán hàng','sales'],
    ['pos','POS','pos'],
    ['history','Lịch sử bán','history'],
    ['customers','Khách hàng','customer'],
    ['debt','Công nợ','debt'],
  ]
  return <div className="shell sales-preview-shell">
    <aside className="sidebar sales-preview-sidebar">
      <div className="brand"><span className="brand-mark small">M</span><span><b>MYNH ERP</b><small>HỆ THỐNG VẬN HÀNH</small></span></div>
      <nav className="nav" aria-label="Điều hướng Preview">
        <section className="nav-group">
          <div className="nav-section-label">TỔNG QUAN</div>
          <div className="nav-group-items"><button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="home"/></span><span>Tổng quan hệ thống</span></button></div>
        </section>
        <section className="nav-group">
          <div className="nav-section-label">MUA HÀNG</div>
          <div className="nav-group-items">
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="purchase"/></span><span>Tổng quan mua hàng</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="customer"/></span><span>Tài khoản mua hàng</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="purchase"/></span><span>Đơn nhập hàng</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="history"/></span><span>Cảnh báo vận chuyển</span></button>
          </div>
        </section>
        <section className="nav-group">
          <div className="nav-section-label">VẬN HÀNH KHO</div>
          <div className="nav-group-items">
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="warehouse"/></span><span>Tổng quan kho</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="warehouse"/></span><span>Nhập kho</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="warehouse"/></span><span>Tồn kho</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="history"/></span><span>Lịch sử kho</span></button>
          </div>
        </section>
        <section className="nav-group">
          <div className="nav-section-label">BÁN HÀNG</div>
          <div className="nav-group-items">
            {salesNav.map(([key,label,icon])=><button key={key} className={view===key?'active':''} onClick={()=>openView(key)}><span className="nav-icon"><PreviewNavIcon kind={icon}/></span><span>{label}</span></button>)}
          </div>
        </section>
        <section className="nav-group">
          <div className="nav-section-label">TÀI CHÍNH</div>
          <div className="nav-group-items">
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="finance"/></span><span>Tổng quan tài chính</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="finance"/></span><span>Thu / Chi</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="finance"/></span><span>Đối soát & Thanh toán</span></button>
            <button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="finance"/></span><span>Báo cáo tài chính</span></button>
          </div>
        </section>
        <section className="nav-group">
          <div className="nav-section-label">HỆ THỐNG</div>
          <div className="nav-group-items"><button className="sales-preview-nav-static"><span className="nav-icon"><PreviewNavIcon kind="settings"/></span><span>Cài đặt hệ thống</span></button></div>
        </section>
      </nav>
      <div className="sidebar-foot">
        <div className="account"><b>Sales Preview</b><span>Chưa ghi vào main</span></div>
      </div>
    </aside>
    <main className="main sales-preview-main">
      <div className="sales-preview-root">
        <div className="sp-preview-banner"><b>PREVIEW RIÊNG · BÁN HÀNG</b><span>Khung tỷ lệ sử dụng đúng sidebar 216px của MYNH ERP</span></div>

    {view==='overview'&&<div className="sp-screen">
      <Header title="Tổng quan bán hàng" desc="Doanh thu, dòng tiền, khách hàng và cảnh báo bán hàng trên cùng một màn hình"
        actions={<><button className="sp-btn">Lịch sử bán</button><button className="sp-btn primary" onClick={()=>setView('pos')}>Mở POS</button></>}/>
      <div className="sp-period"><button className="active">Toàn thời gian</button><button>Hôm nay</button><button>7 ngày</button><button>Tháng này</button><select><option>Tất cả kho</option><option>Kho HN</option><option>Kho BG</option></select></div>
      <section className="sp-kpis seven">
        <Kpi tone="blue" label="Doanh thu" value={money(revenue)} sub="6 hóa đơn"/>
        <Kpi tone="green" label="Đã thu" value={money(collected)} sub="Tiền thực nhận"/>
        <Kpi tone="amber" label="Công nợ mới" value={money(debt)} sub="3 khách đang nợ" onClick={()=>setView('debt')}/>
        <Kpi tone="purple" label="Khách mua" value="5" sub="4 khách có hồ sơ"/>
        <Kpi tone="cyan" label="Sản phẩm bán" value="22" sub="6 SKU"/>
        <Kpi tone="navy" label="Giá trị TB/HĐ" value={money(Math.round(revenue/SALES.length))} sub="Trung bình"/>
        <Kpi tone="red" label="Tồn thấp" value="2" sub="Cần bổ sung"/>
      </section>
      <div className="sp-overview-grid">
        <section className="sp-card revenue-card">
          <div className="sp-card-head"><div><b>Doanh thu theo ngày</b><span>Màu xanh = doanh thu thực tế</span></div><strong>{money(revenue)}</strong></div>
          <div className="sp-bars">
            {[['27/09',620000],['28/09',980000],['29/09',1340000],['30/09',890000],['01/10',1580000],['02/10',3651000]].map(([d,v])=><div key={d as string}><span>{d}</span><i><em style={{width:(Number(v)/3651000*100)+'%'}}/></i><b>{money(Number(v))}</b></div>)}
          </div>
        </section>
        <section className="sp-card payment-card">
          <div className="sp-card-head"><div><b>Tình trạng thanh toán</b><span>Phân biệt rõ đã thu / công nợ</span></div></div>
          <div className="sp-payment-ring">
            <div className="sp-donut"><b>71%</b><span>đã thu</span></div>
            <div className="sp-legend">
              <div className="green"><i/><span>Đã thanh toán</span><b>3 HĐ</b></div>
              <div className="amber"><i/><span>Một phần</span><b>2 HĐ</b></div>
              <div className="red"><i/><span>Chưa thanh toán</span><b>1 HĐ</b></div>
            </div>
          </div>
        </section>
        <section className="sp-card customer-card">
          <div className="sp-card-head"><div><b>Khách hàng cần chú ý</b><span>Công nợ và tần suất mua</span></div><button onClick={()=>setView('customers')}>Xem tất cả</button></div>
          {CUSTOMERS.slice(0,4).map(c=><div className="sp-customer-row" key={c.id}><span><b>{c.name}</b><small>{c.phone} · {c.orders} đơn</small></span><span className={c.debt?'debt':'ok'}><b>{c.debt?money(c.debt):'Không nợ'}</b><small>{c.status==='VIP'?'Khách VIP':c.debt?'Cần theo dõi':'Ổn định'}</small></span></div>)}
        </section>
        <section className="sp-card stock-card">
          <div className="sp-card-head"><div><b>Cảnh báo tồn bán</b><span>Chỉ SKU cần hành động</span></div></div>
          <div className="sp-stock-alert red"><span><b>Sunlight 750g</b><small>SUN-750 · Kho HN</small></span><strong>4</strong></div>
          <div className="sp-stock-alert amber"><span><b>Ensure Gold 850g</b><small>ENS-850 · Kho BG</small></span><strong>6</strong></div>
          <div className="sp-stock-alert green"><span><b>Dove 640g</b><small>DOVE-640 · Kho HN</small></span><strong>11</strong></div>
        </section>
      </div>
      <section className="sp-card sp-recent">
        <div className="sp-card-head"><div><b>Giao dịch gần nhất</b><span>Click tiêu đề để sắp xếp · kéo cột trong menu Cột</span></div><div className="sp-card-actions"><button onClick={()=>setView('history')}>Mở lịch sử</button><ColumnManager table="recent" prefs={tablePrefs.recent} open={columnMenu==='recent'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/></div></div>
        <div className="sp-table-scroll"><table><thead><tr>{visibleColumns('recent').map(col=><SortHead key={col.key} table="recent" col={col} sort={tableSort.recent} onSort={changeSort}/>)}</tr></thead>
          <tbody>{recentRows.map(row=><tr key={row.id} onClick={()=>{setSelectedSale(row);setView('history')}}>{visibleColumns('recent').map(col=>saleCell(row,col.key,true))}</tr>)}</tbody>
        </table></div>
      </section>
    </div>}

    {view==='pos'&&<div className="sp-screen sp-pos-screen">
      <Header title="POS bán hàng" desc="Bán nhanh, nhìn rõ tồn kho, giá bán và trạng thái thanh toán"
        actions={<><span className="sp-live"><i/> POS sẵn sàng</span><button className="sp-btn">Đơn tạm (2)</button></>}/>
      <section className="sp-kpis four">
        <Kpi tone="blue" label="Kho bán" value="HN" sub="Kho Hà Nội"/>
        <Kpi tone="green" label="SKU có tồn" value="148" sub="Có thể bán"/>
        <Kpi tone="amber" label="Tồn thấp" value="12" sub="≤ 10 sản phẩm"/>
        <Kpi tone="purple" label="Doanh thu hôm nay" value={money(3651000)} sub="6 hóa đơn"/>
      </section>
      <div className="sp-pos-toolbar"><select><option>Kho HN · Hà Nội</option><option>Kho BG · Bắc Giang</option></select><input placeholder="Tìm tên sản phẩm / SKU / quét barcode..."/><button className="sp-btn">Gắn khách</button></div>
      <div className="sp-pos-grid">
        <section className="sp-products">
          <div className="sp-section-title"><div><span>SẢN PHẨM ĐANG BÁN</span><b>Kho HN · 148 SKU có tồn</b></div><strong>Chọn để thêm vào giỏ</strong></div>
          <div className="sp-product-grid">{PRODUCTS.map(p=><button key={p[1]} onClick={()=>setCart(prev=>[...prev,{name:p[0],qty:1,price:p[3]}])} className={(p[4] as number)<=6?'low':''}><div><b>{p[0]}</b><span>{p[2]}</span></div><small>{p[1]}</small><footer><strong>{money(p[3] as number)}</strong><em>{p[4]} tồn</em></footer></button>)}</div>
        </section>
        <aside className="sp-cart">
          <div className="sp-cart-head"><div><span>HÓA ĐƠN HIỆN TẠI</span><b>Giỏ hàng · {cart.reduce((s,x)=>s+x.qty,0)} SP</b><small>Khách lẻ · Kho HN</small></div><button onClick={()=>setCart([])}>Xóa giỏ</button></div>
          <div className="sp-cart-lines">{cart.length===0?<div className="sp-empty">Chưa có sản phẩm</div>:cart.map((line,i)=><div className="sp-cart-line" key={i}><span><b>{line.name}</b><small>{money(line.price)}</small></span><div><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:Math.max(1,x.qty-1)}:x))}>−</button><b>{line.qty}</b><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:x.qty+1}:x))}>+</button></div><strong>{money(line.qty*line.price)}</strong></div>)}</div>
          <div className="sp-cart-customer"><span>Khách hàng</span><b>Khách lẻ</b><button>Gắn khách</button></div>
          <div className="sp-cart-summary"><div><span>Tiền hàng</span><b>{money(cartTotal)}</b></div><div><span>Giảm giá</span><b>0 ₫</b></div><div className="total"><span>PHẢI THU</span><b>{money(cartTotal)}</b></div></div>
          <div className="sp-pay-actions"><button>Giữ</button><button className="cash">Tiền mặt</button><button className="transfer">Chuyển khoản</button><button className="debt">Ghi nợ</button></div>
        </aside>
      </div>
    </div>}

    {view==='history'&&<div className={'sp-screen sp-with-panel '+(selectedSale?'open':'')}>
      <main>
        <Header title="Lịch sử bán" desc="Tra cứu hóa đơn, thanh toán và công nợ phát sinh"
          actions={<button className="sp-btn primary" onClick={()=>setView('pos')}>+ Bán hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="blue" label="Tổng hóa đơn" value="128" sub="Tháng này"/>
          <Kpi tone="green" label="Đã thanh toán" value="96" sub="75%"/>
          <Kpi tone="amber" label="Một phần" value="21" sub="Còn công nợ"/>
          <Kpi tone="red" label="Chưa thanh toán" value="11" sub="Cần theo dõi"/>
          <Kpi tone="purple" label="Doanh thu" value={money(48260000)} sub="Tháng này"/>
        </section>
        <div className="sp-toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã hóa đơn / khách hàng / SĐT..."/><select value={saleFilter} onChange={e=>setSaleFilter(e.target.value as any)}><option value="ALL">Tất cả trạng thái</option><option value="PAID">Đã thanh toán</option><option value="PARTIAL">Một phần</option><option value="UNPAID">Chưa thanh toán</option></select><select><option>Tất cả kho</option></select><ColumnManager table="history" prefs={tablePrefs.history} open={columnMenu==='history'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/></div>
        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table><thead><tr>{visibleColumns('history').map(col=><SortHead key={col.key} table="history" col={col} sort={tableSort.history} onSort={changeSort}/>)}</tr></thead><tbody>{historyRows.map(row=><tr key={row.id} className={selectedSale?.id===row.id?'selected':''} onClick={()=>setSelectedSale(row)}>{visibleColumns('history').map(col=>saleCell(row,col.key))}</tr>)}</tbody></table></div></section>
      </main>
      {selectedSale&&<aside className="sp-slidebar"><div className="sp-panel-head"><div><span>CHI TIẾT HÓA ĐƠN</span><h2>{selectedSale.code}</h2><p>{selectedSale.customer} · {selectedSale.time}</p></div><button onClick={()=>setSelectedSale(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Thông tin</button><button>Thanh toán</button><button>Lịch sử</button></div><div className="sp-panel-scroll"><div className="sp-detail-grid"><div><span>Khách hàng</span><b>{selectedSale.customer}</b></div><div><span>Kho bán</span><b>{selectedSale.warehouse}</b></div><div><span>Phương thức</span><b>{selectedSale.method}</b></div><div><span>Trạng thái</span><Status status={selectedSale.status}/></div></div><div className="sp-money-box"><div><span>Tổng hóa đơn</span><b>{money(selectedSale.total)}</b></div><div className="income"><span>Đã thu</span><b>{money(selectedSale.paid)}</b></div><div className="expense"><span>Còn nợ</span><b>{money(selectedSale.debt)}</b></div></div><div className="sp-panel-section"><b>Sản phẩm</b>{PRODUCTS.slice(0,selectedSale.items>3?3:2).map(p=><div className="sp-mini-row" key={p[1]}><span><b>{p[0]}</b><small>{p[1]} · {p[2]}</small></span><strong>{money(p[3] as number)}</strong></div>)}</div></div></aside>}
    </div>}

    {view==='customers'&&<div className={'sp-screen sp-with-panel '+(selectedCustomer?'open':'')}>
      <main>
        <Header title="Khách hàng" desc="Hồ sơ mua hàng, doanh thu và công nợ theo từng khách"
          actions={<button className="sp-btn primary">+ Khách hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="blue" label="Tổng khách" value="248" sub="Có hồ sơ"/>
          <Kpi tone="green" label="Mua trong 30 ngày" value="86" sub="Đang hoạt động"/>
          <Kpi tone="purple" label="Khách VIP" value="18" sub="Doanh thu cao"/>
          <Kpi tone="amber" label="Khách đang nợ" value="27" sub={money(2860000)}/>
          <Kpi tone="red" label="Nợ từ 7 ngày" value="6" sub="Cần xử lý"/>
        </section>
        <div className="sp-toolbar"><input placeholder="Tìm tên / SĐT / địa chỉ..."/><select><option>Tất cả khách</option><option>Đang nợ</option><option>VIP</option></select><ColumnManager table="customers" prefs={tablePrefs.customers} open={columnMenu==='customers'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/></div>
        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table><thead><tr>{visibleColumns('customers').map(col=><SortHead key={col.key} table="customers" col={col} sort={tableSort.customers} onSort={changeSort}/>)}</tr></thead><tbody>{customerRows.map(row=><tr key={row.id} className={selectedCustomer?.id===row.id?'selected':''} onClick={()=>setSelectedCustomer(row)}>{visibleColumns('customers').map(col=>customerCell(row,col.key))}</tr>)}</tbody></table></div></section>
      </main>
      {selectedCustomer&&<aside className="sp-slidebar"><div className="sp-panel-head"><div><span>KHÁCH HÀNG</span><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.phone} · {selectedCustomer.address}</p></div><button onClick={()=>setSelectedCustomer(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Tổng quan</button><button>Lịch sử mua</button><button>Công nợ</button></div><div className="sp-panel-scroll"><div className="sp-customer-summary"><Kpi tone="blue" label="Số đơn" value={String(selectedCustomer.orders)} sub="Toàn thời gian"/><Kpi tone="green" label="Doanh thu" value={money(selectedCustomer.revenue)} sub="Tổng mua"/><Kpi tone={selectedCustomer.debt?'amber':'green'} label="Công nợ" value={money(selectedCustomer.debt)} sub={selectedCustomer.debt?'Cần theo dõi':'Không nợ'}/></div><div className="sp-panel-section"><b>Giao dịch gần đây</b>{SALES.filter(s=>s.customer===selectedCustomer.name).map(s=><div className="sp-mini-row" key={s.id}><span><b>{s.code}</b><small>{s.time}</small></span><strong>{money(s.total)}</strong></div>)}</div></div></aside>}
    </div>}

    {view==='debt'&&<div className={'sp-screen sp-with-panel '+(debtPanel?'open':'')}>
      <main>
        <Header title="Công nợ khách hàng" desc="Theo dõi số tiền còn phải thu và thao tác thu nợ theo khách"
          actions={<button className="sp-btn" onClick={()=>setView('customers')}>Khách hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="amber" label="Tổng công nợ" value={money(2860000)} sub="27 khách"/>
          <Kpi tone="red" label="Nợ từ 7 ngày" value={money(860000)} sub="6 khách"/>
          <Kpi tone="purple" label="Hóa đơn còn nợ" value="34" sub="Chưa thu đủ"/>
          <Kpi tone="green" label="Đã thu hôm nay" value={money(1250000)} sub="8 phiếu thu"/>
          <Kpi tone="blue" label="Thu trong tháng" value={money(14380000)} sub="92 phiếu thu"/>
        </section>
        <div className="sp-toolbar"><input placeholder="Tìm khách / SĐT / mã hóa đơn..."/><select><option>Tất cả công nợ</option><option>Nợ một phần</option><option>Nợ từ 7 ngày</option></select><button className="sp-btn">Bộ lọc</button><ColumnManager table="debt" prefs={tablePrefs.debt} open={columnMenu==='debt'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/></div>
        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table><thead><tr>{visibleColumns('debt').map(col=><SortHead key={col.key} table="debt" col={col} sort={tableSort.debt} onSort={changeSort}/>)}</tr></thead><tbody>{debtRows.map(row=><tr key={row.id}>{visibleColumns('debt').map(col=>debtCell(row,col.key))}</tr>)}</tbody></table></div></section>
      </main>
      {debtPanel&&<aside className="sp-slidebar"><div className="sp-panel-head amber"><div><span>THU CÔNG NỢ</span><h2>{debtPanel.name}</h2><p>{debtPanel.phone}</p></div><button onClick={()=>setDebtPanel(null)}>×</button></div><div className="sp-panel-tabs"><button className="active">Thu tiền</button><button>Phân bổ</button><button>Lịch sử</button></div><div className="sp-panel-scroll"><div className="sp-debt-total"><span>Số tiền cần thu</span><b>{money(debtPanel.debt)}</b><small>2 hóa đơn còn công nợ</small></div><div className="sp-payment-methods"><button className="active">Tiền mặt</button><button>Chuyển khoản</button><button>Kết hợp</button></div><div className="sp-panel-section"><b>Phân bổ vào hóa đơn</b><div className="sp-mini-row"><span><b>POS-261002-00128</b><small>02/10/2026 20:16</small></span><strong>{money(debtPanel.debt)}</strong></div></div><div className="sp-panel-actions"><button className="sp-btn">In phiếu thu</button><button className="sp-btn primary">Xác nhận thu {money(debtPanel.debt)}</button></div></div></aside>}
    </div>}
      </div>
    </main>
  </div>
}
