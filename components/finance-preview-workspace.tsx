'use client'

import {useEffect,useMemo,useState,type ReactNode} from 'react'

type Tab='overview'|'cashflow'|'settlement'|'reports'
type TxType='INCOME'|'EXPENSE'
type Payment='CASH'|'TRANSFER'|'COMBINED'
type DocStatus='DRAFT'|'POSTED'|'CANCELLED'
type Period='all'|'today'|'7d'|'month'|'custom'
type ColumnKey='time'|'code'|'type'|'category'|'content'|'counterparty'|'source'|'method'|'income'|'expense'|'status'
type SortKey=ColumnKey
type SortDir='asc'|'desc'
type SettlementMode='shipper'|'customer'
type SettlementView='batch'|'hub'
type SettlementStatus='PAID'|'PENDING'

type Category={
  id:string
  code:string
  name:string
  txType:TxType
  parentId:string|null
  active:boolean
  system?:boolean
  note?:string
}
type Line={id:string,categoryId:string,description:string,amount:number}
type DocumentRow={
  id:string
  code:string
  type:TxType
  status:DocStatus
  occurredAt:string
  counterparty:string
  payment:Payment
  cashAmount:number
  transferAmount:number
  note:string
  source:string
  lines:Line[]
  cancelReason?:string
}
type DraftLine={id:string,categoryId:string,description:string,amount:string}
type ShipperOrder={orderId:string,tracking:string,cod:number,receivedAt:string}
type ShipperBatch={
  id:string
  occurredAt:string
  shipper:string
  hub:string
  orders:number
  cod:number
  transferred:number
  tip:number
  status:SettlementStatus
  orderItems:ShipperOrder[]
}
type CustomerRow={
  id:string
  name:string
  phone:string
  totalSales:number
  paid:number
  debt:number
  openInvoices:number
  lastPayment:string|null
}
type SaleDemo={id:string,occurredAt:string,revenue:number,paid:number,debt:number,cogs:number}

const STORE_KEY='mynh-finance-preview-v3'
const DEFAULT_COLUMN_ORDER:ColumnKey[]=['time','code','type','category','content','counterparty','source','method','income','expense','status']
const COLUMN_LABELS:Record<ColumnKey,string>={
  time:'Thời gian',code:'Mã phiếu',type:'Loại',category:'Hạng mục',content:'Nội dung',
  counterparty:'Đối tượng',source:'Nguồn',method:'Phương thức',income:'Tiền thu',expense:'Tiền chi',status:'Trạng thái'
}
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(Math.round(n))+' ₫'
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)
const nowInput=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
const labelType=(t:TxType)=>t==='INCOME'?'Thu':'Chi'
const labelPayment=(m:Payment)=>m==='CASH'?'Tiền mặt':m==='TRANSFER'?'Chuyển khoản':'Kết hợp'
const labelStatus=(s:DocStatus)=>s==='DRAFT'?'Nháp':s==='CANCELLED'?'Đã huỷ':'Đã ghi nhận'
const totalDoc=(d:DocumentRow)=>d.lines.reduce((s,l)=>s+l.amount,0)

const defaultCategories:Category[]=[
  {id:'sales',code:'IN-SALES',name:'Bán hàng',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'debt',code:'IN-DEBT',name:'Thu công nợ',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'refund-in',code:'IN-REFUND',name:'Hoàn ứng / Thu hồi',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'other-in',code:'IN-OTHER',name:'Thu khác',txType:'INCOME',parentId:null,active:true,system:true},
  {id:'purchase',code:'OUT-PURCHASE',name:'Thanh toán đơn nhập',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'transport',code:'OUT-TRANSPORT',name:'Vận chuyển',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'tip',code:'OUT-TIP',name:'Tip Shipper',txType:'EXPENSE',parentId:'transport',active:true,system:true},
  {id:'shipping',code:'OUT-SHIPPING',name:'Phí vận chuyển',txType:'EXPENSE',parentId:'transport',active:true,system:true},
  {id:'packaging',code:'OUT-PACK',name:'Đóng gói',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'warehouse',code:'OUT-WAREHOUSE',name:'Kho',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'marketing',code:'OUT-MKT',name:'Marketing',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'software',code:'OUT-SOFTWARE',name:'Phần mềm',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'personnel',code:'OUT-HR',name:'Nhân sự',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'utilities',code:'OUT-UTIL',name:'Điện nước',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'office',code:'OUT-OFFICE',name:'Văn phòng',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'customer-refund',code:'OUT-REFUND',name:'Hoàn tiền khách',txType:'EXPENSE',parentId:null,active:true,system:true},
  {id:'other-expense',code:'OUT-OTHER',name:'Chi khác',txType:'EXPENSE',parentId:null,active:true,system:true},
]

const seedDocs:DocumentRow[]=[
  {id:'seed-pos-1',code:'POS-261002-000010',type:'INCOME',status:'POSTED',occurredAt:'2026-10-02T18:20',counterparty:'Khách lẻ',payment:'TRANSFER',cashAmount:0,transferAmount:698000,note:'Thanh toán POS',source:'POS',lines:[{id:'l1',categoryId:'sales',description:'Thanh toán POS',amount:698000}]},
  {id:'seed-pos-2',code:'POS-261001-000008',type:'INCOME',status:'POSTED',occurredAt:'2026-10-01T15:06',counterparty:'Khách lẻ',payment:'CASH',cashAmount:289000,transferAmount:0,note:'Thanh toán POS',source:'POS',lines:[{id:'l2',categoryId:'sales',description:'Thanh toán POS',amount:289000}]},
  {id:'seed-debt',code:'PT-260930-000003',type:'INCOME',status:'POSTED',occurredAt:'2026-09-30T16:30',counterparty:'Nguyễn Văn A',payment:'TRANSFER',cashAmount:0,transferAmount:500000,note:'Thu công nợ',source:'Công nợ khách hàng',lines:[{id:'l3',categoryId:'debt',description:'Thu công nợ đơn BH-260928-01',amount:500000}]},
  {id:'seed-shipper',code:'PC-261002-000019',type:'EXPENSE',status:'POSTED',occurredAt:'2026-10-02T11:05',counterparty:'Shipper HN',payment:'TRANSFER',cashAmount:0,transferAmount:1040000,note:'Đối soát 3 đơn',source:'Đối soát',lines:[{id:'l4',categoryId:'purchase',description:'Thanh toán COD đơn nhập',amount:1020000},{id:'l5',categoryId:'tip',description:'Tip Shipper',amount:20000}]},
  {id:'seed-expense',code:'PC-260929-000011',type:'EXPENSE',status:'POSTED',occurredAt:'2026-09-29T09:15',counterparty:'Nhà cung cấp bao bì',payment:'CASH',cashAmount:350000,transferAmount:0,note:'Mua vật tư đóng gói',source:'Nhập tay',lines:[{id:'l6',categoryId:'packaging',description:'Thùng carton và băng dính',amount:350000}]},
  {id:'seed-draft',code:'PC-261002-000020',type:'EXPENSE',status:'DRAFT',occurredAt:'2026-10-02T20:10',counterparty:'',payment:'TRANSFER',cashAmount:0,transferAmount:120000,note:'Gia hạn công cụ',source:'Nhập tay',lines:[{id:'l7',categoryId:'software',description:'Gia hạn phần mềm',amount:120000}]},
]

const shipperSeed:ShipperBatch[]=[
  {id:'sp1',occurredAt:'2026-10-02T11:05',shipper:'Nguyễn Minh',hub:'HUB HN - Hồng Mai',orders:3,cod:1020000,transferred:1040000,tip:20000,status:'PAID',orderItems:[
    {orderId:'260930A01',tracking:'SPXVN03822101',cod:320000,receivedAt:'2026-10-02T10:42'},
    {orderId:'260930A02',tracking:'SPXVN03822118',cod:280000,receivedAt:'2026-10-02T10:48'},
    {orderId:'260930A03',tracking:'SPXVN03822127',cod:420000,receivedAt:'2026-10-02T10:55'},
  ]},
  {id:'sp2',occurredAt:'2026-09-30T18:40',shipper:'Trần Đức',hub:'HUB BG - Nguyễn Công Hãng',orders:1,cod:400000,transferred:420000,tip:20000,status:'PAID',orderItems:[
    {orderId:'260929B01',tracking:'GHNBG2209411',cod:400000,receivedAt:'2026-09-30T18:22'},
  ]},
  {id:'sp3',occurredAt:'2026-10-02T19:10',shipper:'Nguyễn Minh',hub:'HUB HN - Hồng Mai',orders:2,cod:760000,transferred:0,tip:0,status:'PENDING',orderItems:[
    {orderId:'261002A11',tracking:'SPXVN03825591',cod:360000,receivedAt:'2026-10-02T18:54'},
    {orderId:'261002A12',tracking:'SPXVN03825603',cod:400000,receivedAt:'2026-10-02T19:02'},
  ]},
]

const customerSeed:CustomerRow[]=[
  {id:'c1',name:'Nguyễn Văn A',phone:'0988 123 456',totalSales:1200000,paid:800000,debt:400000,openInvoices:1,lastPayment:'2026-09-30T16:30'},
  {id:'c2',name:'Trần Thị B',phone:'0912 456 789',totalSales:860000,paid:850000,debt:10000,openInvoices:1,lastPayment:'2026-10-01T10:20'},
  {id:'c3',name:'Lê Minh C',phone:'0966 777 222',totalSales:690000,paid:690000,debt:0,openInvoices:0,lastPayment:'2026-10-02T13:10'},
]
const salesSeed:SaleDemo[]=[
  {id:'s1',occurredAt:'2026-10-02T18:20',revenue:698000,paid:698000,debt:0,cogs:410000},
  {id:'s2',occurredAt:'2026-10-01T15:06',revenue:289000,paid:289000,debt:0,cogs:170000},
  {id:'s3',occurredAt:'2026-09-30T14:10',revenue:700000,paid:300000,debt:400000,cogs:405000},
  {id:'s4',occurredAt:'2026-09-28T17:40',revenue:860000,paid:850000,debt:10000,cogs:490000},
]

