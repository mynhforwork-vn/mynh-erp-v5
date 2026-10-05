'use client'
import { useEffect,useMemo,useRef,useState } from 'react'

type View='overview'|'pos'|'history'|'customers'|'debt'
type Sale={id:string,code:string,time:string,customer:string,phone:string,warehouse:string,total:number,paid:number,debt:number,status:'PAID'|'PARTIAL'|'UNPAID',saleStatus:'COMPLETED'|'CANCELLED'|'PARTIAL_RETURN'|'RETURNED',method:string,items:number}
type Customer={id:string,name:string,phone:string,address:string,orders:number,revenue:number,debt:number,last:string,status:'GOOD'|'DEBT'|'VIP'}
type TableId='recent'|'history'|'customers'|'debt'
type SortDir='asc'|'desc'
type TablePrefs={order:string[],hidden:string[]}
type DebtRow=Customer&{invoiceCount:number,oldest:string,lastPaid:string,risk:'high'|'medium'}
type SalePanelTab='INFO'|'PRODUCTS'|'PAYMENT'|'HISTORY'
type CustomerPanelTab='OVERVIEW'|'PURCHASES'|'DEBT'|'HISTORY'
type DebtPanelTab='OVERVIEW'|'INVOICES'|'PAY'|'ALLOCATE'|'HISTORY'
type DebtPaymentMethod='CASH'|'TRANSFER'|'COMBINED'
type DebtReceipt={id:string,code:string,customerId:string,time:string,amount:number,method:string,note:string,allocations:{saleId:string,code:string,amount:number}[]}
type Period='all'|'today'|'week'|'7d'|'30d'|'month'|'quarter'|'year'|'custom'
type PosPaymentMode='cash'|'transfer'|'debt'|'combined'
type PosCategory={id:string,name:string,active:boolean}
type PosCartLine={name:string,sku:string,variant:string,qty:number,price:number,stock:number,barcode:string}
type HeldOrder={id:string,time:string,warehouse:'HN'|'BG',customerId:string,cart:PosCartLine[],discount:number,otherFee:number,note:string}
type PreviewReceipt={code:string,time:string,warehouse:string,customer:string,total:number,paid:number,debt:number,method:string,items:PosCartLine[],note:string,transferRef:string}
type SaleItemSeed={saleId:string,sku:string,name:string,qty:number,revenue:number,warehouse:'HN'|'BG'}