function dateOnly(v:string){return v.slice(0,10)}
function startOfToday(){
  const d=new Date();d.setHours(0,0,0,0);return d.getTime()
}
function periodMatch(value:string,period:Period,from:string,to:string){
  if(period==='all')return true
  const t=new Date(value).getTime()
  const now=Date.now()
  if(period==='today')return t>=startOfToday()
  if(period==='7d')return t>=now-6*24*60*60*1000
  if(period==='month'){
    const d=new Date()
    return t>=new Date(d.getFullYear(),d.getMonth(),1).getTime()
  }
  if(period==='custom'){
    if(from&&dateOnly(value)<from)return false
    if(to&&dateOnly(value)>to)return false
  }
  return true
}
function statusSettle(s:SettlementStatus){return s==='PAID'?'Đã thanh toán':'Chờ thanh toán'}

export function FinancePreviewWorkspace(){
  const [tab,setTab]=useState<Tab>('overview')
  const [categories,setCategories]=useState<Category[]>(defaultCategories)
  const [docs,setDocs]=useState<DocumentRow[]>(seedDocs)
  const [shipperBatches,setShipperBatches]=useState<ShipperBatch[]>(shipperSeed)
  const [hydrated,setHydrated]=useState(false)
  const [panel,setPanel]=useState<'NONE'|'DOCUMENT'|'CATEGORIES'|'DETAIL'|'BILL'|'HUB'>('NONE')
  const [detailId,setDetailId]=useState<string|null>(null)
  const [detailTab,setDetailTab]=useState<'INFO'|'REF'|'HISTORY'>('INFO')
  const [documentTab,setDocumentTab]=useState<'INFO'|'MONEY'>('INFO')
  const [billTab,setBillTab]=useState<'READ'|'CATEGORY'>('READ')

  const [period,setPeriod]=useState<Period>('all')
  const [customFrom,setCustomFrom]=useState('')
  const [customTo,setCustomTo]=useState('')

  const [docType,setDocType]=useState<TxType>('EXPENSE')
  const [editingId,setEditingId]=useState<string|null>(null)
  const [occurredAt,setOccurredAt]=useState(nowInput())
  const [counterparty,setCounterparty]=useState('')
  const [payment,setPayment]=useState<Payment>('CASH')
  const [cashAmount,setCashAmount]=useState('')
  const [transferAmount,setTransferAmount]=useState('')
  const [note,setNote]=useState('')
  const [draftLines,setDraftLines]=useState<DraftLine[]>([{id:uid(),categoryId:'',description:'',amount:''}])
  const [formError,setFormError]=useState('')
  const [cancelReason,setCancelReason]=useState('')

  const [catType,setCatType]=useState<TxType>('EXPENSE')
  const [catSearch,setCatSearch]=useState('')
  const [catEditId,setCatEditId]=useState<string|null>(null)
  const [catName,setCatName]=useState('')
  const [catParent,setCatParent]=useState('')
  const [catNote,setCatNote]=useState('')

  const [search,setSearch]=useState('')
  const [filterType,setFilterType]=useState<'ALL'|TxType>('ALL')
  const [filterCategory,setFilterCategory]=useState('ALL')
  const [filterSource,setFilterSource]=useState('ALL')
  const [filterMethod,setFilterMethod]=useState<'ALL'|Payment>('ALL')
  const [filterStatus,setFilterStatus]=useState<'ALL'|DocStatus>('ALL')
  const [sortKey,setSortKey]=useState<SortKey>('time')
  const [sortDir,setSortDir]=useState<SortDir>('desc')
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(10)
  const [columnOrder,setColumnOrder]=useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER)
  const [hiddenColumns,setHiddenColumns]=useState<ColumnKey[]>([])
  const [columnMenu,setColumnMenu]=useState(false)
  const [draggedColumn,setDraggedColumn]=useState<ColumnKey|null>(null)

  const [settlementMode,setSettlementMode]=useState<SettlementMode>('shipper')
  const [settlementView,setSettlementView]=useState<SettlementView>('batch')
  const [settlementSearch,setSettlementSearch]=useState('')
  const [settlementStatus,setSettlementStatus]=useState<'ALL'|SettlementStatus>('ALL')
  const [selectedHub,setSelectedHub]=useState<string|null>(null)
  const [hubPayBatchId,setHubPayBatchId]=useState<string|null>(null)
  const [hubTransferAmount,setHubTransferAmount]=useState('')
  const [hubError,setHubError]=useState('')

  const [billReading,setBillReading]=useState(false)
  const [billFileName,setBillFileName]=useState('')
  const [billPreview,setBillPreview]=useState('')
  const [billRawText,setBillRawText]=useState('')
  const [billAmount,setBillAmount]=useState(0)
  const [billOccurredAt,setBillOccurredAt]=useState(nowInput())
  const [billCounterparty,setBillCounterparty]=useState('')
  const [billContent,setBillContent]=useState('')
  const [billBank,setBillBank]=useState('')
  const [billType,setBillType]=useState<TxType>('EXPENSE')
  const [billCategory,setBillCategory]=useState('')
  const [billError,setBillError]=useState('')

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORE_KEY)
      if(raw){
        const parsed=JSON.parse(raw)
        if(Array.isArray(parsed.categories))setCategories(parsed.categories)
        if(Array.isArray(parsed.docs))setDocs(parsed.docs)
        if(Array.isArray(parsed.shipperBatches))setShipperBatches(parsed.shipperBatches)
        if(Array.isArray(parsed.columnOrder)&&parsed.columnOrder.length===DEFAULT_COLUMN_ORDER.length)setColumnOrder(parsed.columnOrder)
        if(Array.isArray(parsed.hiddenColumns))setHiddenColumns(parsed.hiddenColumns)
      }
    }catch{}
    setHydrated(true)
  },[])
  useEffect(()=>{
    if(!hydrated)return
    localStorage.setItem(STORE_KEY,JSON.stringify({categories,docs,shipperBatches,columnOrder,hiddenColumns}))
  },[hydrated,categories,docs,shipperBatches,columnOrder,hiddenColumns])
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPanel('NONE');setColumnMenu(false)}}
    const onPointer=(event:MouseEvent)=>{
      const target=event.target as HTMLElement
      if(!target.closest('.finance-column-manager-wrap'))setColumnMenu(false)
    }
    window.addEventListener('keydown',onKey)
    document.addEventListener('mousedown',onPointer)
    return ()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('mousedown',onPointer)}
  },[])

  const categoryMap=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories])
  const periodDocs=useMemo(()=>docs.filter(d=>periodMatch(d.occurredAt,period,customFrom,customTo)),[docs,period,customFrom,customTo])
  const postedPeriod=periodDocs.filter(d=>d.status==='POSTED')
  const income=postedPeriod.filter(d=>d.type==='INCOME').reduce((s,d)=>s+totalDoc(d),0)
  const expense=postedPeriod.filter(d=>d.type==='EXPENSE').reduce((s,d)=>s+totalDoc(d),0)
  const selectedDetail=docs.find(d=>d.id===detailId)??null
  const activeCategories=categories.filter(c=>c.txType===docType&&c.active)

  const cashflowRows=useMemo(()=>{
    const q=search.trim().toLowerCase()
    const filtered=periodDocs.filter(d=>{
      const cats=[...new Set(d.lines.map(l=>categoryMap.get(l.categoryId)?.name??''))]
      if(filterType!=='ALL'&&d.type!==filterType)return false
      if(filterCategory!=='ALL'&&!d.lines.some(l=>l.categoryId===filterCategory))return false
      if(filterSource!=='ALL'&&d.source!==filterSource)return false
      if(filterMethod!=='ALL'&&d.payment!==filterMethod)return false
      if(filterStatus!=='ALL'&&d.status!==filterStatus)return false
      if(q&&![
        d.code,d.counterparty,d.note,d.source,labelPayment(d.payment),labelStatus(d.status),
        ...cats,...d.lines.map(l=>l.description),
      ].join(' ').toLowerCase().includes(q))return false
      return true
    })
    return filtered.sort((a,b)=>{
      const acats=[...new Set(a.lines.map(l=>categoryMap.get(l.categoryId)?.name??''))].join(', ')
      const bcats=[...new Set(b.lines.map(l=>categoryMap.get(l.categoryId)?.name??''))].join(', ')
      const contentA=a.lines.length===1?a.lines[0].description:a.lines.length+' hạng mục'
      const contentB=b.lines.length===1?b.lines[0].description:b.lines.length+' hạng mục'
      const sortValue=(d:DocumentRow,cats:string,content:string)=>{
        switch(sortKey){
          case 'time':return new Date(d.occurredAt).getTime()
          case 'code':return d.code
          case 'type':return d.type
          case 'category':return cats
          case 'content':return content
          case 'counterparty':return d.counterparty
          case 'source':return d.source
          case 'method':return d.payment
          case 'income':return d.type==='INCOME'?totalDoc(d):-1
          case 'expense':return d.type==='EXPENSE'?totalDoc(d):-1
          case 'status':return d.status
        }
      }
      const av=sortValue(a,acats,contentA)
      const bv=sortValue(b,bcats,contentB)
      const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi')
      return sortDir==='asc'?cmp:-cmp
    })
  },[periodDocs,search,filterType,filterCategory,filterSource,filterMethod,filterStatus,sortKey,sortDir,categoryMap])

  const maxPage=Math.max(1,Math.ceil(cashflowRows.length/pageSize))
  const safePage=Math.min(page,maxPage)
  const pageRows=cashflowRows.slice((safePage-1)*pageSize,safePage*pageSize)
  const sourceOptions=[...new Set(docs.map(d=>d.source))]

  const shipperRows=useMemo(()=>shipperBatches.filter(x=>{
    if(!periodMatch(x.occurredAt,period,customFrom,customTo))return false
    if(settlementStatus!=='ALL'&&x.status!==settlementStatus)return false
    const q=settlementSearch.trim().toLowerCase()
    return !q||[x.shipper,x.hub].join(' ').toLowerCase().includes(q)
  }),[shipperBatches,period,customFrom,customTo,settlementStatus,settlementSearch])
  const customerRows=useMemo(()=>customerSeed.filter(x=>{
    const q=settlementSearch.trim().toLowerCase()
    if(q&&![x.name,x.phone].join(' ').toLowerCase().includes(q))return false
    if(settlementStatus==='PENDING'&&x.debt<=0)return false
    if(settlementStatus==='PAID'&&x.debt>0)return false
    return true
  }),[settlementStatus,settlementSearch])

  const selectedHubBatches=useMemo(()=>selectedHub?shipperBatches.filter(x=>x.hub===selectedHub):[],[selectedHub,shipperBatches])
  const selectedHubCod=selectedHubBatches.reduce((sum,x)=>sum+x.cod,0)
  const selectedHubTransferred=selectedHubBatches.reduce((sum,x)=>sum+x.transferred,0)
  const selectedHubTip=selectedHubBatches.reduce((sum,x)=>sum+x.tip,0)

  function resetAllFilters(){
    setSearch('');setFilterType('ALL');setFilterCategory('ALL');setFilterSource('ALL')
    setFilterMethod('ALL');setFilterStatus('ALL');setPage(1)
  }
  function setPeriodSafe(next:Period){setPeriod(next);setPage(1)}
  function changeSort(next:SortKey){
    if(sortKey===next)setSortDir(v=>v==='asc'?'desc':'asc')
    else{setSortKey(next);setSortDir('asc')}
    setPage(1)
  }
  function toggleColumn(key:ColumnKey){
    setHiddenColumns(prev=>{
      if(prev.includes(key))return prev.filter(x=>x!==key)
      const visible=columnOrder.filter(x=>!prev.includes(x))
      if(visible.length<=1)return prev
      return [...prev,key]
    })
  }
  function moveColumn(from:ColumnKey,to:ColumnKey){
    if(from===to)return
    setColumnOrder(prev=>{
      const next=[...prev]
      const fromIndex=next.indexOf(from),toIndex=next.indexOf(to)
      if(fromIndex<0||toIndex<0)return prev
      next.splice(fromIndex,1)
      next.splice(toIndex,0,from)
      return next
    })
  }
  function resetColumns(){setColumnOrder(DEFAULT_COLUMN_ORDER);setHiddenColumns([])}
  function openCashflowFilter(type:'ALL'|TxType,status:'ALL'|DocStatus='ALL'){
    setTab('cashflow');setFilterType(type);setFilterStatus(status);setPage(1);setPanel('NONE')
  }

  function resetDocument(type:TxType){
    setEditingId(null);setDocumentTab('INFO');setDocType(type);setOccurredAt(nowInput());setCounterparty('');setPayment('CASH')
    setCashAmount('');setTransferAmount('');setNote('');setDraftLines([{id:uid(),categoryId:'',description:'',amount:''}])
    setFormError('');setPanel('DOCUMENT')
  }
  function editDraft(d:DocumentRow){
    if(d.status!=='DRAFT')return
    setEditingId(d.id);setDocumentTab('INFO');setDocType(d.type);setOccurredAt(d.occurredAt);setCounterparty(d.counterparty);setPayment(d.payment)
    setCashAmount(String(d.cashAmount||''));setTransferAmount(String(d.transferAmount||''));setNote(d.note)
    setDraftLines(d.lines.map(l=>({id:l.id,categoryId:l.categoryId,description:l.description,amount:String(l.amount)})))
    setFormError('');setPanel('DOCUMENT')
  }
  function addLine(){setDraftLines(v=>[...v,{id:uid(),categoryId:'',description:'',amount:''}])}
  function patchLine(id:string,patch:Partial<DraftLine>){setDraftLines(v=>v.map(x=>x.id===id?{...x,...patch}:x))}
  function removeLine(id:string){setDraftLines(v=>v.length===1?v:v.filter(x=>x.id!==id))}
  function submitDocument(status:'DRAFT'|'POSTED'){
    setFormError('')
    const lines=draftLines.map(x=>({id:x.id||uid(),categoryId:x.categoryId,description:x.description.trim(),amount:Number(x.amount)}))
    if(lines.some(x=>!x.categoryId||!x.description||!Number.isFinite(x.amount)||x.amount<=0)){setFormError('Nhập đủ Hạng mục, Nội dung và Số tiền cho từng dòng.');return}
    const total=lines.reduce((s,x)=>s+x.amount,0)
    let cash=0,transfer=0
    if(payment==='CASH')cash=total
    else if(payment==='TRANSFER')transfer=total
    else{
      cash=Number(cashAmount);transfer=Number(transferAmount)
      if(!Number.isFinite(cash)||!Number.isFinite(transfer)||cash<=0||transfer<=0||Math.round(cash+transfer)!==Math.round(total)){setFormError('Với Kết hợp, Tiền mặt + Chuyển khoản phải bằng Tổng phiếu.');return}
    }
    if(editingId){
      setDocs(v=>v.map(d=>d.id===editingId?{...d,type:docType,status,occurredAt,counterparty:counterparty.trim(),payment,cashAmount:cash,transferAmount:transfer,note:note.trim(),lines}:d))
    }else{
      const prefix=docType==='INCOME'?'PT':'PC'
      const code=prefix+'-'+new Date(occurredAt).toISOString().slice(2,10).replaceAll('-','')+'-'+String(docs.length+1).padStart(6,'0')
      setDocs(v=>[...v,{id:uid(),code,type:docType,status,occurredAt,counterparty:counterparty.trim(),payment,cashAmount:cash,transferAmount:transfer,note:note.trim(),source:'Nhập tay',lines}])
    }
    setPanel('NONE')
  }

  function openCategoryPanel(){
    setCatSearch('');setCatEditId(null);setCatName('');setCatParent('');setCatNote('');setPanel('CATEGORIES')
  }
  function editCategory(cat:Category){
    setCatType(cat.txType);setCatEditId(cat.id);setCatName(cat.name);setCatParent(cat.parentId??'');setCatNote(cat.note??'')
  }
  function saveCategory(){
    const name=catName.trim()
    if(!name)return
    const duplicate=categories.some(c=>c.txType===catType&&c.id!==catEditId&&c.name.trim().toLowerCase()===name.toLowerCase())
    if(duplicate){setFormError('Hạng mục cùng loại đã tồn tại.');return}
    if(catEditId){
      setCategories(v=>v.map(c=>c.id===catEditId?{...c,name,parentId:catParent||null,note:catNote.trim()}:c))
    }else{
      setCategories(v=>[...v,{id:uid(),code:(catType==='INCOME'?'IN-':'OUT-')+String(v.length+1).padStart(3,'0'),name,txType:catType,parentId:catParent||null,active:true,note:catNote.trim()}])
    }
    setCatEditId(null);setCatName('');setCatParent('');setCatNote('');setFormError('')
  }
  function toggleCategory(id:string){setCategories(v=>v.map(c=>c.id===id&&!c.system?{...c,active:!c.active}:c))}

  function openDetail(id:string){setDetailId(id);setDetailTab('INFO');setCancelReason('');setPanel('DETAIL')}
  function cancelDocument(){
    if(!selectedDetail)return
    if(!cancelReason.trim()){setFormError('Cần nhập lý do huỷ phiếu.');return}
    setDocs(v=>v.map(d=>d.id===selectedDetail.id?{...d,status:'CANCELLED',cancelReason:cancelReason.trim()}:d))
    setPanel('NONE');setFormError('')
  }

  function resetPreview(){
    localStorage.removeItem(STORE_KEY);setCategories(defaultCategories);setDocs(seedDocs);setShipperBatches(shipperSeed);setColumnOrder(DEFAULT_COLUMN_ORDER);setHiddenColumns([]);setPanel('NONE');resetAllFilters();setPeriod('all')
  }

  function openHub(hub:string){
    setSelectedHub(hub);setHubPayBatchId(null);setHubTransferAmount('');setHubError('');setPanel('HUB')
  }
  function startHubPayment(batch:ShipperBatch){
    setHubPayBatchId(batch.id);setHubTransferAmount(String(batch.cod));setHubError('')
  }
  function confirmHubPayment(){
    setHubError('')
    const batch=shipperBatches.find(x=>x.id===hubPayBatchId)
    if(!batch)return
    const amount=Number(hubTransferAmount)
    if(!Number.isFinite(amount)||amount<batch.cod){setHubError('Thực chuyển phải bằng hoặc lớn hơn tổng COD của đợt.');return}
    const tip=amount-batch.cod
    setShipperBatches(v=>v.map(x=>x.id===batch.id?{...x,transferred:amount,tip,status:'PAID'}:x))
    const exists=docs.some(d=>d.source==='Đối soát'&&d.note.includes(batch.id))
    if(!exists){
      const lines:Line[]=[{id:uid(),categoryId:'purchase',description:'Thanh toán COD '+batch.orders+' đơn',amount:batch.cod}]
      if(tip>0)lines.push({id:uid(),categoryId:'tip',description:'Tip Shipper',amount:tip})
      setDocs(v=>[...v,{id:uid(),code:'PC-'+new Date().toISOString().slice(2,10).replaceAll('-','')+'-'+String(v.length+1).padStart(6,'0'),type:'EXPENSE',status:'POSTED',occurredAt:nowInput(),counterparty:batch.shipper,payment:'TRANSFER',cashAmount:0,transferAmount:amount,note:'Đối soát '+batch.id+' · '+batch.hub,source:'Đối soát',lines}])
    }
    setHubPayBatchId(null);setHubTransferAmount('')
  }

  function openBillReader(){
    setBillTab('READ');setBillReading(false);setBillFileName('');setBillPreview('');setBillRawText('');setBillAmount(0);setBillOccurredAt(nowInput())
    setBillCounterparty('');setBillContent('');setBillBank('');setBillType('EXPENSE');setBillCategory('');setBillError('');setPanel('BILL')
  }
  function parseBillText(raw:string){
    const text=raw.replace(/\r/g,'');const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);const lower=text.toLowerCase()
    const bankNames=[['Techcombank','techcombank'],['Vietcombank','vietcombank'],['MB Bank','mb bank'],['MB Bank','mbbank'],['BIDV','bidv'],['VietinBank','vietinbank'],['VPBank','vpbank'],['ACB','acb'],['TPBank','tpbank'],['Sacombank','sacombank'],['VIB','vib'],['MSB','msb']]
    const bank=bankNames.find(([,token])=>lower.includes(token))?.[0]??''
    let amount=0
    for(const line of lines){
      if(!/(số tiền|amount|giá trị giao dịch|thành tiền|vnd|vnđ|₫|\bđ\b)/i.test(line))continue
      for(const c of line.match(/[+-]?\s*\d[\d\s.,]{2,}/g)??[]){const n=Number(c.replace(/[^\d]/g,''));if(Number.isFinite(n)&&n>=1000&&n>amount)amount=n}
      if(amount)break
    }
    let occurred=nowInput()
    const dm=text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+|\s*[,|-]\s*)(\d{1,2}):(\d{2})(?::\d{2})?\b/)
    if(dm){const [,d,m,y,h,mi]=dm;occurred=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${mi}`}
    function after(labels:string[]){
      for(let i=0;i<lines.length;i++)for(const label of labels){const at=lines[i].toLowerCase().indexOf(label);if(at>=0){const same=lines[i].slice(at+label.length).replace(/^\s*[:\-]\s*/,'').trim();if(same)return same;if(lines[i+1])return lines[i+1]}}
      return ''
    }
    const counterparty=after(['người nhận','tên người nhận','người thụ hưởng','beneficiary','receiver'])
    const content=after(['nội dung chuyển tiền','nội dung giao dịch','nội dung','description'])
    const incoming=['tiền vào','nhận tiền','ghi có','credit','incoming transfer','đã nhận']
    const outgoing=['chuyển tiền thành công','người nhận','thụ hưởng','ghi nợ','debit','transfer successful']
    const detectedType:TxType=incoming.some(k=>lower.includes(k))&&!outgoing.some(k=>lower.includes(k))?'INCOME':'EXPENSE'
    return {bank,amount,occurred,counterparty,content,detectedType}
  }
  async function readBill(file:File){
    setBillError('');setBillReading(true);setBillFileName(file.name);setBillPreview(URL.createObjectURL(file))
    try{
      const {createWorker}=await import('tesseract.js');const worker=await createWorker('vie+eng');const result=await worker.recognize(file);await worker.terminate()
      const raw=result.data.text??'';setBillRawText(raw);const parsed=parseBillText(raw)
      setBillBank(parsed.bank);setBillAmount(parsed.amount);setBillOccurredAt(parsed.occurred);setBillCounterparty(parsed.counterparty);setBillContent(parsed.content);setBillType(parsed.detectedType);setBillCategory('')
      if(parsed.amount)setBillTab('CATEGORY')
      if(!parsed.amount)setBillError('Đã đọc bill nhưng chưa nhận diện chắc chắn số tiền. Hãy thử ảnh rõ hơn.')
    }catch(error:any){setBillError('Không đọc được bill: '+String(error?.message??'OCR thất bại'))}finally{setBillReading(false)}
  }
  function commitBill(){
    setBillError('')
    if(!billAmount){setBillError('Chưa đọc được số tiền từ bill.');return}
    if(!billCategory){setBillError('Chỉ còn một bước: chọn Hạng mục.');return}
    const duplicate=docs.some(d=>d.status!=='CANCELLED'&&d.payment==='TRANSFER'&&totalDoc(d)===billAmount&&dateOnly(d.occurredAt)===dateOnly(billOccurredAt))
    if(duplicate&&!window.confirm('Có giao dịch chuyển khoản cùng số tiền trong ngày. Vẫn ghi nhận bill này?'))return
    const prefix=billType==='INCOME'?'PT':'PC';const code=prefix+'-'+new Date(billOccurredAt).toISOString().slice(2,10).replaceAll('-','')+'-'+String(docs.length+1).padStart(6,'0')
    const description=billContent||('Giao dịch ngân hàng'+(billBank?' · '+billBank:''))
    setDocs(v=>[...v,{id:uid(),code,type:billType,status:'POSTED',occurredAt:billOccurredAt,counterparty:billCounterparty,payment:'TRANSFER',cashAmount:0,transferAmount:billAmount,note:'Đọc từ bill ngân hàng'+(billBank?' · '+billBank:'')+(billFileName?' · '+billFileName:''),source:'Bill ngân hàng',lines:[{id:uid(),categoryId:billCategory,description,amount:billAmount}]}])
    setPanel('NONE')
  }

  return <div className="shell finance-preview-old-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark small">M</span><span><b>MYNH ERP</b><small>TÀI CHÍNH PREVIEW</small></span></div>
      <nav className="nav"><section className="nav-group"><div className="nav-section-label">TÀI CHÍNH</div><div className="nav-group-items">
        <a href="#" className={tab==='overview'?'active':''} onClick={e=>{e.preventDefault();setTab('overview');setPanel('NONE')}}><span className="nav-icon">₫</span><span>Tổng quan tài chính</span></a>
        <a href="#" className={tab==='cashflow'?'active':''} onClick={e=>{e.preventDefault();setTab('cashflow');setPanel('NONE')}}><span className="nav-icon">↕</span><span>Thu / Chi</span></a>
        <a href="#" className={tab==='settlement'?'active':''} onClick={e=>{e.preventDefault();setTab('settlement');setPanel('NONE')}}><span className="nav-icon">✓</span><span>Đối soát & Thanh toán</span></a>
        <a href="#" className={tab==='reports'?'active':''} onClick={e=>{e.preventDefault();setTab('reports');setPanel('NONE')}}><span className="nav-icon">▥</span><span>Báo cáo tài chính</span></a>
      </div></section></nav>
      <div className="sidebar-foot"><div className="account"><b>Finance Preview</b><span>Không ghi dữ liệu production</span></div><button className="button ghost" type="button" onClick={resetPreview}>Đặt lại dữ liệu Preview</button></div>
    </aside>

    <main className="main finance-preview-main-old">
      <div className="finance-preview-banner"><b>Cloudflare Preview · Tài chính</b><span>Kiểm thử đầy đủ trước khi ghép vào MYNH ERP chính</span></div>
      <div className={'finance-preview-workspace '+(panel!=='NONE'?'has-slidebar':'')}>
        <section className="finance-preview-content">
          {tab==='overview'&&<Overview docs={periodDocs} categories={categoryMap} income={income} expense={expense} period={period} from={customFrom} to={customTo} onPeriod={setPeriodSafe} onFrom={setCustomFrom} onTo={setCustomTo} onOpenCashflow={openCashflowFilter}/>}
          {tab==='cashflow'&&<Cashflow docs={pageRows} allCount={cashflowRows.length} incomeCount={periodDocs.filter(d=>d.type==='INCOME'&&d.status!=='CANCELLED').length} expenseCount={periodDocs.filter(d=>d.type==='EXPENSE'&&d.status!=='CANCELLED').length} categories={categories} categoryMap={categoryMap} income={income} expense={expense} draftCount={periodDocs.filter(d=>d.status==='DRAFT').length} search={search} setSearch={v=>{setSearch(v);setPage(1)}} filterType={filterType} setFilterType={v=>{setFilterType(v);setPage(1)}} filterCategory={filterCategory} setFilterCategory={v=>{setFilterCategory(v);setPage(1)}} filterSource={filterSource} setFilterSource={v=>{setFilterSource(v);setPage(1)}} filterMethod={filterMethod} setFilterMethod={v=>{setFilterMethod(v);setPage(1)}} filterStatus={filterStatus} setFilterStatus={v=>{setFilterStatus(v);setPage(1)}} sources={sourceOptions} period={period} from={customFrom} to={customTo} onPeriod={setPeriodSafe} onFrom={setCustomFrom} onTo={setCustomTo} resetFilters={resetAllFilters} sortKey={sortKey} sortDir={sortDir} onSort={changeSort} page={safePage} maxPage={maxPage} pageSize={pageSize} setPage={setPage} setPageSize={v=>{setPageSize(v);setPage(1)}} columnOrder={columnOrder} hiddenColumns={hiddenColumns} columnMenu={columnMenu} setColumnMenu={setColumnMenu} draggedColumn={draggedColumn} setDraggedColumn={setDraggedColumn} onToggleColumn={toggleColumn} onMoveColumn={moveColumn} onResetColumns={resetColumns} onCreate={resetDocument} onBill={openBillReader} onCategories={openCategoryPanel} onDetail={openDetail}/>}
          {tab==='settlement'&&<Settlement mode={settlementMode} setMode={setSettlementMode} view={settlementView} setView={setSettlementView} period={period} from={customFrom} to={customTo} onPeriod={setPeriodSafe} onFrom={setCustomFrom} onTo={setCustomTo} search={settlementSearch} setSearch={setSettlementSearch} status={settlementStatus} setStatus={setSettlementStatus} shipperRows={shipperRows} customerRows={customerRows} onOpenHub={openHub}/>} 
          {tab==='reports'&&<Reports docs={postedPeriod} categories={categoryMap} income={income} expense={expense} period={period} from={customFrom} to={customTo} onPeriod={setPeriodSafe} onFrom={setCustomFrom} onTo={setCustomTo}/>}
        </section>

        {panel!=='NONE'&&<aside className="detail-panel finance-panel finance-preview-slidebar">
          {panel==='DOCUMENT'&&<>
            <div className="panel-head"><div><span className="eyebrow">{docType==='INCOME'?'PHIẾU THU':'PHIẾU CHI'}</span><h2>{editingId?'Sửa phiếu nháp':docType==='INCOME'?'Tạo Phiếu thu':'Tạo Phiếu chi'}</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
            <div className="panel-tabs">
              <button className={documentTab==='INFO'?'active':''} onClick={()=>setDocumentTab('INFO')}>Thông tin</button>
              <button className={documentTab==='MONEY'?'active':''} onClick={()=>setDocumentTab('MONEY')}>Chi tiết tiền <span className="panel-tab-count">{draftLines.length}</span></button>
            </div>
            <div className="panel-scroll finance-form">
              {formError&&<div className="error-box">{formError}</div>}
              {documentTab==='INFO'&&<>
                <div className="form-grid"><label>Ngày {docType==='INCOME'?'thu':'chi'}<input className="finance-datetime" type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label><label>Phương thức<select value={payment} onChange={e=>setPayment(e.target.value as Payment)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="COMBINED">Kết hợp</option></select></label></div>
                <label>{docType==='INCOME'?'Người nộp':'Người nhận'}<input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Không bắt buộc"/></label>
                <label>Ghi chú<textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú chứng từ..."/></label>
                <div className="finance-panel-hint"><b>Bước tiếp theo</b><span>Mở tab “Chi tiết tiền” để chọn hạng mục, nhập nội dung và số tiền.</span><button className="button small" type="button" onClick={()=>setDocumentTab('MONEY')}>Mở Chi tiết tiền →</button></div>
              </>}
              {documentTab==='MONEY'&&<>
                <div className="finance-lines-head"><div><b>Chi tiết hạng mục</b><span>{draftLines.length} dòng</span></div><button className="mini-add" type="button" onClick={addLine}>+ Thêm dòng</button></div>
                <div className="finance-lines">{draftLines.map((line,index)=><div className="finance-line-card" key={line.id}><div className="finance-line-number">#{index+1}</div><label>Hạng mục<select value={line.categoryId} onChange={e=>patchLine(line.id,{categoryId:e.target.value})}><option value="">Chọn hạng mục...</option>{activeCategories.map(c=><option key={c.id} value={c.id}>{c.parentId?'↳ ':''}{c.name}</option>)}</select></label><label>Nội dung<input value={line.description} onChange={e=>patchLine(line.id,{description:e.target.value})} placeholder="Nội dung thu / chi"/></label><label>Số tiền<input type="number" min="0" step="1000" value={line.amount} onChange={e=>patchLine(line.id,{amount:e.target.value})}/></label>{draftLines.length>1&&<button className="finance-remove-line" type="button" onClick={()=>removeLine(line.id)}>Xoá</button>}</div>)}</div>
                {payment==='COMBINED'&&<div className="finance-split-payment"><label>Tiền mặt<input type="number" min="0" value={cashAmount} onChange={e=>setCashAmount(e.target.value)}/></label><label>Chuyển khoản<input type="number" min="0" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)}/></label></div>}
                <div className="finance-total"><span>Tổng phiếu</span><b>{money(draftLines.reduce((sum,x)=>sum+(Number(x.amount)||0),0))}</b></div>
              </>}
              <div className="form-actions finance-form-actions"><button className="button" onClick={()=>submitDocument('DRAFT')}>Lưu nháp</button><button className="button primary" onClick={()=>submitDocument('POSTED')}>Ghi nhận</button></div>
            </div>
          </>}

          {panel==='BILL'&&<>
            <div className="panel-head"><div><span className="eyebrow">NGÂN HÀNG</span><h2>Đọc bill giao dịch</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
            <div className="panel-tabs">
              <button className={billTab==='READ'?'active':''} onClick={()=>setBillTab('READ')}>Đọc bill</button>
              <button className={billTab==='CATEGORY'?'active':''} onClick={()=>setBillTab('CATEGORY')}>Gắn hạng mục {billAmount>0&&<span className="panel-tab-count">1</span>}</button>
            </div>
            <div className="panel-scroll finance-bill-panel">
              {billError&&<div className="error-box">{billError}</div>}
              {billTab==='READ'&&<>
                <label className="finance-bill-upload"><input type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void readBill(file)}}/><b>{billReading?'Đang đọc bill...':'Chọn ảnh bill ngân hàng'}</b><span>PNG, JPG, ảnh chụp màn hình · OCR chạy trong trình duyệt Preview</span></label>
                {billPreview&&<div className="finance-bill-image"><img src={billPreview} alt="Bill ngân hàng đã chọn"/></div>}
                {(billReading||billRawText)&&<div className="finance-bill-readout"><div className="finance-bill-status"><span>{billReading?'Đang nhận diện...':'Đã đọc bill'}</span><b>{billBank||'Ngân hàng chưa xác định'}</b></div>{!billReading&&<>
                  <div className="detail-grid"><div><span>Loại giao dịch</span><b>{labelType(billType)}</b></div><div><span>Phương thức</span><b>Chuyển khoản</b></div><div><span>Thời gian</span><b>{new Date(billOccurredAt).toLocaleString('vi-VN')}</b></div><div><span>Số tiền</span><b>{billAmount?money(billAmount):'Chưa nhận diện'}</b></div><div className="full"><span>Đối tượng</span><b>{billCounterparty||'Chưa nhận diện'}</b></div><div className="full"><span>Nội dung</span><b>{billContent||'Giao dịch ngân hàng'}</b></div></div>
                  <details className="finance-bill-raw"><summary>Xem văn bản OCR</summary><pre>{billRawText}</pre></details>
                  <div className="form-actions finance-form-actions"><button className="button primary" disabled={!billAmount} onClick={()=>setBillTab('CATEGORY')}>Tiếp tục: Gắn hạng mục →</button></div>
                </>}</div>}
              </>}
              {billTab==='CATEGORY'&&<>
                {!billRawText?<div className="finance-panel-empty"><b>Chưa có bill để gắn hạng mục</b><span>Quay lại tab “Đọc bill” và chọn ảnh giao dịch trước.</span><button className="button" onClick={()=>setBillTab('READ')}>← Đọc bill</button></div>:<>
                  <div className="finance-bill-summary"><div><span>Số tiền</span><b>{money(billAmount)}</b></div><div><span>Đối tượng</span><b>{billCounterparty||'Chưa nhận diện'}</b></div><div><span>Ngân hàng</span><b>{billBank||'Chưa xác định'}</b></div></div>
                  <div className="finance-bill-category"><label>Hạng mục<select value={billCategory} onChange={e=>setBillCategory(e.target.value)}><option value="">Chọn hạng mục...</option>{categories.filter(c=>c.txType===billType&&c.active).map(c=><option key={c.id} value={c.id}>{c.parentId?'↳ ':''}{c.name}</option>)}</select></label><small>OCR đã đọc thông tin bill. Đây là bước duy nhất cần bạn xác nhận thủ công trước khi ghi nhận.</small></div>
                  <div className="form-actions finance-form-actions"><button className="button" onClick={()=>setBillTab('READ')}>← Kiểm tra bill</button><button className="button primary" onClick={commitBill}>Gắn hạng mục & Ghi nhận</button></div>
                </>}
              </>}
            </div>
          </>}

          {panel==='HUB'&&selectedHub&&<>
            <div className="panel-head"><div><span className="eyebrow">ĐỐI SOÁT HUB</span><h2>{selectedHub}</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
            <div className="panel-tabs"><button className="active">Tổng quan & thanh toán</button></div>
            <div className="panel-scroll finance-hub-panel">
              {hubError&&<div className="error-box">{hubError}</div>}
              <div className="finance-hub-purpose"><b>HUB dùng để làm gì?</b><span>Đối chiếu nguồn giao trước khi nhận: HUB → Shipper → các đơn đã nhận → COD phải chuyển → thực chuyển → tip. Sau khi đã nhận hàng, HUB chỉ là dữ liệu tham chiếu, không dùng để phân nhóm kho.</span></div>
              <div className="finance-hub-summary"><div><span>Đợt</span><b>{selectedHubBatches.length}</b></div><div><span>Đơn</span><b>{selectedHubBatches.reduce((sum,x)=>sum+x.orders,0)}</b></div><div><span>Tổng COD</span><b>{money(selectedHubCod)}</b></div><div><span>Đã chuyển</span><b>{money(selectedHubTransferred)}</b></div><div><span>Tip</span><b>{money(selectedHubTip)}</b></div></div>
              <div className="finance-hub-batches">{selectedHubBatches.map(batch=><section className={'finance-hub-batch '+batch.status.toLowerCase()} key={batch.id}>
                <div className="finance-hub-batch-head"><div><b>{batch.shipper}</b><span>{new Date(batch.occurredAt).toLocaleString('vi-VN')} · {batch.orders} đơn</span></div><strong>{statusSettle(batch.status)}</strong></div>
                <div className="finance-hub-batch-metrics"><span>COD <b>{money(batch.cod)}</b></span><span>Thực chuyển <b>{money(batch.transferred)}</b></span><span>Tip <b>{money(batch.tip)}</b></span></div>
                <div className="finance-hub-orders">{batch.orderItems.map(order=><div key={order.orderId}><span><b>{order.orderId}</b><small>{order.tracking}</small></span><span><b>{money(order.cod)}</b><small>Nhận {new Date(order.receivedAt).toLocaleString('vi-VN')}</small></span></div>)}</div>
                {batch.status==='PENDING'&&hubPayBatchId!==batch.id&&<button className="button primary small" onClick={()=>startHubPayment(batch)}>Ghi nhận thanh toán đợt này</button>}
                {hubPayBatchId===batch.id&&<div className="finance-hub-payment"><label>Thực chuyển<input type="number" min={batch.cod} step="1000" value={hubTransferAmount} onChange={e=>setHubTransferAmount(e.target.value)}/></label><div><span>Tip tự tính</span><b>{money(Math.max(0,(Number(hubTransferAmount)||0)-batch.cod))}</b></div><div className="form-actions"><button className="button" onClick={()=>{setHubPayBatchId(null);setHubTransferAmount('')}}>Bỏ qua</button><button className="button primary" onClick={confirmHubPayment}>Xác nhận thanh toán</button></div></div>}
              </section>)}</div>
            </div>
          </>}

          {panel==='CATEGORIES'&&<>
            <div className="panel-head"><div><span className="eyebrow">CẤU HÌNH TÀI CHÍNH</span><h2>Hạng mục Thu / Chi</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
            <div className="panel-tabs"><button className={catType==='INCOME'?'active':''} onClick={()=>{setCatType('INCOME');setCatEditId(null);setCatParent('')}}>Thu</button><button className={catType==='EXPENSE'?'active':''} onClick={()=>{setCatType('EXPENSE');setCatEditId(null);setCatParent('')}}>Chi</button></div>
            <div className="panel-scroll finance-categories-panel">
              {formError&&<div className="error-box">{formError}</div>}
              <input className="search finance-category-search" value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Tìm hạng mục..."/>
              <div className="finance-category-form"><b>{catEditId?'Sửa hạng mục':'Thêm hạng mục'}</b><label>Tên hạng mục<input value={catName} onChange={e=>setCatName(e.target.value)}/></label><label>Nhóm cha<select value={catParent} onChange={e=>setCatParent(e.target.value)}><option value="">Không có</option>{categories.filter(c=>c.txType===catType&&c.active&&c.id!==catEditId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Ghi chú<textarea rows={2} value={catNote} onChange={e=>setCatNote(e.target.value)}/></label><div className="form-actions">{catEditId&&<button className="button" onClick={()=>{setCatEditId(null);setCatName('');setCatParent('');setCatNote('')}}>Huỷ sửa</button>}<button className="button primary" onClick={saveCategory}>Lưu hạng mục</button></div></div>
              <div className="finance-category-list">{categories.filter(c=>c.txType===catType&&(!catSearch.trim()||[c.name,c.code,c.note??''].join(' ').toLowerCase().includes(catSearch.toLowerCase()))).map(c=><div className={'finance-category-row '+(!c.active?'inactive':'')} key={c.id}><div><b>{c.name}</b><span>{c.parentId?'↳ '+(categoryMap.get(c.parentId)?.name??'Nhóm cha'):c.code}{c.system?' · Hệ thống':''}</span></div><div><button className="button small" onClick={()=>editCategory(c)}>Sửa</button>{!c.system&&<button className="button small" onClick={()=>toggleCategory(c.id)}>{c.active?'Ngừng':'Bật'}</button>}</div></div>)}</div>
            </div>
          </>}

          {panel==='DETAIL'&&selectedDetail&&<>
            <div className="panel-head"><div><span className="eyebrow">CHI TIẾT CHỨNG TỪ</span><h2>{selectedDetail.code}</h2></div><button className="close" onClick={()=>setPanel('NONE')}>×</button></div>
            <div className="panel-tabs"><button className={detailTab==='INFO'?'active':''} onClick={()=>setDetailTab('INFO')}>Thông tin</button><button className={detailTab==='REF'?'active':''} onClick={()=>setDetailTab('REF')}>Tham chiếu</button><button className={detailTab==='HISTORY'?'active':''} onClick={()=>setDetailTab('HISTORY')}>Lịch sử</button></div>
            <div className="panel-scroll">
              {formError&&<div className="error-box">{formError}</div>}
              {detailTab==='INFO'&&<><div className="detail-grid"><div><span>Loại</span><b>{labelType(selectedDetail.type)}</b></div><div><span>Trạng thái</span><b>{labelStatus(selectedDetail.status)}</b></div><div><span>Thời gian</span><b>{new Date(selectedDetail.occurredAt).toLocaleString('vi-VN')}</b></div><div><span>Phương thức</span><b>{labelPayment(selectedDetail.payment)}</b></div><div className="full"><span>Đối tượng</span><b>{selectedDetail.counterparty||'—'}</b></div><div><span>Tiền mặt</span><b>{money(selectedDetail.cashAmount)}</b></div><div><span>Chuyển khoản</span><b>{money(selectedDetail.transferAmount)}</b></div><div className="full"><span>Tổng phiếu</span><b>{money(totalDoc(selectedDetail))}</b></div></div><h3>Chi tiết hạng mục</h3><div className="finance-detail-lines">{selectedDetail.lines.map(l=><div key={l.id}><span><b>{categoryMap.get(l.categoryId)?.name??'Hạng mục'}</b><small>{l.description}</small></span><strong>{money(l.amount)}</strong></div>)}</div>{selectedDetail.note&&<div className="finance-note"><span>Ghi chú</span><b>{selectedDetail.note}</b></div>}</>}
              {detailTab==='REF'&&<div className="detail-grid"><div><span>Nguồn</span><b>{selectedDetail.source}</b></div><div><span>Mã tham chiếu</span><b>{selectedDetail.source==='Nhập tay'?'—':selectedDetail.code}</b></div><div className="full"><span>Liên kết nghiệp vụ</span><b>{selectedDetail.source==='POS'?'Đơn bán / POS':selectedDetail.source==='Đối soát'?'Đợt thanh toán Shipper':selectedDetail.source==='Công nợ khách hàng'?'Phiếu thu công nợ':selectedDetail.source==='Bill ngân hàng'?'Ảnh bill ngân hàng':'Chứng từ thủ công'}</b></div></div>}
              {detailTab==='HISTORY'&&<div className="finance-history-list"><div><b>Tạo chứng từ</b><span>{new Date(selectedDetail.occurredAt).toLocaleString('vi-VN')}</span></div>{selectedDetail.status==='POSTED'&&<div><b>Ghi nhận vào sổ</b><span>Đã ghi nhận</span></div>}{selectedDetail.status==='DRAFT'&&<div><b>Trạng thái hiện tại</b><span>Đang chờ xử lý</span></div>}{selectedDetail.status==='CANCELLED'&&<div><b>Huỷ chứng từ</b><span>{selectedDetail.cancelReason||'Không có lý do'}</span></div>}</div>}
              {selectedDetail.status==='DRAFT'&&<div className="panel-action-row"><button className="button primary" onClick={()=>editDraft(selectedDetail)}>Sửa phiếu nháp</button></div>}
              {selectedDetail.status!=='CANCELLED'&&<div className="finance-cancel-box"><label>Lý do huỷ<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Bắt buộc khi huỷ"/></label><button className="button finance-danger-button" onClick={cancelDocument}>Huỷ phiếu</button></div>}
            </div>
          </>}
        </aside>}
      </div>
    </main>
  </div>
}

function Header({title,desc,actions}:{title:string,desc:string,actions?:ReactNode}){
  return <header className="page-head finance-page-head"><div><span className="module-eyebrow">TÀI CHÍNH</span><h1>{title}</h1><p>{desc}</p></div>{actions&&<div className="head-actions">{actions}</div>}</header>
}

function PeriodBar({period,from,to,onPeriod,onFrom,onTo}:{period:Period,from:string,to:string,onPeriod:(p:Period)=>void,onFrom:(s:string)=>void,onTo:(s:string)=>void}){
  const opts:[Period,string][]=[['all','Toàn thời gian'],['today','Hôm nay'],['7d','7 ngày'],['month','Tháng này'],['custom','Tùy chọn']]
  return <div className="finance-period-tabs finance-period-controls">{opts.map(([p,label])=><button key={p} type="button" className={period===p?'active-preview':''} onClick={()=>onPeriod(p)}>{label}</button>)}{period==='custom'&&<div className="finance-custom-range"><input type="date" value={from} onChange={e=>onFrom(e.target.value)}/><span>→</span><input type="date" value={to} onChange={e=>onTo(e.target.value)}/></div>}</div>
}

function SortHead({label,k,active,dir,onSort}:{label:string,k:SortKey,active:boolean,dir:SortDir,onSort:(k:SortKey)=>void}){
  return <th><button className="finance-sort-head" onClick={()=>onSort(k)}>{label}{active?<span>{dir==='asc'?'↑':'↓'}</span>:null}</button></th>
}

function Overview({docs,categories,income,expense,period,from,to,onPeriod,onFrom,onTo,onOpenCashflow}:{docs:DocumentRow[],categories:Map<string,Category>,income:number,expense:number,period:Period,from:string,to:string,onPeriod:(p:Period)=>void,onFrom:(s:string)=>void,onTo:(s:string)=>void,onOpenCashflow:(type:'ALL'|TxType,status?:'ALL'|DocStatus)=>void}){
  const posted=docs.filter(d=>d.status==='POSTED')
  const shipper=posted.filter(d=>d.source==='Đối soát')
  const tip=shipper.flatMap(d=>d.lines).filter(l=>l.categoryId==='tip').reduce((s,l)=>s+l.amount,0)
  const debt=customerSeed.reduce((s,x)=>s+x.debt,0)
  const byCat=new Map<string,number>()
  posted.filter(d=>d.type==='EXPENSE').flatMap(d=>d.lines).forEach(l=>{const n=categories.get(l.categoryId)?.name??'Khác';byCat.set(n,(byCat.get(n)??0)+l.amount)})
  const catRows=[...byCat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);const max=Math.max(1,...catRows.map(x=>x[1]))
  const recent=[...docs].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()).slice(0,7)
  return <div className="finance-screen"><Header title="Tổng quan tài chính" desc="Dòng tiền, công nợ và đối soát trên một màn hình."/><PeriodBar period={period} from={from} to={to} onPeriod={onPeriod} onFrom={onFrom} onTo={onTo}/>
    <section className="finance-kpi-grid finance-overview-kpis">
      <button className="finance-kpi" onClick={()=>onOpenCashflow('INCOME')}><span>Tổng thu</span><b className="income">{money(income)}</b><small>Click để lọc Thu</small></button>
      <button className="finance-kpi" onClick={()=>onOpenCashflow('EXPENSE')}><span>Tổng chi</span><b className="expense">{money(expense)}</b><small>Click để lọc Chi</small></button>
      <button className="finance-kpi" onClick={()=>onOpenCashflow('ALL','POSTED')}><span>Dòng tiền ròng</span><b>{money(income-expense)}</b><small>Thu − Chi</small></button>
      <button className="finance-kpi warning"><span>Phải thu khách hàng</span><b>{money(debt)}</b><small>{customerSeed.filter(x=>x.debt>0).length} khách còn nợ</small></button>
      <button className="finance-kpi"><span>Đợt đối soát</span><b>{shipper.length}</b><small>{shipperSeed.filter(x=>x.status==='PENDING').length} đợt chờ</small></button>
      <button className="finance-kpi warning"><span>Tip Shipper</span><b>{money(tip)}</b><small>Tự tách từ đối soát</small></button>
    </section>
    <section className="finance-overview-grid"><div className="card finance-overview-card"><div className="card-head"><div><h2>Giao dịch gần nhất</h2><span>{recent.length} chứng từ</span></div></div><div className="finance-daily-list">{recent.map(d=><div key={d.id}><b>{d.code}</b><span className={d.type==='INCOME'?'income':'expense'}>{d.type==='INCOME'?'+ ':'− '}{money(totalDoc(d))}</span><span>{d.source}</span><strong>{labelStatus(d.status)}</strong></div>)}</div></div><div className="card finance-overview-card"><div className="card-head"><div><h2>Cơ cấu chi</h2><span>Top hạng mục</span></div></div><div className="finance-category-bars">{catRows.length?catRows.map(([name,value])=><div key={name}><div><span>{name}</span><b>{money(value)}</b></div><i><em style={{width:Math.max(3,Math.round(value/max*100))+'%'}}/></i></div>):<div className="empty compact">Chưa có khoản chi.</div>}</div></div></section>
  </div>
}

function Cashflow(p:{
  docs:DocumentRow[],allCount:number,incomeCount:number,expenseCount:number,categories:Category[],categoryMap:Map<string,Category>,income:number,expense:number,draftCount:number,
  search:string,setSearch:(s:string)=>void,filterType:'ALL'|TxType,setFilterType:(v:'ALL'|TxType)=>void,filterCategory:string,setFilterCategory:(v:string)=>void,
  filterSource:string,setFilterSource:(v:string)=>void,filterMethod:'ALL'|Payment,setFilterMethod:(v:'ALL'|Payment)=>void,filterStatus:'ALL'|DocStatus,setFilterStatus:(v:'ALL'|DocStatus)=>void,
  sources:string[],period:Period,from:string,to:string,onPeriod:(x:Period)=>void,onFrom:(s:string)=>void,onTo:(s:string)=>void,resetFilters:()=>void,
  sortKey:SortKey,sortDir:SortDir,onSort:(k:SortKey)=>void,page:number,maxPage:number,pageSize:number,setPage:(n:number)=>void,setPageSize:(n:number)=>void,
  columnOrder:ColumnKey[],hiddenColumns:ColumnKey[],columnMenu:boolean,setColumnMenu:(v:boolean)=>void,draggedColumn:ColumnKey|null,setDraggedColumn:(v:ColumnKey|null)=>void,onToggleColumn:(k:ColumnKey)=>void,onMoveColumn:(from:ColumnKey,to:ColumnKey)=>void,onResetColumns:()=>void,
  onCreate:(t:TxType)=>void,onBill:()=>void,onCategories:()=>void,onDetail:(id:string)=>void
}){
  return <div className="finance-screen"><Header title="Thu / Chi" desc="Phiếu thu, Phiếu chi, Hạng mục và dòng tiền trên cùng một sổ." actions={<><button className="button" onClick={p.onBill}>Đọc bill ngân hàng</button><button className="button" onClick={p.onCategories}>Hạng mục</button><button className="button" onClick={()=>p.onCreate('INCOME')}>+ Phiếu thu</button><button className="button primary" onClick={()=>p.onCreate('EXPENSE')}>+ Phiếu chi</button></>}/>
    <PeriodBar period={p.period} from={p.from} to={p.to} onPeriod={p.onPeriod} onFrom={p.onFrom} onTo={p.onTo}/>
    <section className="finance-kpi-grid"><button className="finance-kpi" onClick={()=>p.setFilterType('INCOME')}><span>Tổng thu</span><b className="income">{money(p.income)}</b><small>Trong kỳ đang chọn</small></button><button className="finance-kpi" onClick={()=>p.setFilterType('EXPENSE')}><span>Tổng chi</span><b className="expense">{money(p.expense)}</b><small>Trong kỳ đang chọn</small></button><button className="finance-kpi" onClick={()=>p.setFilterStatus('POSTED')}><span>Dòng tiền ròng</span><b>{money(p.income-p.expense)}</b><small>Thu − Chi</small></button><button className="finance-kpi" onClick={()=>p.setFilterType('INCOME')}><span>Số phiếu thu</span><b>{p.incomeCount}</b><small>Trong kỳ đang chọn</small></button><button className="finance-kpi" onClick={()=>p.setFilterType('EXPENSE')}><span>Số phiếu chi</span><b>{p.expenseCount}</b><small>Trong kỳ đang chọn</small></button><button className="finance-kpi warning" onClick={()=>p.setFilterStatus('DRAFT')}><span>Chờ xử lý</span><b>{p.draftCount}</b><small>Phiếu nháp</small></button></section>
    <div className="finance-toolbar finance-toolbar-complete">
      <input className="search" value={p.search} onChange={e=>p.setSearch(e.target.value)} placeholder="Tìm mã phiếu / nội dung / đối tượng..."/>
      <select value={p.filterType} onChange={e=>p.setFilterType(e.target.value as 'ALL'|TxType)}><option value="ALL">Thu / Chi</option><option value="INCOME">Thu</option><option value="EXPENSE">Chi</option></select>
      <select value={p.filterCategory} onChange={e=>p.setFilterCategory(e.target.value)}><option value="ALL">Hạng mục</option>{p.categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={p.filterSource} onChange={e=>p.setFilterSource(e.target.value)}><option value="ALL">Nguồn</option>{p.sources.map(src=><option key={src} value={src}>{src}</option>)}</select>
      <select value={p.filterMethod} onChange={e=>p.setFilterMethod(e.target.value as 'ALL'|Payment)}><option value="ALL">Phương thức</option><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="COMBINED">Kết hợp</option></select>
      <select value={p.filterStatus} onChange={e=>p.setFilterStatus(e.target.value as 'ALL'|DocStatus)}><option value="ALL">Trạng thái</option><option value="POSTED">Đã ghi nhận</option><option value="DRAFT">Nháp</option><option value="CANCELLED">Đã huỷ</option></select>
      <button className="button small" onClick={p.resetFilters}>Xoá lọc</button>
      <div className="finance-column-manager-wrap">
        <button className={'button small finance-column-button '+(p.columnMenu?'active':'')} type="button" onClick={()=>p.setColumnMenu(!p.columnMenu)}>☷ Cột</button>
        {p.columnMenu&&<div className="finance-column-manager-menu" onClick={e=>e.stopPropagation()}>
          <div className="finance-column-menu-head"><div><b>Hiển thị & thứ tự cột</b><span>Kéo ⋮⋮ để sắp xếp</span></div><button type="button" onClick={p.onResetColumns}>Đặt lại</button></div>
          <div className="finance-column-menu-list">{p.columnOrder.map(key=>{
            const hidden=p.hiddenColumns.includes(key)
            return <div className={'finance-column-menu-row '+(hidden?'hidden':'')} key={key} draggable onDragStart={()=>p.setDraggedColumn(key)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(p.draggedColumn)p.onMoveColumn(p.draggedColumn,key);p.setDraggedColumn(null)}} onDragEnd={()=>p.setDraggedColumn(null)}>
              <span className="finance-drag-handle" title="Kéo để đổi vị trí">⋮⋮</span>
              <label><input type="checkbox" checked={!hidden} onChange={()=>p.onToggleColumn(key)}/><span>{COLUMN_LABELS[key]}</span></label>
            </div>
          })}</div>
        </div>}
      </div>
      <span className="toolbar-note">{p.allCount} giao dịch</span>
    </div>
    {(()=>{
      const visible=p.columnOrder.filter(key=>!p.hiddenColumns.includes(key))
      const renderCell=(d:DocumentRow,key:ColumnKey)=>{
        const total=totalDoc(d)
        const cats=[...new Set(d.lines.map(line=>p.categoryMap.get(line.categoryId)?.name??'Hạng mục'))].join(', ')
        const content=d.lines.length===1?d.lines[0].description:d.lines.length+' hạng mục'
        switch(key){
          case 'time':return <td key={key}>{new Date(d.occurredAt).toLocaleString('vi-VN')}</td>
          case 'code':return <td key={key} className="strong finance-code">{d.code}</td>
          case 'type':return <td key={key}><span className={'finance-type '+(d.type==='INCOME'?'income':'expense')}>{labelType(d.type)}</span></td>
          case 'category':return <td key={key} className="finance-category-cell">{cats}</td>
          case 'content':return <td key={key} className="truncate">{content}</td>
          case 'counterparty':return <td key={key}>{d.counterparty||'—'}</td>
          case 'source':return <td key={key}>{d.source}</td>
          case 'method':return <td key={key}>{labelPayment(d.payment)}</td>
          case 'income':return <td key={key} className="money finance-money income">{d.type==='INCOME'?money(total):'—'}</td>
          case 'expense':return <td key={key} className="money finance-money expense">{d.type==='EXPENSE'?money(total):'—'}</td>
          case 'status':return <td key={key}><span className={'finance-status '+d.status.toLowerCase()}>{labelStatus(d.status)}</span></td>
        }
      }
      return <div className="card table-card finance-table-card"><table className="table finance-table"><thead><tr>{visible.map(key=><SortHead key={key} label={COLUMN_LABELS[key]} k={key} active={p.sortKey===key} dir={p.sortDir} onSort={p.onSort}/>)}</tr></thead><tbody>
        {!p.docs.length?<tr><td colSpan={visible.length} className="empty">Không có giao dịch phù hợp.</td></tr>:p.docs.map(d=><tr key={d.id} onClick={()=>p.onDetail(d.id)}>{visible.map(key=>renderCell(d,key))}</tr>)}
      </tbody></table></div>
    })()}
    <div className="finance-pagination"><span>Trang {p.page}/{p.maxPage}</span><div><button className="button small" disabled={p.page<=1} onClick={()=>p.setPage(p.page-1)}>‹</button><button className="button small" disabled={p.page>=p.maxPage} onClick={()=>p.setPage(p.page+1)}>›</button><select value={p.pageSize} onChange={e=>p.setPageSize(Number(e.target.value))}><option value={10}>10 dòng</option><option value={20}>20 dòng</option><option value={50}>50 dòng</option></select></div></div>
  </div>
}

function Settlement({mode,setMode,view,setView,period,from,to,onPeriod,onFrom,onTo,search,setSearch,status,setStatus,shipperRows,customerRows,onOpenHub}:{mode:SettlementMode,setMode:(m:SettlementMode)=>void,view:SettlementView,setView:(v:SettlementView)=>void,period:Period,from:string,to:string,onPeriod:(p:Period)=>void,onFrom:(s:string)=>void,onTo:(s:string)=>void,search:string,setSearch:(s:string)=>void,status:'ALL'|SettlementStatus,setStatus:(s:'ALL'|SettlementStatus)=>void,shipperRows:ShipperBatch[],customerRows:CustomerRow[],onOpenHub:(hub:string)=>void}){
  const cod=shipperRows.reduce((sum,x)=>sum+x.cod,0),transferred=shipperRows.reduce((sum,x)=>sum+x.transferred,0),tip=shipperRows.reduce((sum,x)=>sum+x.tip,0)
  const debt=customerRows.reduce((sum,x)=>sum+x.debt,0),paid=customerRows.reduce((sum,x)=>sum+x.paid,0)
  const hubGroups=[...new Set(shipperRows.map(x=>x.hub))].map(hub=>{
    const batches=shipperRows.filter(x=>x.hub===hub)
    return {hub,batches,shippers:[...new Set(batches.map(x=>x.shipper))],orders:batches.reduce((sum,x)=>sum+x.orders,0),cod:batches.reduce((sum,x)=>sum+x.cod,0),transferred:batches.reduce((sum,x)=>sum+x.transferred,0),tip:batches.reduce((sum,x)=>sum+x.tip,0),pending:batches.filter(x=>x.status==='PENDING').length}
  }).sort((a,b)=>b.pending-a.pending||b.cod-a.cod)

  return <div className="finance-screen"><Header title="Đối soát & Thanh toán" desc="Đối chiếu tiền Shipper theo đợt thanh toán; HUB là lớp truy vết nguồn giao trước khi nhận hàng."/>
    <div className="finance-mode-bar"><div className="segmented finance-mode-tabs"><button className={mode==='shipper'?'active':''} onClick={()=>setMode('shipper')}>Đơn nhập / Shipper</button><button className={mode==='customer'?'active':''} onClick={()=>setMode('customer')}>Khách hàng</button></div><PeriodBar period={period} from={from} to={to} onPeriod={onPeriod} onFrom={onFrom} onTo={onTo}/></div>
    <div className="finance-toolbar settlement-toolbar"><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={mode==='shipper'?'Tìm Shipper / HUB...':'Tìm khách hàng / SĐT...'}/><select value={status} onChange={e=>setStatus(e.target.value as 'ALL'|SettlementStatus)}><option value="ALL">Trạng thái</option><option value="PAID">{mode==='shipper'?'Đã thanh toán':'Đã hết nợ'}</option><option value="PENDING">{mode==='shipper'?'Chờ thanh toán':'Còn nợ'}</option></select><button className="button small" onClick={()=>{setSearch('');setStatus('ALL')}}>Xoá lọc</button></div>
    {mode==='shipper'?<>
      <div className="finance-hub-explainer"><div><b>HUB đối soát = điểm truy vết, không phải sổ tiền riêng</b><span>Dùng HUB để biết nhóm đơn nào được giao từ đâu và Shipper nào phụ trách. Tiền vẫn được ghi nhận theo từng đợt thanh toán Shipper.</span></div><div className="segmented finance-settlement-view"><button className={view==='batch'?'active':''} onClick={()=>setView('batch')}>Theo đợt thanh toán</button><button className={view==='hub'?'active':''} onClick={()=>setView('hub')}>Theo HUB</button></div></div>
      <section className="finance-kpi-grid finance-settlement-kpis"><div className="finance-kpi"><span>Đợt đối soát</span><b>{shipperRows.length}</b><small>{shipperRows.reduce((sum,x)=>sum+x.orders,0)} đơn</small></div><div className="finance-kpi"><span>Tổng COD</span><b>{money(cod)}</b></div><div className="finance-kpi"><span>Thực chuyển</span><b className="expense">{money(transferred)}</b></div><div className="finance-kpi warning"><span>Tip Shipper</span><b>{money(tip)}</b></div></section>
      {view==='batch'?<div className="finance-settlement-list">{shipperRows.length?shipperRows.map(r=><article className="card shipper-payment-batch" key={r.id}><div className="shipper-payment-batch-head"><div><span className="module-eyebrow">ĐỢT THANH TOÁN</span><h2>{r.shipper}</h2><small>HUB nguồn giao: {r.hub} · {new Date(r.occurredAt).toLocaleString('vi-VN')}</small></div><div className="shipper-payment-batch-metrics"><div><span>Đơn</span><b>{r.orders}</b></div><div><span>COD</span><b>{money(r.cod)}</b></div><div><span>Thực chuyển</span><b>{money(r.transferred)}</b></div><div><span>Tip</span><b>{money(r.tip)}</b></div><div><span>Trạng thái</span><b>{statusSettle(r.status)}</b></div></div><button className="button small" onClick={()=>onOpenHub(r.hub)}>Xem HUB →</button></div></article>):<div className="card empty">Không có đợt đối soát phù hợp.</div>}</div>
      :<div className="finance-hub-grid">{hubGroups.length?hubGroups.map(group=><button className={'finance-hub-card '+(group.pending?'pending':'')} key={group.hub} onClick={()=>onOpenHub(group.hub)}><div className="finance-hub-card-head"><div><span>HUB nguồn giao</span><b>{group.hub}</b></div>{group.pending>0?<strong>{group.pending} đợt chờ</strong>:<strong className="done">Đã đối soát</strong>}</div><div className="finance-hub-card-meta"><span>Shipper <b>{group.shippers.join(', ')}</b></span><span>Đợt <b>{group.batches.length}</b></span><span>Đơn <b>{group.orders}</b></span></div><div className="finance-hub-card-money"><div><span>COD</span><b>{money(group.cod)}</b></div><div><span>Đã chuyển</span><b>{money(group.transferred)}</b></div><div><span>Tip</span><b>{money(group.tip)}</b></div></div><small>Click để xem đơn và xử lý thanh toán</small></button>):<div className="card empty">Không có HUB phù hợp.</div>}</div>}
    </>:<>
      <section className="finance-kpi-grid finance-settlement-kpis"><div className="finance-kpi warning"><span>Phải thu</span><b>{money(debt)}</b><small>{customerRows.filter(x=>x.debt>0).length} khách còn nợ</small></div><div className="finance-kpi"><span>Khách hàng</span><b>{customerRows.length}</b></div><div className="finance-kpi"><span>Đã thu</span><b className="income">{money(paid)}</b></div><div className="finance-kpi"><span>HĐ còn nợ</span><b>{customerRows.reduce((sum,x)=>sum+x.openInvoices,0)}</b></div></section>
      <div className="card table-card finance-customer-table"><table className="table"><thead><tr><th>Khách hàng</th><th>SĐT</th><th>HĐ còn nợ</th><th>Tổng mua</th><th>Đã thu</th><th>Còn phải thu</th><th>Thu gần nhất</th></tr></thead><tbody>{customerRows.length?customerRows.map(r=><tr key={r.id}><td className="strong">{r.name}</td><td>{r.phone}</td><td>{r.openInvoices}</td><td className="money">{money(r.totalSales)}</td><td className="money finance-money income">{money(r.paid)}</td><td className="money">{money(r.debt)}</td><td>{r.lastPayment?new Date(r.lastPayment).toLocaleString('vi-VN'):'—'}</td></tr>):<tr><td colSpan={7} className="empty">Không có khách hàng phù hợp.</td></tr>}</tbody></table></div>
    </>}
  </div>
}

function Reports({docs,categories,income,expense,period,from,to,onPeriod,onFrom,onTo}:{docs:DocumentRow[],categories:Map<string,Category>,income:number,expense:number,period:Period,from:string,to:string,onPeriod:(p:Period)=>void,onFrom:(s:string)=>void,onTo:(s:string)=>void}){
  const sales=salesSeed.filter(s=>periodMatch(s.occurredAt,period,from,to))
  const revenue=sales.reduce((s,x)=>s+x.revenue,0),paid=sales.reduce((s,x)=>s+x.paid,0),debt=sales.reduce((s,x)=>s+x.debt,0),cogs=sales.reduce((s,x)=>s+x.cogs,0),gross=revenue-cogs
  const expenseBy=new Map<string,number>()
  docs.filter(d=>d.type==='EXPENSE').flatMap(d=>d.lines).forEach(l=>{const name=categories.get(l.categoryId)?.name??'Khác';expenseBy.set(name,(expenseBy.get(name)??0)+l.amount)})
  const rows=[...expenseBy.entries()].sort((a,b)=>b[1]-a[1]),max=Math.max(1,...rows.map(r=>r[1]))
  const ship=shipperSeed.filter(x=>periodMatch(x.occurredAt,period,from,to)&&x.status==='PAID')
  return <div className="finance-screen"><Header title="Báo cáo tài chính" desc="Báo cáo quản trị nội bộ: dòng tiền, công nợ và hiệu quả bán hàng."/><PeriodBar period={period} from={from} to={to} onPeriod={onPeriod} onFrom={onFrom} onTo={onTo}/>
    <section className="finance-report-section"><div className="finance-report-title"><div><span>01</span><h2>Dòng tiền</h2></div><small>Tiền thực tế đã ghi nhận</small></div><div className="finance-kpi-grid finance-report-kpis"><div className="finance-kpi"><span>Tiền vào</span><b className="income">{money(income)}</b></div><div className="finance-kpi"><span>Tiền ra</span><b className="expense">{money(expense)}</b></div><div className="finance-kpi"><span>Dòng tiền ròng</span><b>{money(income-expense)}</b></div></div></section>
    <section className="finance-report-section"><div className="finance-report-title"><div><span>02</span><h2>Hiệu quả bán hàng</h2></div><small>Báo cáo quản trị nội bộ</small></div><div className="finance-kpi-grid finance-report-kpis five"><div className="finance-kpi"><span>Doanh thu</span><b>{money(revenue)}</b><small>{sales.length} đơn bán</small></div><div className="finance-kpi"><span>Đã thu</span><b className="income">{money(paid)}</b></div><div className="finance-kpi"><span>Giá vốn</span><b>{money(cogs)}</b></div><div className="finance-kpi"><span>Lợi nhuận gộp</span><b>{money(gross)}</b></div><div className="finance-kpi warning"><span>Phải thu</span><b>{money(debt)}</b></div></div></section>
    <section className="finance-report-grid"><div className="card finance-overview-card"><div className="card-head"><div><h2>Chi theo hạng mục</h2><span>{rows.length} hạng mục phát sinh</span></div></div><div className="finance-category-bars report">{rows.length?rows.map(([name,value])=><div key={name}><div><span>{name}</span><b>{money(value)}</b></div><i><em style={{width:Math.max(3,Math.round(value/max*100))+'%'}}/></i></div>):<div className="empty compact">Chưa có khoản chi.</div>}</div></div><div className="card finance-overview-card"><div className="card-head"><div><h2>Đối soát Shipper</h2><span>{ship.length} đợt đã thanh toán</span></div></div><div className="finance-report-summary-list"><div><span>Tổng COD</span><b>{money(ship.reduce((s,x)=>s+x.cod,0))}</b></div><div><span>Thực chuyển</span><b>{money(ship.reduce((s,x)=>s+x.transferred,0))}</b></div><div><span>Tip Shipper</span><b>{money(ship.reduce((s,x)=>s+x.tip,0))}</b></div><div><span>Phiếu đã ghi nhận</span><b>{docs.length}</b></div></div></div></section>
  </div>
}