const TABLE_COLUMNS:Record<TableId,{key:string,label:string}[]>={
  recent:[
    {key:'code',label:'Mã HĐ'},{key:'customer',label:'Khách hàng'},{key:'warehouse',label:'Kho'},
    {key:'method',label:'Thanh toán'},{key:'total',label:'Tổng tiền'},{key:'paid',label:'Đã thu'},
    {key:'debt',label:'Còn nợ'},{key:'status',label:'Trạng thái'},
  ],
  history:[
    {key:'time',label:'Thời gian'},{key:'code',label:'Mã HĐ'},{key:'customer',label:'Khách hàng'},
    {key:'warehouse',label:'Kho'},{key:'items',label:'SP'},{key:'method',label:'Phương thức'},
    {key:'total',label:'Tổng tiền'},{key:'debt',label:'Còn nợ'},{key:'status',label:'Thanh toán'},{key:'saleStatus',label:'Trạng thái'},
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
  {id:'1',code:'POS-261004-00128',time:'04/10/2026 20:16',customer:'Nguyễn Văn An',phone:'0986 123 456',warehouse:'HN',total:685000,paid:500000,debt:185000,status:'PARTIAL',saleStatus:'COMPLETED',method:'Kết hợp',items:4},
  {id:'2',code:'POS-261004-00127',time:'04/10/2026 19:42',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:493000,paid:493000,debt:0,status:'PAID',saleStatus:'COMPLETED',method:'Chuyển khoản',items:3},
  {id:'3',code:'POS-261003-00126',time:'03/10/2026 18:05',customer:'Phạm Thu Trang',phone:'0388 223 344',warehouse:'BG',total:622000,paid:0,debt:622000,status:'UNPAID',saleStatus:'COMPLETED',method:'Ghi nợ',items:4},
  {id:'4',code:'POS-261002-00125',time:'02/10/2026 17:21',customer:'Lê Minh C',phone:'0966 456 789',warehouse:'HN',total:1163000,paid:1163000,debt:0,status:'PAID',saleStatus:'COMPLETED',method:'Tiền mặt',items:2},
  {id:'5',code:'POS-261001-00124',time:'01/10/2026 16:08',customer:'Bùi Lan Anh',phone:'0855 332 211',warehouse:'BG',total:410000,paid:210000,debt:200000,status:'PARTIAL',saleStatus:'PARTIAL_RETURN',method:'Kết hợp',items:3},
  {id:'6',code:'POS-260930-00123',time:'30/09/2026 14:56',customer:'Khách lẻ',phone:'—',warehouse:'HN',total:278000,paid:278000,debt:0,status:'PAID',saleStatus:'COMPLETED',method:'Tiền mặt',items:6},
]
const CUSTOMERS:Customer[]=[
  {id:'c1',name:'Nguyễn Văn An',phone:'0986 123 456',address:'Hoàng Mai, Hà Nội',orders:14,revenue:6850000,debt:185000,last:'02/10/2026 20:16',status:'VIP'},
  {id:'c2',name:'Phạm Thu Trang',phone:'0388 223 344',address:'Thanh Xuân, Hà Nội',orders:8,revenue:3380000,debt:622000,last:'02/10/2026 18:05',status:'DEBT'},
  {id:'c3',name:'Lê Minh C',phone:'0966 456 789',address:'Cầu Giấy, Hà Nội',orders:11,revenue:5240000,debt:0,last:'02/10/2026 17:21',status:'GOOD'},
  {id:'c4',name:'Bùi Lan Anh',phone:'0855 332 211',address:'Ba Đình, Hà Nội',orders:6,revenue:2110000,debt:410000,last:'02/10/2026 16:08',status:'DEBT'},
  {id:'c5',name:'Trần Thị Mai',phone:'0912 110 245',address:'Bắc Giang',orders:9,revenue:3960000,debt:0,last:'30/09/2026 20:18',status:'GOOD'},
]
const PRODUCTS=[
  ['OMO Matic 3kg','OMO-3KG-D','Túi 3kg',289000,18,'household','8934868123001',12],
  ['Ensure Gold 850g','ENS-850','Lon',535000,6,'nutrition','8710428015884',9],
  ['Dove 640g','DOVE-640','Chai',195000,11,'personal','8934868176403',7],
  ['Nước rửa chén Sunlight','SUN-750','750g',64000,4,'household','8934868117505',16],
  ['Coca Cola 1.5L','COKE-15','Chai',18000,26,'beverage','8935049500124',21],
  ['Mì Hảo Hảo','MI-HAOHAO','Gói',4500,84,'food','8934563138164',65],
] as const
const SALE_ITEMS:SaleItemSeed[]=[
  {saleId:'1',sku:'OMO-3KG-D',name:'OMO Matic 3kg',qty:1,revenue:289000,warehouse:'HN'},
  {saleId:'1',sku:'DOVE-640',name:'Dove 640g',qty:2,revenue:390000,warehouse:'HN'},
  {saleId:'1',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',qty:1,revenue:6000,warehouse:'HN'},
  {saleId:'2',sku:'ENS-850',name:'Ensure Gold 850g',qty:1,revenue:535000,warehouse:'HN'},
  {saleId:'2',sku:'COKE-15',name:'Coca Cola 1.5L',qty:3,revenue:54000,warehouse:'HN'},
  {saleId:'3',sku:'ENS-850',name:'Ensure Gold 850g',qty:1,revenue:535000,warehouse:'BG'},
  {saleId:'3',sku:'SUN-750',name:'Nước rửa chén Sunlight',qty:1,revenue:64000,warehouse:'BG'},
  {saleId:'4',sku:'OMO-3KG-D',name:'OMO Matic 3kg',qty:3,revenue:867000,warehouse:'HN'},
  {saleId:'4',sku:'DOVE-640',name:'Dove 640g',qty:1,revenue:296000,warehouse:'HN'},
  {saleId:'5',sku:'COKE-15',name:'Coca Cola 1.5L',qty:10,revenue:180000,warehouse:'BG'},
  {saleId:'5',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',qty:20,revenue:90000,warehouse:'BG'},
  {saleId:'6',sku:'MI-HAOHAO',name:'Mì Hảo Hảo',qty:20,revenue:90000,warehouse:'HN'},
]
const DEFAULT_POS_CATEGORIES:PosCategory[]=[
  {id:'household',name:'Gia dụng',active:true},
  {id:'nutrition',name:'Sữa & dinh dưỡng',active:true},
  {id:'personal',name:'Chăm sóc cá nhân',active:true},
  {id:'beverage',name:'Đồ uống',active:true},
  {id:'food',name:'Thực phẩm',active:true},
]

function vnTimeValue(value:string){
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  if(!match)return value
  const [,d,m,y,h='00',min='00']=match
  return new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min)).getTime()
}
function dateKey(value:string){
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return match?`${match[3]}-${match[2]}-${match[1]}`:''
}
function periodMatch(value:string,period:Period,from:string,to:string){
  const ts=Number(vnTimeValue(value))
  if(period==='all')return true
  const now=new Date()
  const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()
  if(period==='today')return ts>=startToday
  if(period==='7d')return ts>=startToday-6*24*60*60*1000
  if(period==='30d')return ts>=startToday-29*24*60*60*1000
  if(period==='week'){
    const day=(now.getDay()+6)%7
    return ts>=startToday-day*24*60*60*1000
  }
  if(period==='month')return ts>=new Date(now.getFullYear(),now.getMonth(),1).getTime()
  if(period==='quarter'){
    const qStart=Math.floor(now.getMonth()/3)*3
    return ts>=new Date(now.getFullYear(),qStart,1).getTime()
  }
  if(period==='year')return ts>=new Date(now.getFullYear(),0,1).getTime()
  const key=dateKey(value)
  if(from&&key<from)return false
  if(to&&key>to)return false
  return true
}
function saleStatusLabel(status:Sale['saleStatus']){
  if(status==='COMPLETED')return 'Hoàn tất'
  if(status==='CANCELLED')return 'Đã huỷ'
  if(status==='PARTIAL_RETURN')return 'Hoàn một phần'
  return 'Đã hoàn toàn bộ'
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
  const [customerData,setCustomerData]=useState<Customer[]>(CUSTOMERS)
  const [customerQuery,setCustomerQuery]=useState('')
  const [customerFilter,setCustomerFilter]=useState<'ALL'|'REPEAT'|'NEW'|'DEBT'>('ALL')
  const [customerCreateOpen,setCustomerCreateOpen]=useState(false)
  const [customerDraft,setCustomerDraft]=useState({name:'',phone:'',address:''})
  const [salePanelTab,setSalePanelTab]=useState<SalePanelTab>('INFO')
  const [customerPanelTab,setCustomerPanelTab]=useState<CustomerPanelTab>('OVERVIEW')
  const [debtPanelTab,setDebtPanelTab]=useState<DebtPanelTab>('PAY')
  const [debtPaymentMethod,setDebtPaymentMethod]=useState<DebtPaymentMethod>('CASH')
  const [debtBalances,setDebtBalances]=useState<Record<string,number>>(()=>Object.fromEntries(CUSTOMERS.map(c=>[c.id,c.debt])))
  const [debtReceipts,setDebtReceipts]=useState<DebtReceipt[]>([
    {id:'r1',code:'PTN-261001-000014',customerId:'c1',time:'01/10/2026 10:20',amount:493000,method:'Chuyển khoản',note:'Thu công nợ kỳ trước',allocations:[]},
    {id:'r2',code:'PTN-260930-000020',customerId:'c4',time:'30/09/2026 15:21',amount:215000,method:'Tiền mặt',note:'',allocations:[]},
  ])
  const [debtCollectAmount,setDebtCollectAmount]=useState(0)
  const [debtCashPart,setDebtCashPart]=useState(0)
  const [debtTransferPart,setDebtTransferPart]=useState(0)
  const [debtNote,setDebtNote]=useState('')
  const [debtAllocations,setDebtAllocations]=useState<Record<string,number>>({})
  const [lastDebtReceipt,setLastDebtReceipt]=useState<DebtReceipt|null>(null)
  const [debtMessage,setDebtMessage]=useState('')
  const [debtQuery,setDebtQuery]=useState('')
  const [debtFilter,setDebtFilter]=useState<'ALL'|'PARTIAL'|'OVERDUE'>('ALL')
  const [salesRows,setSalesRows]=useState<Sale[]>(SALES)
  const [saleItems,setSaleItems]=useState<SaleItemSeed[]>(SALE_ITEMS)
  const [dashboardPeriod,setDashboardPeriod]=useState<Period>('all')
  const [dashboardFrom,setDashboardFrom]=useState('')
  const [dashboardTo,setDashboardTo]=useState('')
  const [dashboardWarehouse,setDashboardWarehouse]=useState<'ALL'|'HN'|'BG'>('ALL')
  const [historyPeriod,setHistoryPeriod]=useState<Period>('all')
  const [historyFrom,setHistoryFrom]=useState('')
  const [historyTo,setHistoryTo]=useState('')
  const [historyWarehouse,setHistoryWarehouse]=useState<'ALL'|'HN'|'BG'>('ALL')
  const [historySaleState,setHistorySaleState]=useState<'ALL'|Sale['saleStatus']>('ALL')
  const [selectedSaleIds,setSelectedSaleIds]=useState<string[]>([])
  const [posSearch,setPosSearch]=useState('')
  const [posWarehouse,setPosWarehouse]=useState<'HN'|'BG'>('HN')
  const [posCategory,setPosCategory]=useState('ALL')
  const [posCategories,setPosCategories]=useState<PosCategory[]>(DEFAULT_POS_CATEGORIES)
  const [categorySettingsOpen,setCategorySettingsOpen]=useState(false)
  const [newCategoryName,setNewCategoryName]=useState('')
  const [posCustomerId,setPosCustomerId]=useState('')
  const [posCustomerOpen,setPosCustomerOpen]=useState(false)
  const [posCreateCustomerOpen,setPosCreateCustomerOpen]=useState(false)
  const [posNewCustomer,setPosNewCustomer]=useState({name:'',phone:'',address:''})
  const [heldOrders,setHeldOrders]=useState<HeldOrder[]>([])
  const [heldOpen,setHeldOpen]=useState(false)
  const [posStocks,setPosStocks]=useState<Record<string,number>>(()=>Object.fromEntries(PRODUCTS.flatMap(p=>[[`HN:${p[1]}`,Number(p[4])],[`BG:${p[1]}`,Number(p[7])]])))
  const [transferRef,setTransferRef]=useState('')
  const [posReceipt,setPosReceipt]=useState<PreviewReceipt|null>(null)
  const [printReceipt,setPrintReceipt]=useState<PreviewReceipt|null>(null)
  const [posPaymentOpen,setPosPaymentOpen]=useState(false)
  const [posPaymentMode,setPosPaymentMode]=useState<PosPaymentMode>('cash')
  const [cashTendered,setCashTendered]=useState(0)
  const [combinedCash,setCombinedCash]=useState(0)
  const [combinedTransfer,setCombinedTransfer]=useState(0)
  const [posDiscount,setPosDiscount]=useState(0)
  const [posOtherFee,setPosOtherFee]=useState(0)
  const [posNote,setPosNote]=useState('')
  const [posExtrasOpen,setPosExtrasOpen]=useState(false)
  const [posMessage,setPosMessage]=useState('')
  const [query,setQuery]=useState('')
  const [saleFilter,setSaleFilter]=useState<'ALL'|Sale['status']>('ALL')
  const [debtPanel,setDebtPanel]=useState<Customer|null>(null)
  const [tablePrefs,setTablePrefs]=useState<Record<TableId,TablePrefs>>(DEFAULT_TABLE_PREFS)
  const [tableSort,setTableSort]=useState<Record<TableId,{key:string,dir:SortDir}>>({
    recent:{key:'code',dir:'desc'},history:{key:'time',dir:'desc'},customers:{key:'revenue',dir:'desc'},debt:{key:'debt',dir:'desc'},
  })
  const [columnMenu,setColumnMenu]=useState<TableId|null>(null)
  const [draggedColumn,setDraggedColumn]=useState<{table:TableId,key:string}|null>(null)
  const [cart,setCart]=useState<PosCartLine[]>([
    {name:'OMO Matic 3kg',sku:'OMO-3KG-D',variant:'Túi 3kg',qty:1,price:289000,stock:18,barcode:'8934868123001'},
    {name:'Dove 640g',sku:'DOVE-640',variant:'Chai',qty:1,price:195000,stock:11,barcode:'8934868176403'}
  ])
  const posSearchRef=useRef<HTMLInputElement|null>(null)
  const discountRef=useRef<HTMLInputElement|null>(null)

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
    if(key==='saleStatus')return row.saleStatus
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

  const dashboardSales=useMemo(()=>salesRows.filter(row=>{
    if(!periodMatch(row.time,dashboardPeriod,dashboardFrom,dashboardTo))return false
    if(dashboardWarehouse!=='ALL'&&row.warehouse!==dashboardWarehouse)return false
    return true
  }),[salesRows,dashboardPeriod,dashboardFrom,dashboardTo,dashboardWarehouse])

  const filteredSales=useMemo(()=>salesRows.filter(row=>{
    if(!periodMatch(row.time,historyPeriod,historyFrom,historyTo))return false
    if(historyWarehouse!=='ALL'&&row.warehouse!==historyWarehouse)return false
    if(saleFilter!=='ALL'&&row.status!==saleFilter)return false
    if(historySaleState!=='ALL'&&row.saleStatus!==historySaleState)return false
    if(query&&!([row.code,row.customer,row.phone,row.method].join(' ').toLowerCase().includes(query.toLowerCase())))return false
    return true
  }),[salesRows,query,saleFilter,historyPeriod,historyFrom,historyTo,historyWarehouse,historySaleState])

  const historyRows=useMemo(()=>sortedSales(filteredSales,'history'),[filteredSales,tableSort.history])
  const recentRows=useMemo(()=>sortedSales(dashboardSales.slice(0,5),'recent'),[dashboardSales,tableSort.recent])
  const customerRows=useMemo(()=>{
    const sort=tableSort.customers
    let rows=customerData.map(c=>({...c,debt:debtBalances[c.id]??c.debt}))
    if(customerFilter==='DEBT')rows=rows.filter(c=>c.debt>0)
    if(customerFilter==='REPEAT')rows=rows.filter(c=>c.orders>=2)
    if(customerFilter==='NEW')rows=rows.filter(c=>c.orders<=1)
    const q=customerQuery.trim().toLowerCase()
    if(q)rows=rows.filter(c=>[c.name,c.phone,c.address].join(' ').toLowerCase().includes(q))
    return rows.sort((a,b)=>(sort.dir==='asc'?1:-1)*cmp(customerValue(a,sort.key),customerValue(b,sort.key)))
  },[tableSort.customers,debtBalances,customerData,customerFilter,customerQuery])
  const debtRows=useMemo(()=>{
    let base=customerData.map(c=>({...c,debt:debtBalances[c.id]??c.debt})).filter(c=>c.debt>0)
    const q=debtQuery.trim().toLowerCase()
    if(q)base=base.filter(c=>[c.name,c.phone,c.address].join(' ').toLowerCase().includes(q)||salesRows.some(s=>s.customer===c.name&&s.code.toLowerCase().includes(q)))
    if(debtFilter==='PARTIAL')base=base.filter(c=>salesRows.some(s=>s.customer===c.name&&s.status==='PARTIAL'&&s.debt>0))
    const rows:DebtRow[]=base.map((c,i)=>({
      ...c,
      invoiceCount:Math.max(1,salesRows.filter(s=>s.customer===c.name&&s.debt>0).length),
      oldest:salesRows.filter(s=>s.customer===c.name&&s.debt>0).sort((a,b)=>Number(vnTimeValue(a.time))-Number(vnTimeValue(b.time)))[0]?.time.split(' ')[0]??(i===1?'25/09/2026':'01/10/2026'),
      lastPaid:debtReceipts.find(r=>r.customerId===c.id)?.time??'—',
      risk:(i===1?'high':'medium') as 'high'|'medium'
    }))
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
  },[tableSort.debt,debtBalances,debtReceipts,salesRows,customerData,debtQuery,debtFilter])

  const activeCategories=posCategories.filter(x=>x.active)
  const productStock=(sku:string,warehouse:'HN'|'BG'=posWarehouse)=>Math.max(0,Number(posStocks[`${warehouse}:${sku}`]??0))
  const filteredProducts=PRODUCTS.filter(product=>{
    if(productStock(String(product[1]))<=0)return false
    if(posCategory!=='ALL'&&product[5]!==posCategory)return false
    const q=posSearch.trim().toLowerCase()
    if(q&&![product[0],product[1],product[2],product[6]].join(' ').toLowerCase().includes(q))return false
    return true
  })
  const posCustomer=customerData.find(x=>x.id===posCustomerId)??null
  const cartSubtotal=cart.reduce((sum,x)=>sum+x.qty*x.price,0)
  const cartTotal=Math.max(0,cartSubtotal-Math.max(0,posDiscount)+Math.max(0,posOtherFee))
  const dashboardRevenue=dashboardSales.reduce((sum,x)=>sum+x.total,0)
  const dashboardCollected=dashboardSales.reduce((sum,x)=>sum+x.paid,0)
  const dashboardDebt=dashboardSales.reduce((sum,x)=>sum+x.debt,0)
  const dashboardCustomerCount=new Set(dashboardSales.filter(x=>x.customer!=='Khách lẻ').map(x=>x.customer)).size
  const dashboardUnits=dashboardSales.reduce((sum,x)=>sum+x.items,0)
  const dashboardPaidCount=dashboardSales.filter(x=>x.status==='PAID').length
  const dashboardPartialCount=dashboardSales.filter(x=>x.status==='PARTIAL').length
  const dashboardUnpaidCount=dashboardSales.filter(x=>x.status==='UNPAID').length
  const dashboardCollectedRate=dashboardRevenue?Math.round(dashboardCollected/dashboardRevenue*100):0
  const dashboardDaily=useMemo(()=>{
    const map=new Map<string,number>()
    for(const row of dashboardSales){
      const key=dateKey(row.time)
      map.set(key,(map.get(key)??0)+row.total)
    }
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-6)
  },[dashboardSales])
  const dashboardMaxDay=Math.max(...dashboardDaily.map(x=>x[1]),1)
  const dashboardSaleIds=new Set(dashboardSales.map(x=>x.id))
  const dashboardTopProducts=useMemo(()=>{
    const map=new Map<string,{sku:string,name:string,qty:number,revenue:number}>()
    for(const item of saleItems){
      if(!dashboardSaleIds.has(item.saleId))continue
      if(dashboardWarehouse!=='ALL'&&item.warehouse!==dashboardWarehouse)continue
      const current=map.get(item.sku)??{sku:item.sku,name:item.name,qty:0,revenue:0}
      current.qty+=item.qty;current.revenue+=item.revenue;map.set(item.sku,current)
    }
    return [...map.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,5)
  },[dashboardSales,dashboardWarehouse,saleItems])
  const historyRevenue=filteredSales.reduce((sum,x)=>sum+x.total,0)
  const activeDebtBalance=debtPanel?(debtBalances[debtPanel.id]??debtPanel.debt):0
  const debtInvoices=debtPanel?salesRows.filter(x=>x.customer===debtPanel.name&&x.debt>0).sort((a,b)=>Number(vnTimeValue(a.time))-Number(vnTimeValue(b.time))):[]
  const debtAllocatedTotal=Object.values(debtAllocations).reduce((sum,x)=>sum+Number(x||0),0)
  const debtReceiptsForPanel=debtPanel?debtReceipts.filter(x=>x.customerId===debtPanel.id):[]
  const totalDebtLive=Object.values(debtBalances).reduce((sum,x)=>sum+Math.max(0,Number(x||0)),0)
  const collectedDebtToday=debtReceipts.filter(x=>periodMatch(x.time,'today','','')).reduce((sum,x)=>sum+x.amount,0)
  const collectedDebtMonth=debtReceipts.filter(x=>periodMatch(x.time,'month','','')).reduce((sum,x)=>sum+x.amount,0)

  function autoAllocateDebt(customer:Customer,amount:number){
    let left=Math.max(0,amount)
    const allocations:Record<string,number>={}
    const rows=salesRows.filter(x=>x.customer===customer.name&&x.debt>0).sort((a,b)=>Number(vnTimeValue(a.time))-Number(vnTimeValue(b.time)))
    for(const row of rows){
      if(left<=0)break
      const value=Math.min(left,row.debt)
      allocations[row.id]=value
      left-=value
    }
    return allocations
  }
  function openDebtPanel(customer:Customer){
    const balance=debtBalances[customer.id]??customer.debt
    const live={...customer,debt:balance}
    setDebtPanel(live)
    setDebtPanelTab('PAY')
    setDebtPaymentMethod('CASH')
    setDebtCollectAmount(balance)
    setDebtCashPart(balance)
    setDebtTransferPart(0)
    setDebtNote('')
    setDebtAllocations(autoAllocateDebt(live,balance))
    setDebtMessage('')
    setLastDebtReceipt(null)
  }
  function updateDebtCollectAmount(value:number){
    if(!debtPanel)return
    const amount=Math.max(0,Math.min(activeDebtBalance,Number(value)||0))
    setDebtCollectAmount(amount)
    setDebtCashPart(amount)
    setDebtTransferPart(0)
    setDebtAllocations(autoAllocateDebt(debtPanel,amount))
  }
  function confirmDebtPayment(){
    if(!debtPanel)return
    const amount=Math.max(0,Number(debtCollectAmount)||0)
    if(amount<=0){setDebtMessage('Số tiền thu phải lớn hơn 0');return}
    if(amount>activeDebtBalance){setDebtMessage('Số tiền thu vượt công nợ hiện tại');return}
    if(debtPaymentMethod==='COMBINED'&&Math.round(debtCashPart+debtTransferPart)!==Math.round(amount)){
      setDebtMessage('Tiền mặt + Chuyển khoản phải bằng số tiền thu');return
    }
    if(Math.round(debtAllocatedTotal)!==Math.round(amount)){
      setDebtMessage('Số tiền phân bổ phải bằng số tiền thu');setDebtPanelTab('ALLOCATE');return
    }
    const now=new Date()
    const time=now.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false})
    const code='PTN-'+String(now.getFullYear()).slice(-2)+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'-'+String(Date.now()).slice(-6)
    const allocations=debtInvoices.filter(x=>Number(debtAllocations[x.id]||0)>0).map(x=>({saleId:x.id,code:x.code,amount:Number(debtAllocations[x.id]||0)}))
    const method=debtPaymentMethod==='CASH'?'Tiền mặt':debtPaymentMethod==='TRANSFER'?'Chuyển khoản':'Kết hợp'
    const receipt:DebtReceipt={id:'receipt-'+Date.now(),code,customerId:debtPanel.id,time,amount,method,note:debtNote,allocations}
    setSalesRows(prev=>prev.map(row=>{
      const paid=Number(debtAllocations[row.id]||0)
      if(paid<=0)return row
      const nextDebt=Math.max(0,row.debt-paid)
      const nextPaid=Math.min(row.total,row.paid+paid)
      return {...row,debt:nextDebt,paid:nextPaid,status:nextDebt<=0?'PAID':nextPaid>0?'PARTIAL':'UNPAID'}
    }))
    const nextBalance=Math.max(0,activeDebtBalance-amount)
    setDebtBalances(prev=>({...prev,[debtPanel.id]:nextBalance}))
    setDebtReceipts(prev=>[receipt,...prev])
    setLastDebtReceipt(receipt)
    setDebtPanel(prev=>prev?{...prev,debt:nextBalance}:prev)
    setDebtCollectAmount(nextBalance)
    setDebtCashPart(nextBalance)
    setDebtTransferPart(0)
    setDebtAllocations(autoAllocateDebt({...debtPanel,debt:nextBalance},nextBalance))
    setDebtMessage('Đã tạo '+code+' · Thu '+money(amount))
    setDebtPanelTab('HISTORY')
  }

  function setDashboardPeriodSafe(next:Period){setDashboardPeriod(next)}
  function setHistoryPeriodSafe(next:Period){setHistoryPeriod(next)}
  function addPosProduct(product:typeof PRODUCTS[number]){
    const [name,sku,,price]=product
    setCart(prev=>{
      const found=prev.find(x=>x.sku===sku)
      return found
        ? prev.map(x=>x.sku===sku?{...x,qty:x.qty+1}:x)
        : [...prev,{name,sku,qty:1,price}]
    })
  }
  function holdCurrentOrder(){
    if(!cart.length){setPosMessage('Giỏ hàng đang trống');return}
    setHeldOrders(prev=>[{id:'HOLD-'+Date.now(),cart:cart.map(x=>({...x}))},...prev].slice(0,20))
    setCart([])
    setPosMessage('Đã giữ đơn tạm')
  }
  function restoreHeldOrder(id:string){
    const order=heldOrders.find(x=>x.id===id)
    if(!order)return
    setCart(order.cart.map(x=>({...x})))
    setHeldOrders(prev=>prev.filter(x=>x.id!==id))
    setHeldOpen(false)
    setPosMessage('Đã mở lại đơn tạm')
  }
  function openPosPayment(mode:PosPaymentMode){
    setPosMessage('')
    if(!cart.length){setPosMessage('Giỏ hàng đang trống');return}
    if(mode==='debt'&&!posCustomer){setPosMessage('Ghi nợ cần gắn khách hàng trước');setPosCustomerOpen(true);return}
    setPosPaymentMode(mode)
    setCashTendered(cartTotal)
    setCombinedCash(0)
    setCombinedTransfer(0)
    setPosPaymentOpen(true)
  }
  function confirmPosPayment(){
    let paid=0
    let debt=0
    if(posPaymentMode==='cash'){
      if(cashTendered<cartTotal){setPosMessage('Tiền khách đưa chưa đủ');return}
      paid=cartTotal
    }else if(posPaymentMode==='transfer'){
      paid=cartTotal
    }else if(posPaymentMode==='debt'){
      if(!posCustomer){setPosMessage('Cần gắn khách hàng để ghi nợ');return}
      debt=cartTotal
    }else{
      if(combinedCash+combinedTransfer>cartTotal){setPosMessage('Tổng tiền nhận vượt số phải thu');return}
      paid=Math.max(0,combinedCash)+Math.max(0,combinedTransfer)
      debt=Math.max(0,cartTotal-paid)
      if(debt>0&&!posCustomer){setPosMessage('Phần còn nợ cần gắn khách hàng');return}
    }
    const now=new Date()
    const date=now.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
    const time=now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false})
    const code='POS-'+String(now.getFullYear()).slice(-2)+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'-'+String(Date.now()).slice(-5)
    const next:Sale={
      id:'preview-'+Date.now(),code,time:date+' '+time,customer:posCustomer?.name??'Khách lẻ',phone:posCustomer?.phone??'—',
      warehouse:posWarehouse,total:cartTotal,paid,debt,status:debt===0?'PAID':paid>0?'PARTIAL':'UNPAID',saleStatus:'COMPLETED',
      method:posPaymentMode==='cash'?'Tiền mặt':posPaymentMode==='transfer'?'Chuyển khoản':posPaymentMode==='debt'?'Ghi nợ':'Kết hợp',items:cart.reduce((sum,x)=>sum+x.qty,0)
    }
    setSalesRows(prev=>[next,...prev])
    if(debt>0&&posCustomer)setDebtBalances(prev=>({...prev,[posCustomer.id]:(prev[posCustomer.id]??posCustomer.debt)+debt}))
    setCart([])
    setPosPaymentOpen(false)
    setPosDiscount(0);setPosOtherFee(0);setPosNote('')
    setPosMessage((debt>0?'Đã ghi nhận hóa đơn công nợ ':'Thanh toán thành công ')+code)
  }
  function addCategory(){
    const name=newCategoryName.trim()
    if(!name)return
    const id='custom-'+Date.now()
    setPosCategories(prev=>[...prev,{id,name,active:true}])
    setNewCategoryName('')
  }
  function deleteSelectedSales(){
    if(!selectedSaleIds.length)return
    if(!window.confirm(`Xóa ${selectedSaleIds.length} hóa đơn khỏi dữ liệu Preview?`))return
    setSalesRows(prev=>prev.filter(x=>!selectedSaleIds.includes(x.id)))
    if(selectedSale&&selectedSaleIds.includes(selectedSale.id))setSelectedSale(null)
    setSelectedSaleIds([])
  }

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
    if(key==='status')return <td key={key}><Status status={row.status}/></td>
    return <td key={key}><span className={'sp-sale-state '+row.saleStatus.toLowerCase()}>{saleStatusLabel(row.saleStatus)}</span></td>
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
    return <td key={key}><button className="sp-btn small primary" onClick={e=>{e.stopPropagation();openDebtPanel(row)}}>Thu nợ</button></td>
  }

  const openView=(next:View)=>{setView(next);setSelectedSale(null);setSelectedCustomer(null);setDebtPanel(null);setSalePanelTab('INFO');setCustomerPanelTab('OVERVIEW');setDebtPanelTab('PAY')}
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
        actions={<><button className="sp-btn" onClick={()=>setView('history')}>Lịch sử bán</button><button className="sp-btn primary" onClick={()=>setView('pos')}>Mở POS</button></>}/>
      <div className="sp-period sp-dashboard-filter">
        {([['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này'],['custom','Tùy chọn']] as [Period,string][]).map(([key,label])=><button key={key} className={dashboardPeriod===key?'active':''} onClick={()=>setDashboardPeriodSafe(key)}>{label}</button>)}
        {dashboardPeriod==='custom'&&<div className="sp-custom-range"><input type="date" value={dashboardFrom} onChange={e=>setDashboardFrom(e.target.value)}/><span>→</span><input type="date" value={dashboardTo} onChange={e=>setDashboardTo(e.target.value)}/></div>}
        <select value={dashboardWarehouse} onChange={e=>setDashboardWarehouse(e.target.value as any)}><option value="ALL">Tất cả kho</option><option value="HN">HN · Hà Nội</option><option value="BG">BG · Bắc Giang</option></select>
        <strong className="sp-filter-result">{dashboardSales.length} HĐ</strong>
      </div>
      <section className="sp-kpis seven">
        <Kpi tone="blue" label="Doanh thu" value={money(dashboardRevenue)} sub={dashboardSales.length+' hóa đơn'}/>
        <Kpi tone="green" label="Đã thu" value={money(dashboardCollected)} sub={dashboardCollectedRate+'% doanh thu'}/>
        <Kpi tone="amber" label="Công nợ" value={money(dashboardDebt)} sub={dashboardSales.filter(x=>x.debt>0).length+' HĐ còn nợ'} onClick={()=>setView('debt')}/>
        <Kpi tone="purple" label="Khách mua" value={String(dashboardCustomerCount)} sub="Có hồ sơ"/>
        <Kpi tone="cyan" label="Sản phẩm bán" value={String(dashboardUnits)} sub="Tổng số lượng"/>
        <Kpi tone="navy" label="Giá trị TB/HĐ" value={money(dashboardSales.length?Math.round(dashboardRevenue/dashboardSales.length):0)} sub="Trung bình"/>
        <Kpi tone="red" label="Tồn thấp" value={dashboardWarehouse==='BG'?'1':'2'} sub="Cần bổ sung"/>
      </section>
      <div className="sp-overview-grid">
        <section className="sp-card revenue-card">
          <div className="sp-card-head sp-card-head-inline"><b>Doanh thu theo ngày</b><strong>{money(dashboardRevenue)}</strong></div>
          <div className="sp-bars">
            {!dashboardDaily.length?<div className="sp-empty compact">Không có doanh thu trong bộ lọc.</div>:dashboardDaily.map(([day,value])=><div key={day}><span>{day.slice(8,10)+'/'+day.slice(5,7)}</span><i><em style={{width:(value/dashboardMaxDay*100)+'%'}}/></i><b>{money(value)}</b></div>)}
          </div>
        </section>
        <section className="sp-card payment-card">
          <div className="sp-card-head sp-card-head-inline"><b>Tình trạng thanh toán</b></div>
          <div className="sp-payment-ring">
            <div className="sp-donut" style={{background:`conic-gradient(var(--mynh-success) 0 ${dashboardSales.length?dashboardPaidCount/dashboardSales.length*100:0}%, #D89B32 ${dashboardSales.length?dashboardPaidCount/dashboardSales.length*100:0}% ${dashboardSales.length?(dashboardPaidCount+dashboardPartialCount)/dashboardSales.length*100:0}%, var(--mynh-danger) ${dashboardSales.length?(dashboardPaidCount+dashboardPartialCount)/dashboardSales.length*100:0}% 100%)`}}><b>{dashboardCollectedRate}%</b><span>đã thu</span></div>
            <div className="sp-legend">
              <div className="green"><i/><span>Đã thanh toán</span><b>{dashboardPaidCount} HĐ</b></div>
              <div className="amber"><i/><span>Một phần</span><b>{dashboardPartialCount} HĐ</b></div>
              <div className="red"><i/><span>Chưa thanh toán</span><b>{dashboardUnpaidCount} HĐ</b></div>
            </div>
          </div>
        </section>
        <section className="sp-card customer-card">
          <div className="sp-card-head sp-card-head-inline"><b>Khách hàng cần chú ý</b><button onClick={()=>setView('customers')}>Xem tất cả</button></div>
          {CUSTOMERS.filter(c=>c.debt>0||c.status==='VIP').slice(0,4).map(c=><div className="sp-customer-row" key={c.id}><span><b>{c.name}</b><small>{c.phone} · {c.orders} đơn</small></span><span className={c.debt?'debt':'ok'}><b>{c.debt?money(c.debt):'Không nợ'}</b><small>{c.status==='VIP'?'Khách VIP':c.debt?'Cần theo dõi':'Ổn định'}</small></span></div>)}
        </section>
        <section className="sp-card stock-card">
          <div className="sp-card-head sp-card-head-inline"><b>Cảnh báo tồn bán</b></div>
          {(dashboardWarehouse==='ALL'||dashboardWarehouse==='HN')&&<div className="sp-stock-alert red"><span><b>Sunlight 750g</b><small>SUN-750 · Kho HN</small></span><strong>4</strong></div>}
          {(dashboardWarehouse==='ALL'||dashboardWarehouse==='BG')&&<div className="sp-stock-alert amber"><span><b>Ensure Gold 850g</b><small>ENS-850 · Kho BG</small></span><strong>6</strong></div>}
          {(dashboardWarehouse==='ALL'||dashboardWarehouse==='HN')&&<div className="sp-stock-alert green"><span><b>Dove 640g</b><small>DOVE-640 · Kho HN</small></span><strong>11</strong></div>}
        </section>
      </div>
      <section className="sp-card sp-recent">
        <div className="sp-card-head sp-card-head-inline"><b>Giao dịch gần nhất</b><div className="sp-card-actions"><button onClick={()=>setView('history')}>Mở lịch sử</button><ColumnManager table="recent" prefs={tablePrefs.recent} open={columnMenu==='recent'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/></div></div>
        <div className="sp-table-scroll"><table><thead><tr>{visibleColumns('recent').map(col=><SortHead key={col.key} table="recent" col={col} sort={tableSort.recent} onSort={changeSort}/>)}</tr></thead>
          <tbody>{!recentRows.length?<tr><td colSpan={visibleColumns('recent').length} className="sp-empty">Không có giao dịch phù hợp.</td></tr>:recentRows.map(row=><tr key={row.id} onClick={()=>{setSelectedSale(row);setSalePanelTab('INFO');setView('history')}}>{visibleColumns('recent').map(col=>saleCell(row,col.key,true))}</tr>)}</tbody>
        </table></div>
      </section>
    </div>}

    {view==='pos'&&<div className="sp-screen sp-pos-screen">
      <Header title="POS bán hàng" desc="Bán nhanh, nhìn rõ tồn kho, giá bán và trạng thái thanh toán"
        actions={<><span className="sp-live"><i/> POS sẵn sàng</span><button className="sp-btn" onClick={()=>setHeldOpen(v=>!v)}>Đơn tạm ({heldOrders.length})</button></>}/>
      <section className="sp-kpis four">
        <Kpi tone="blue" label="Kho bán" value={posWarehouse} sub={posWarehouse==='HN'?'Kho Hà Nội':'Kho Bắc Giang'}/>
        <Kpi tone="green" label="SKU có tồn" value={String(PRODUCTS.length)} sub="Có thể bán"/>
        <Kpi tone="amber" label="Tồn thấp" value={String(PRODUCTS.filter(x=>Number(x[4])<=10).length)} sub="≤ 10 sản phẩm"/>
        <Kpi tone="purple" label="Doanh thu hôm nay" value={money(salesRows.filter(x=>periodMatch(x.time,'today','','')&&x.warehouse===posWarehouse).reduce((sum,x)=>sum+x.total,0))} sub={salesRows.filter(x=>periodMatch(x.time,'today','','')&&x.warehouse===posWarehouse).length+' hóa đơn'}/>
      </section>

      <div className="sp-pos-toolbar">
        <select value={posWarehouse} onChange={e=>setPosWarehouse(e.target.value as any)}><option value="HN">Kho HN · Hà Nội</option><option value="BG">Kho BG · Bắc Giang</option></select>
        <input value={posSearch} onChange={e=>setPosSearch(e.target.value)} placeholder="Tìm tên sản phẩm / SKU / quét barcode..."/>
        <button className="sp-btn" onClick={()=>setPosCustomerOpen(v=>!v)}>{posCustomer?posCustomer.name:'Gắn khách'}</button>
      </div>

      {posCustomerOpen&&<div className="sp-pos-inline-popover customer">
        <div className="sp-inline-popover-head"><b>Gắn khách hàng</b><button onClick={()=>setPosCustomerOpen(false)}>×</button></div>
        <button className={!posCustomerId?'active':''} onClick={()=>{setPosCustomerId('');setPosCustomerOpen(false)}}>Khách lẻ</button>
        {CUSTOMERS.map(c=><button key={c.id} className={posCustomerId===c.id?'active':''} onClick={()=>{setPosCustomerId(c.id);setPosCustomerOpen(false)}}><span>{c.name}</span><small>{c.phone}</small></button>)}
      </div>}

      {heldOpen&&<div className="sp-pos-inline-popover held">
        <div className="sp-inline-popover-head"><b>Đơn tạm ({heldOrders.length})</b><button onClick={()=>setHeldOpen(false)}>×</button></div>
        {!heldOrders.length?<div className="sp-panel-empty">Chưa có đơn tạm.</div>:heldOrders.map(order=><div className="sp-held-row" key={order.id}><span><b>{order.cart.reduce((sum,x)=>sum+x.qty,0)} SP</b><small>{order.id}</small></span><strong>{money(order.cart.reduce((sum,x)=>sum+x.qty*x.price,0))}</strong><button className="sp-btn small primary" onClick={()=>restoreHeldOrder(order.id)}>Mở</button><button className="sp-btn small" onClick={()=>setHeldOrders(prev=>prev.filter(x=>x.id!==order.id))}>Xóa</button></div>)}
      </div>}

      {posMessage&&<div className="sp-pos-message">{posMessage}<button onClick={()=>setPosMessage('')}>×</button></div>}

      <div className="sp-pos-grid">
        <section className="sp-products">
          <div className="sp-section-title sp-section-title-inline"><b>Sản phẩm đang bán</b><span>Kho {posWarehouse} · {filteredProducts.length} SKU hiển thị</span><strong>Chọn để thêm vào giỏ</strong></div>
          <div className="sp-pos-products-body">
            <aside className="sp-category-rail">
              <div className="sp-category-rail-head"><b>Phân loại</b><button title="Cài đặt phân loại" onClick={()=>setCategorySettingsOpen(v=>!v)}>⚙</button></div>
              <button className={posCategory==='ALL'?'active':''} onClick={()=>setPosCategory('ALL')}><span>Tất cả</span><b>{PRODUCTS.length}</b></button>
              {activeCategories.map(cat=><button key={cat.id} className={posCategory===cat.id?'active':''} onClick={()=>setPosCategory(cat.id)}><span>{cat.name}</span><b>{PRODUCTS.filter(x=>x[5]===cat.id).length}</b></button>)}
            </aside>
            <div className="sp-product-pane">
              {categorySettingsOpen&&<div className="sp-category-settings">
                <div className="sp-inline-popover-head"><div><b>Cài đặt phân loại</b><span>Preview · lưu trong phiên</span></div><button onClick={()=>setCategorySettingsOpen(false)}>×</button></div>
                <div className="sp-category-settings-list">{posCategories.map(cat=><div key={cat.id}><input value={cat.name} onChange={e=>setPosCategories(prev=>prev.map(x=>x.id===cat.id?{...x,name:e.target.value}:x))}/><label><input type="checkbox" checked={cat.active} onChange={()=>setPosCategories(prev=>prev.map(x=>x.id===cat.id?{...x,active:!x.active}:x))}/> Hiện</label></div>)}</div>
                <div className="sp-category-add"><input value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} placeholder="Tên phân loại mới"/><button className="sp-btn small primary" onClick={addCategory}>+ Thêm</button></div>
              </div>}
              <div className="sp-product-grid">{filteredProducts.map(p=><button key={p[1]} onClick={()=>addPosProduct(p)} className={(p[4] as number)<=6?'low':''}><div className="sp-product-title"><b>{p[0]}</b><span>{p[2]}</span></div><div className="sp-product-meta"><code>{p[1]}</code><strong>{money(p[3] as number)}</strong><em>{p[4]} tồn</em></div></button>)}</div>
            </div>
          </div>
        </section>

        <aside className="sp-cart">
          {!posPaymentOpen?<>
            <div className="sp-cart-head sp-cart-head-compact"><div><b>Hóa đơn hiện tại · {cart.reduce((sum,x)=>sum+x.qty,0)} SP</b><small>{posCustomer?.name??'Khách lẻ'} · Kho {posWarehouse}</small></div>{cart.length>0&&<button onClick={()=>setCart([])}>Xóa giỏ</button>}</div>
            <div className="sp-cart-lines">{cart.length===0?<div className="sp-empty">Chưa có sản phẩm</div>:cart.map((line,i)=><div className="sp-cart-line" key={line.sku}><span><b>{line.name}</b><small>{line.sku} · {money(line.price)}</small></span><div><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:Math.max(1,x.qty-1)}:x))}>−</button><b>{line.qty}</b><button onClick={()=>setCart(prev=>prev.map((x,j)=>j===i?{...x,qty:x.qty+1}:x))}>+</button></div><strong>{money(line.qty*line.price)}</strong></div>)}</div>
            <div className="sp-cart-customer"><span>Khách hàng</span><b>{posCustomer?.name??'Khách lẻ'}</b><button onClick={()=>setPosCustomerOpen(true)}>Gắn khách</button></div>
            <div className="sp-cart-summary">
              <div><span>Tiền hàng</span><b>{money(cartSubtotal)}</b></div>
              {posDiscount>0&&<div><span>Giảm giá</span><b>−{money(posDiscount)}</b></div>}
              {posOtherFee>0&&<div><span>Phí khác</span><b>{money(posOtherFee)}</b></div>}
              <button className="sp-pos-extras-toggle" onClick={()=>setPosExtrasOpen(v=>!v)}>{posExtrasOpen?'Thu gọn tùy chỉnh':'Tùy chỉnh hóa đơn'} <span>{posExtrasOpen?'▴':'▾'}</span></button>
              {posExtrasOpen&&<div className="sp-pos-extras"><label>Giảm giá<input type="number" value={posDiscount} onChange={e=>setPosDiscount(Math.max(0,Number(e.target.value)||0))}/></label><label>Phí khác<input type="number" value={posOtherFee} onChange={e=>setPosOtherFee(Math.max(0,Number(e.target.value)||0))}/></label><textarea value={posNote} onChange={e=>setPosNote(e.target.value)} placeholder="Ghi chú hóa đơn..."/></div>}
              <div className="total"><span>PHẢI THU</span><b>{money(cartTotal)}</b></div>
            </div>
            <div className="sp-pay-actions"><button onClick={holdCurrentOrder}>Giữ</button><button className="cash" onClick={()=>openPosPayment('cash')}>Tiền mặt</button><button className="transfer" onClick={()=>openPosPayment('transfer')}>Chuyển khoản</button><button className="debt" onClick={()=>openPosPayment('debt')}>Ghi nợ</button></div>
          </>:<div className="sp-pos-checkout">
            <div className="sp-pos-checkout-head"><button onClick={()=>setPosPaymentOpen(false)}>←</button><div><span>THANH TOÁN POS</span><b>{money(cartTotal)}</b><small>{cart.reduce((sum,x)=>sum+x.qty,0)} SP · Kho {posWarehouse}</small></div></div>
            <div className="sp-pos-payment-tabs">
              <button className={posPaymentMode==='cash'?'active':''} onClick={()=>openPosPayment('cash')}>Tiền mặt</button>
              <button className={posPaymentMode==='transfer'?'active':''} onClick={()=>openPosPayment('transfer')}>Chuyển khoản</button>
              <button className={posPaymentMode==='debt'?'active':''} onClick={()=>openPosPayment('debt')}>Ghi nợ</button>
              <button className={posPaymentMode==='combined'?'active':''} onClick={()=>openPosPayment('combined')}>Kết hợp</button>
            </div>
            {posPaymentMode==='cash'&&<div className="sp-pos-payment-body"><label>Khách đưa<input type="number" value={cashTendered} onChange={e=>setCashTendered(Math.max(0,Number(e.target.value)||0))}/></label><div className="sp-money-presets">{[100000,200000,500000,1000000].map(v=><button key={v} onClick={()=>setCashTendered(v)}>{v===1000000?'1tr':v/1000+'k'}</button>)}<button onClick={()=>setCashTendered(cartTotal)}>Vừa đủ</button></div><div className="sp-pos-change"><span>Tiền thừa</span><b>{money(Math.max(0,cashTendered-cartTotal))}</b></div></div>}
            {posPaymentMode==='transfer'&&<div className="sp-pos-payment-body sp-transfer-demo"><div className="sp-demo-qr">QR</div><div><span>Số tiền</span><b>{money(cartTotal)}</b><span>Ngân hàng</span><b>MB Bank · 0123456789</b><span>Nội dung CK</span><b>POS-{String(Date.now()).slice(-6)}</b></div><small>Preview mô phỏng luồng VietQR của main. Chỉ xác nhận sau khi nhận tiền.</small><button className="sp-btn" onClick={()=>window.print()}>In phiếu trước thanh toán</button></div>}
            {posPaymentMode==='debt'&&<div className="sp-pos-payment-body"><div className="sp-pos-debt-note"><b>Ghi nợ toàn bộ</b><span>{posCustomer?'Công nợ sẽ ghi cho '+posCustomer.name:'Cần gắn khách hàng trước.'}</span></div></div>}
            {posPaymentMode==='combined'&&<div className="sp-pos-payment-body"><div className="sp-combined-fields"><label>Tiền mặt<input type="number" value={combinedCash} onChange={e=>setCombinedCash(Math.max(0,Number(e.target.value)||0))}/></label><label>Chuyển khoản<input type="number" value={combinedTransfer} onChange={e=>setCombinedTransfer(Math.max(0,Number(e.target.value)||0))}/></label></div><div className="sp-pos-change"><span>Còn nợ</span><b>{money(Math.max(0,cartTotal-combinedCash-combinedTransfer))}</b></div></div>}
            <div className="sp-cart-customer"><span>Khách hàng</span><b>{posCustomer?.name??'Khách lẻ'}</b><button onClick={()=>setPosCustomerOpen(true)}>Thay đổi</button></div>
            <button className="sp-btn primary sp-pos-confirm" onClick={confirmPosPayment}>{posPaymentMode==='transfer'?'Đã nhận chuyển khoản · ':'Xác nhận thanh toán · '}{money(cartTotal)}</button>
          </div>}
        </aside>
      </div>
    </div>}

    {view==='history'&&<div className={'sp-screen sp-with-panel '+(selectedSale?'open':'')}>
      <main>
        <Header title="Lịch sử bán" desc="Tra cứu hóa đơn POS, sản phẩm, thanh toán và lịch sử sau bán"
          actions={<button className="sp-btn primary" onClick={()=>setView('pos')}>+ Bán hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="blue" label="Tổng hóa đơn" value={String(filteredSales.length)} sub={historyPeriod==='all'?'Toàn thời gian':'Theo bộ lọc'}/>
          <Kpi tone="green" label="Đã thanh toán" value={String(filteredSales.filter(x=>x.status==='PAID').length)} sub="Đã thu đủ"/>
          <Kpi tone="amber" label="Một phần" value={String(filteredSales.filter(x=>x.status==='PARTIAL').length)} sub="Còn công nợ"/>
          <Kpi tone="red" label="Chưa thanh toán" value={String(filteredSales.filter(x=>x.status==='UNPAID').length)} sub="Cần theo dõi"/>
          <Kpi tone="purple" label="Doanh thu" value={money(historyRevenue)} sub="Theo bộ lọc"/>
        </section>

        <div className="sp-period sp-history-period">
          {([['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này'],['custom','Tùy chọn']] as [Period,string][]).map(([key,label])=><button key={key} className={historyPeriod===key?'active':''} onClick={()=>setHistoryPeriodSafe(key)}>{label}</button>)}
          {historyPeriod==='custom'&&<div className="sp-custom-range"><input type="date" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)}/><span>→</span><input type="date" value={historyTo} onChange={e=>setHistoryTo(e.target.value)}/></div>}
          <strong className="sp-filter-result">{filteredSales.length} HĐ</strong>
        </div>

        <div className="sp-toolbar sp-history-toolbar">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã hóa đơn / khách hàng / SĐT..."/>
          <select value={historyWarehouse} onChange={e=>setHistoryWarehouse(e.target.value as any)}><option value="ALL">Tất cả kho</option><option value="HN">HN · Hà Nội</option><option value="BG">BG · Bắc Giang</option></select>
          <select value={saleFilter} onChange={e=>setSaleFilter(e.target.value as any)}><option value="ALL">Tất cả thanh toán</option><option value="PAID">Đã thanh toán</option><option value="PARTIAL">Thanh toán một phần</option><option value="UNPAID">Chưa thanh toán</option></select>
          <select value={historySaleState} onChange={e=>setHistorySaleState(e.target.value as any)}><option value="ALL">Tất cả trạng thái</option><option value="COMPLETED">Hoàn tất</option><option value="CANCELLED">Đã huỷ</option><option value="PARTIAL_RETURN">Hoàn một phần</option><option value="RETURNED">Đã hoàn toàn bộ</option></select>
          {selectedSaleIds.length>0&&<button className="sp-btn danger" onClick={deleteSelectedSales}>Xóa ({selectedSaleIds.length})</button>}
          <ColumnManager table="history" prefs={tablePrefs.history} open={columnMenu==='history'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/>
        </div>

        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table>
          <thead><tr><th className="sp-select-col"><input type="checkbox" checked={historyRows.length>0&&historyRows.every(x=>selectedSaleIds.includes(x.id))} onChange={e=>setSelectedSaleIds(e.target.checked?historyRows.map(x=>x.id):[])}/></th>{visibleColumns('history').map(col=><SortHead key={col.key} table="history" col={col} sort={tableSort.history} onSort={changeSort}/>)}</tr></thead>
          <tbody>{!historyRows.length?<tr><td colSpan={visibleColumns('history').length+1} className="sp-empty">Không có hóa đơn phù hợp.</td></tr>:historyRows.map(row=><tr key={row.id} className={selectedSale?.id===row.id?'selected':''} onClick={()=>{setSelectedSale(row);setSalePanelTab('INFO')}}><td className="sp-select-col"><input type="checkbox" checked={selectedSaleIds.includes(row.id)} onClick={e=>e.stopPropagation()} onChange={e=>setSelectedSaleIds(prev=>e.target.checked?[...prev,row.id]:prev.filter(id=>id!==row.id))}/></td>{visibleColumns('history').map(col=>saleCell(row,col.key))}</tr>)}</tbody>
        </table></div></section>
      </main>

      {selectedSale&&<aside className="sp-slidebar">
        <div className="sp-panel-head"><div><span>HÓA ĐƠN POS</span><h2>{selectedSale.code}</h2><p>{selectedSale.customer} · {selectedSale.time} · {selectedSale.warehouse}</p></div><button onClick={()=>setSelectedSale(null)}>×</button></div>
        <div className="sp-history-panel-actions"><button className="sp-btn small" onClick={()=>window.print()}>In hóa đơn</button><button className="sp-btn small" disabled title="Main hiện chưa nối backend">Huỷ hóa đơn</button><button className="sp-btn small" disabled title="Main hiện chưa nối backend">Hoàn hàng</button><button className="sp-btn small danger" onClick={()=>{if(window.confirm('Xóa hóa đơn khỏi dữ liệu Preview?')){setSalesRows(prev=>prev.filter(x=>x.id!==selectedSale.id));setSelectedSale(null)}}}>Xóa</button></div>
        <div className="sp-panel-tabs">
          <button className={salePanelTab==='INFO'?'active':''} onClick={()=>setSalePanelTab('INFO')}>Thông tin</button>
          <button className={salePanelTab==='PRODUCTS'?'active':''} onClick={()=>setSalePanelTab('PRODUCTS')}>Sản phẩm</button>
          <button className={salePanelTab==='PAYMENT'?'active':''} onClick={()=>setSalePanelTab('PAYMENT')}>Thanh toán</button>
          <button className={salePanelTab==='HISTORY'?'active':''} onClick={()=>setSalePanelTab('HISTORY')}>Lịch sử</button>
        </div>
        <div className="sp-panel-scroll">
          {salePanelTab==='INFO'&&<>
            <div className="sp-detail-grid"><div><span>Mã hóa đơn</span><b>{selectedSale.code}</b></div><div><span>Trạng thái</span><b>{saleStatusLabel(selectedSale.saleStatus)}</b></div><div><span>Khách hàng</span><b>{selectedSale.customer}</b></div><div><span>SĐT</span><b>{selectedSale.phone}</b></div><div><span>Kho bán</span><b>{selectedSale.warehouse}</b></div><div><span>Thời gian</span><b>{selectedSale.time}</b></div></div>
            <div className="sp-money-box"><div><span>Tổng hóa đơn</span><b>{money(selectedSale.total)}</b></div><div className="income"><span>Đã thu</span><b>{money(selectedSale.paid)}</b></div><div className="expense"><span>Còn nợ</span><b>{money(selectedSale.debt)}</b></div></div>
          </>}
          {salePanelTab==='PRODUCTS'&&<div className="sp-panel-section sp-panel-section-flush"><div className="sp-panel-section-title"><b>Sản phẩm</b><span>{selectedSale.items} SP</span></div>{PRODUCTS.slice(0,Math.min(selectedSale.items,5)).map((p,i)=><div className="sp-mini-row" key={p[1]}><span><b>{p[0]}</b><small>SKU {p[1]} · {p[2]} · SL {i===0?2:1}</small></span><strong>{money((p[3] as number)*(i===0?2:1))}</strong></div>)}</div>}
          {salePanelTab==='PAYMENT'&&<>
            <div className="sp-money-box"><div><span>Tổng thanh toán</span><b>{money(selectedSale.total)}</b></div><div className="income"><span>Đã thu</span><b>{money(selectedSale.paid)}</b></div><div className="expense"><span>Còn nợ</span><b>{money(selectedSale.debt)}</b></div></div>
            <div className="sp-panel-section"><b>Lịch sử thanh toán</b><div className="sp-payment-record"><span><b>{selectedSale.method}</b><small>{selectedSale.time}</small></span><strong className="income">{money(selectedSale.paid)}</strong></div>{selectedSale.debt>0&&<div className="sp-payment-record pending"><span><b>Công nợ còn lại</b><small>Chưa thu đủ</small></span><strong className="expense">{money(selectedSale.debt)}</strong></div>}</div>
            {selectedSale.method.includes('Chuyển khoản')&&<div className="sp-transfer-reference"><div className="sp-demo-qr small">QR</div><div><span>Nội dung CK</span><b>{selectedSale.code}</b><small>Hiển thị lại QR theo cấu hình thanh toán của main</small></div></div>}
            {selectedSale.debt>0&&<button className="sp-btn primary sp-panel-wide-action" onClick={()=>{const customer=CUSTOMERS.find(c=>c.name===selectedSale.customer);if(customer){openDebtPanel(customer);setView('debt');setSelectedSale(null)}}}>Mở thu công nợ →</button>}
          </>}
          {salePanelTab==='HISTORY'&&<div className="sp-timeline">
            <div><i className="green"/><span><b>Tạo hóa đơn</b><small>{selectedSale.time} · POS tại kho {selectedSale.warehouse}</small></span></div>
            <div><i className={selectedSale.paid>0?'green':'amber'}/><span><b>{selectedSale.paid>0?'Ghi nhận thanh toán':'Chưa có thanh toán'}</b><small>{selectedSale.paid>0?money(selectedSale.paid)+' · '+selectedSale.method:'Đang chờ xử lý'}</small></span></div>
            {selectedSale.debt>0&&<div><i className="amber"/><span><b>Phát sinh công nợ</b><small>Còn phải thu {money(selectedSale.debt)}</small></span></div>}
            {selectedSale.saleStatus!=='COMPLETED'&&<div><i className="amber"/><span><b>{saleStatusLabel(selectedSale.saleStatus)}</b><small>Trạng thái sau bán</small></span></div>}
            <div><i/><span><b>Cập nhật gần nhất</b><small>{selectedSale.time}</small></span></div>
          </div>}
        </div>
      </aside>}
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
        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table><thead><tr>{visibleColumns('customers').map(col=><SortHead key={col.key} table="customers" col={col} sort={tableSort.customers} onSort={changeSort}/>)}</tr></thead><tbody>{customerRows.map(row=><tr key={row.id} className={selectedCustomer?.id===row.id?'selected':''} onClick={()=>{setSelectedCustomer(row);setCustomerPanelTab('OVERVIEW')}}>{visibleColumns('customers').map(col=>customerCell(row,col.key))}</tr>)}</tbody></table></div></section>
      </main>
      {selectedCustomer&&<aside className="sp-slidebar">
        <div className="sp-panel-head"><div><span>KHÁCH HÀNG</span><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.phone} · {selectedCustomer.address}</p></div><button onClick={()=>setSelectedCustomer(null)}>×</button></div>
        <div className="sp-panel-tabs">
          <button className={customerPanelTab==='OVERVIEW'?'active':''} onClick={()=>setCustomerPanelTab('OVERVIEW')}>Tổng quan</button>
          <button className={customerPanelTab==='PURCHASES'?'active':''} onClick={()=>setCustomerPanelTab('PURCHASES')}>Lịch sử mua</button>
          <button className={customerPanelTab==='DEBT'?'active':''} onClick={()=>setCustomerPanelTab('DEBT')}>Công nợ</button>
        </div>
        <div className="sp-panel-scroll">
          {customerPanelTab==='OVERVIEW'&&<>
            <div className="sp-customer-summary"><Kpi tone="blue" label="Số đơn" value={String(selectedCustomer.orders)} sub="Toàn thời gian"/><Kpi tone="green" label="Doanh thu" value={money(selectedCustomer.revenue)} sub="Tổng mua"/><Kpi tone={selectedCustomer.debt?'amber':'green'} label="Công nợ" value={money(selectedCustomer.debt)} sub={selectedCustomer.debt?'Cần theo dõi':'Không nợ'}/></div>
            <div className="sp-detail-grid sp-customer-info-grid"><div><span>SĐT</span><b>{selectedCustomer.phone}</b></div><div><span>Nhóm</span><b>{selectedCustomer.status==='VIP'?'VIP':selectedCustomer.status==='DEBT'?'Đang nợ':'Ổn định'}</b></div><div className="full"><span>Địa chỉ</span><b>{selectedCustomer.address}</b></div><div><span>Mua gần nhất</span><b>{selectedCustomer.last}</b></div><div><span>Giá trị TB/đơn</span><b>{money(Math.round(selectedCustomer.revenue/Math.max(1,selectedCustomer.orders)))}</b></div></div>
          </>}
          {customerPanelTab==='PURCHASES'&&<div className="sp-panel-section sp-panel-section-flush"><div className="sp-panel-section-title"><b>Lịch sử mua</b><span>{selectedCustomer.orders} đơn</span></div>{salesRows.filter(x=>x.customer===selectedCustomer.name).length?salesRows.filter(x=>x.customer===selectedCustomer.name).map(row=><button className="sp-purchase-history-row" key={row.id} onClick={()=>{setSelectedSale(row);setSalePanelTab('INFO');setView('history');setSelectedCustomer(null)}}><span><b>{row.code}</b><small>{row.time} · {row.items} SP · {row.method}</small></span><span><strong>{money(row.total)}</strong><Status status={row.status}/></span></button>):<div className="sp-panel-empty">Chưa có giao dịch demo trong danh sách hiện tại.</div>}</div>}
          {customerPanelTab==='DEBT'&&<>
            <div className={'sp-debt-total '+(!selectedCustomer.debt?'settled':'')}><span>Công nợ hiện tại</span><b>{money(selectedCustomer.debt)}</b><small>{selectedCustomer.debt?'Cần thu tiếp':'Đã thanh toán đủ'}</small></div>
            <div className="sp-panel-section"><div className="sp-panel-section-title"><b>Hóa đơn liên quan</b><span>{selectedCustomer.debt?1:0} hóa đơn còn nợ</span></div>{salesRows.filter(x=>x.customer===selectedCustomer.name&&x.debt>0).map(row=><div className="sp-mini-row" key={row.id}><span><b>{row.code}</b><small>{row.time}</small></span><strong className="expense">{money(row.debt)}</strong></div>)}</div>
            {selectedCustomer.debt>0&&<button className="sp-btn primary sp-panel-wide-action" onClick={()=>{openDebtPanel(selectedCustomer);setView('debt');setSelectedCustomer(null)}}>Thu công nợ {money(selectedCustomer.debt)} →</button>}
          </>}
        </div>
      </aside>}
    </div>}

    {view==='debt'&&<div className={'sp-screen sp-with-panel '+(debtPanel?'open':'')}>
      <main>
        <Header title="Công nợ khách hàng" desc="Theo dõi hóa đơn còn nợ, tạo phiếu thu nợ và phân bổ thanh toán"
          actions={<button className="sp-btn" onClick={()=>setView('customers')}>Khách hàng</button>}/>
        <section className="sp-kpis five">
          <Kpi tone="amber" label="Tổng công nợ" value={money(totalDebtLive)} sub={debtRows.length+' khách còn nợ'}/>
          <Kpi tone="red" label="Nợ từ 7 ngày" value={money(debtRows.filter(x=>x.risk==='high').reduce((sum,x)=>sum+x.debt,0))} sub={debtRows.filter(x=>x.risk==='high').length+' khách ưu tiên'}/>
          <Kpi tone="purple" label="Hóa đơn còn nợ" value={String(salesRows.filter(x=>x.debt>0).length)} sub="Chưa thu đủ"/>
          <Kpi tone="green" label="Đã thu hôm nay" value={money(collectedDebtToday)} sub={debtReceipts.filter(x=>periodMatch(x.time,'today','','')).length+' phiếu thu'}/>
          <Kpi tone="blue" label="Thu trong tháng" value={money(collectedDebtMonth)} sub={debtReceipts.filter(x=>periodMatch(x.time,'month','','')).length+' phiếu thu'}/>
        </section>

        <div className="sp-toolbar">
          <input placeholder="Tìm khách / SĐT / mã hóa đơn..."/>
          <select><option>Tất cả công nợ</option><option>Nợ một phần</option><option>Nợ từ 7 ngày</option></select>
          <button className="sp-btn">Bộ lọc</button>
          <ColumnManager table="debt" prefs={tablePrefs.debt} open={columnMenu==='debt'} setOpen={setColumnMenu} dragged={draggedColumn} setDragged={setDraggedColumn} onToggle={toggleColumn} onMove={moveColumn} onReset={resetColumns}/>
        </div>
        <section className="sp-card sp-table-card"><div className="sp-table-scroll"><table><thead><tr>{visibleColumns('debt').map(col=><SortHead key={col.key} table="debt" col={col} sort={tableSort.debt} onSort={changeSort}/>)}</tr></thead><tbody>{debtRows.length?debtRows.map(row=><tr key={row.id} onDoubleClick={()=>openDebtPanel(row)}>{visibleColumns('debt').map(col=>debtCell(row,col.key))}</tr>):<tr><td className="sp-empty" colSpan={visibleColumns('debt').length}>Không còn công nợ.</td></tr>}</tbody></table></div></section>
      </main>

      {debtPanel&&<aside className="sp-slidebar">
        <div className="sp-panel-head"><div><span>PHIẾU THU NỢ</span><h2>{debtPanel.name}</h2><p>{debtPanel.phone} · Còn nợ {money(activeDebtBalance)}</p></div><button onClick={()=>setDebtPanel(null)}>×</button></div>
        <div className="sp-panel-tabs">
          <button className={debtPanelTab==='PAY'?'active':''} onClick={()=>setDebtPanelTab('PAY')}>Thu tiền</button>
          <button className={debtPanelTab==='ALLOCATE'?'active':''} onClick={()=>setDebtPanelTab('ALLOCATE')}>Phân bổ</button>
          <button className={debtPanelTab==='HISTORY'?'active':''} onClick={()=>setDebtPanelTab('HISTORY')}>Lịch sử thu</button>
        </div>

        <div className="sp-panel-scroll">
          {debtMessage&&<div className="sp-debt-message"><span>{debtMessage}</span><button onClick={()=>setDebtMessage('')}>×</button></div>}

          {debtPanelTab==='PAY'&&<>
            <div className={'sp-debt-total '+(activeDebtBalance<=0?'settled':'')}>
              <span>Công nợ hiện tại</span><b>{money(activeDebtBalance)}</b><small>{activeDebtBalance>0?'Có thể thu một phần hoặc toàn bộ':'Đã thanh toán đủ'}</small>
            </div>

            {activeDebtBalance>0&&<>
              <div className="sp-debt-quick-amounts">
                <button onClick={()=>updateDebtCollectAmount(activeDebtBalance)}>Thu toàn bộ</button>
                <button onClick={()=>updateDebtCollectAmount(Math.round(activeDebtBalance/2))}>50%</button>
                <button onClick={()=>updateDebtCollectAmount(Math.min(activeDebtBalance,100000))}>100.000 ₫</button>
              </div>

              <div className="sp-payment-methods">
                <button className={debtPaymentMethod==='CASH'?'active':''} onClick={()=>{setDebtPaymentMethod('CASH');setDebtCashPart(debtCollectAmount);setDebtTransferPart(0)}}>Tiền mặt</button>
                <button className={debtPaymentMethod==='TRANSFER'?'active':''} onClick={()=>{setDebtPaymentMethod('TRANSFER');setDebtCashPart(0);setDebtTransferPart(debtCollectAmount)}}>Chuyển khoản</button>
                <button className={debtPaymentMethod==='COMBINED'?'active':''} onClick={()=>{setDebtPaymentMethod('COMBINED');setDebtCashPart(Math.floor(debtCollectAmount/2));setDebtTransferPart(debtCollectAmount-Math.floor(debtCollectAmount/2))}}>Kết hợp</button>
              </div>

              <div className="sp-payment-form">
                <label>Số tiền thu
                  <input type="number" value={debtCollectAmount} min={0} max={activeDebtBalance} onChange={e=>updateDebtCollectAmount(Number(e.target.value))}/>
                </label>

                {debtPaymentMethod==='TRANSFER'&&<div className="sp-debt-transfer-box">
                  <div className="sp-demo-qr small">QR</div>
                  <div><span>Số tiền</span><b>{money(debtCollectAmount)}</b><span>Nội dung CK</span><b>PTN-AUTO</b><small>Preview mô phỏng VietQR theo cấu hình ngân hàng của main.</small></div>
                </div>}

                {debtPaymentMethod==='COMBINED'&&<div className="sp-combined-fields">
                  <label>Tiền mặt<input type="number" value={debtCashPart} min={0} onChange={e=>setDebtCashPart(Math.max(0,Number(e.target.value)||0))}/></label>
                  <label>Chuyển khoản<input type="number" value={debtTransferPart} min={0} onChange={e=>setDebtTransferPart(Math.max(0,Number(e.target.value)||0))}/></label>
                  <div className={'sp-combined-check '+(Math.round(debtCashPart+debtTransferPart)===Math.round(debtCollectAmount)?'ok':'bad')}>
                    <span>Tổng nhận</span><b>{money(debtCashPart+debtTransferPart)}</b>
                  </div>
                </div>}

                <label>Ghi chú<input value={debtNote} onChange={e=>setDebtNote(e.target.value)} placeholder="Ghi chú phiếu thu nợ..."/></label>
              </div>

              <div className="sp-debt-allocation-preview">
                <div><span>Đã phân bổ</span><b>{money(debtAllocatedTotal)}</b></div>
                <div><span>Chưa phân bổ</span><b className={Math.round(debtAllocatedTotal)===Math.round(debtCollectAmount)?'income':'expense'}>{money(Math.max(0,debtCollectAmount-debtAllocatedTotal))}</b></div>
                <button className="sp-btn small" onClick={()=>setDebtPanelTab('ALLOCATE')}>Xem / sửa phân bổ →</button>
              </div>

              <div className="sp-panel-actions">
                <button className="sp-btn" onClick={()=>window.print()}>In phiếu dự kiến</button>
                <button className="sp-btn primary" onClick={confirmDebtPayment}>Xác nhận thu {money(debtCollectAmount)}</button>
              </div>
            </>}
          </>}

          {debtPanelTab==='ALLOCATE'&&<>
            <div className="sp-allocation-head"><span>Số tiền cần phân bổ</span><b>{money(debtCollectAmount)}</b></div>
            <div className="sp-panel-section sp-panel-section-flush">
              <div className="sp-panel-section-title"><b>Hóa đơn còn nợ</b><span>{debtInvoices.length} hóa đơn</span></div>
              {!debtInvoices.length?<div className="sp-panel-empty">Không còn hóa đơn cần phân bổ.</div>:debtInvoices.map(row=><div className="sp-allocation-edit-row" key={row.id}>
                <span><b>{row.code}</b><small>{row.time} · Còn nợ {money(row.debt)}</small></span>
                <input type="number" min={0} max={row.debt} value={debtAllocations[row.id]??0} onChange={e=>{
                  const value=Math.max(0,Math.min(row.debt,Number(e.target.value)||0))
                  setDebtAllocations(prev=>({...prev,[row.id]:value}))
                }}/>
              </div>)}
            </div>
            <div className={'sp-allocation-summary '+(Math.round(debtAllocatedTotal)===Math.round(debtCollectAmount)?'ok':'bad')}>
              <span>{Math.round(debtAllocatedTotal)===Math.round(debtCollectAmount)?'Phân bổ hợp lệ':'Còn chênh lệch'}</span>
              <b>{money(debtCollectAmount-debtAllocatedTotal)}</b>
            </div>
            <div className="sp-panel-actions">
              <button className="sp-btn" onClick={()=>setDebtAllocations(autoAllocateDebt(debtPanel,debtCollectAmount))}>Tự phân bổ nợ cũ</button>
              <button className="sp-btn primary" onClick={()=>setDebtPanelTab('PAY')}>Quay lại thu tiền →</button>
            </div>
          </>}

          {debtPanelTab==='HISTORY'&&<>
            {lastDebtReceipt&&lastDebtReceipt.customerId===debtPanel.id&&<div className="sp-debt-receipt-card">
              <div className="sp-debt-receipt-head"><div><span>PHIẾU THU NỢ VỪA TẠO</span><b>{lastDebtReceipt.code}</b></div><button className="sp-btn small" onClick={()=>window.print()}>In phiếu</button></div>
              <div className="sp-debt-receipt-grid">
                <div><span>Thời gian</span><b>{lastDebtReceipt.time}</b></div>
                <div><span>Phương thức</span><b>{lastDebtReceipt.method}</b></div>
                <div><span>Số tiền</span><b className="income">{money(lastDebtReceipt.amount)}</b></div>
                <div><span>Còn nợ sau thu</span><b>{money(activeDebtBalance)}</b></div>
              </div>
              {lastDebtReceipt.allocations.length>0&&<div className="sp-receipt-allocations"><span>Phân bổ</span>{lastDebtReceipt.allocations.map(a=><div key={a.saleId}><b>{a.code}</b><strong>{money(a.amount)}</strong></div>)}</div>}
              {lastDebtReceipt.note&&<div className="sp-receipt-note"><span>Ghi chú</span><b>{lastDebtReceipt.note}</b></div>}
            </div>}

            <div className="sp-panel-section sp-panel-section-flush">
              <div className="sp-panel-section-title"><b>Lịch sử phiếu thu</b><span>{debtReceiptsForPanel.length} phiếu</span></div>
              {!debtReceiptsForPanel.length?<div className="sp-panel-empty">Chưa có phiếu thu nợ.</div>:debtReceiptsForPanel.map(receipt=><button className="sp-debt-receipt-row" key={receipt.id} onClick={()=>setLastDebtReceipt(receipt)}>
                <span><b>{receipt.code}</b><small>{receipt.time} · {receipt.method}</small></span>
                <strong>{money(receipt.amount)}</strong>
              </button>)}
            </div>

            <div className="sp-timeline">
              {salesRows.filter(x=>x.customer===debtPanel.name&&x.debt>0).map(row=><div key={row.id}><i className="amber"/><span><b>{row.time} · Phát sinh công nợ</b><small>{row.code} · Còn {money(row.debt)}</small></span></div>)}
              <div><i className={activeDebtBalance>0?'amber':'green'}/><span><b>Trạng thái hiện tại</b><small>{activeDebtBalance>0?'Còn phải thu '+money(activeDebtBalance):'Đã thanh toán đủ'}</small></span></div>
            </div>
          </>}
        </div>
      </aside>}
    </div>}
      </div>
    </main>
  </div>
}
